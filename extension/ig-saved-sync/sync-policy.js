function normalizedIdentifier(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function normalizedPostIdentity(value) {
  if (value && typeof value === "object") {
    return {
      pk: normalizedIdentifier(value.pk ?? value.externalId),
      code: normalizedIdentifier(value.code ?? value.postCode),
    };
  }
  return { pk: normalizedIdentifier(value), code: null };
}

function postIdentifiers(post) {
  const identity = normalizedPostIdentity(post);
  return [identity.pk, identity.code].filter(Boolean);
}

export function canonicalizePostIdentities(...groups) {
  const records = [];
  const byPk = new Map();
  const byCode = new Map();

  for (const value of groups.flat()) {
    const identity = normalizedPostIdentity(value);
    if (!identity.pk && !identity.code) continue;
    const matches = new Set([
      identity.pk ? byPk.get(identity.pk) : null,
      identity.code ? byCode.get(identity.code) : null,
    ].filter(Boolean));
    let record = [...matches].sort((left, right) => left.index - right.index)[0];
    if (!record) {
      record = { ...identity, index: records.length, active: true };
      records.push(record);
    }
    for (const duplicate of matches) {
      if (duplicate === record) continue;
      record.pk ??= duplicate.pk;
      record.code ??= duplicate.code;
      duplicate.active = false;
    }
    record.pk ??= identity.pk;
    record.code ??= identity.code;
    if (record.pk) byPk.set(record.pk, record);
    if (record.code) byCode.set(record.code, record);
  }

  return records
    .filter((record) => record.active)
    .map(({ pk, code }) => ({ pk: pk ?? null, code: code ?? null }));
}

export function isFeedPageTerminal({
  currentCursor,
  nextCursor,
  moreAvailable,
}) {
  const current = normalizedIdentifier(currentCursor);
  const next = normalizedIdentifier(nextCursor);
  return !moreAvailable || next === null || (current !== null && next === current);
}

export function buildWebsiteReconciliationTargets(
  extensionArchivePosts,
  websiteKnownPosts,
) {
  const websiteKnown = new Set(
    canonicalizePostIdentities(websiteKnownPosts ?? [])
      .flatMap(postIdentifiers),
  );
  return canonicalizePostIdentities(extensionArchivePosts ?? [])
    .filter((post) => !postIdentifiers(post).some((identifier) => websiteKnown.has(identifier)))
    .map((post) => post.pk ?? post.code)
    .filter(Boolean);
}

export function reconciliationCompletionError(remainingTargetIds) {
  const count = new Set(
    (remainingTargetIds ?? []).map(normalizedIdentifier).filter(Boolean),
  ).size;
  if (count === 0) return null;
  const noun = count === 1 ? "post exporté" : "posts exportés";
  return `La synchronisation n’a pas retrouvé ${count} ${noun} localement. Relancez un export complet puis réessayez.`;
}

export function selectWebsiteReconciliationPage(
  posts,
  websiteKnownIdentifiers,
  pendingTargetIds,
) {
  const remainingTargets = new Set(
    (pendingTargetIds ?? []).map(normalizedIdentifier).filter(Boolean),
  );
  const fresh = [];
  const pendingUploadTargetIds = [];
  let stopEarly = false;

  for (const post of posts ?? []) {
    const identifiers = postIdentifiers(post);
    const primaryId = identifiers[0] ?? null;
    const matchedTargetIds = identifiers.filter((identifier) =>
      remainingTargets.has(identifier)
    );
    const isPendingTarget = matchedTargetIds.length > 0;

    const knownByWebsite = identifiers.some((identifier) =>
      websiteKnownIdentifiers.has(identifier)
    );
    if (knownByWebsite) {
      for (const identifier of matchedTargetIds) remainingTargets.delete(identifier);
      if (remainingTargets.size === 0) {
        stopEarly = true;
        break;
      }
      continue;
    }
    fresh.push(post);
    if (isPendingTarget && primaryId) {
      for (const identifier of matchedTargetIds) remainingTargets.delete(identifier);
      pendingUploadTargetIds.push(matchedTargetIds[0] ?? primaryId);
    }
  }

  return {
    fresh,
    remainingTargetIds: [...remainingTargets],
    pendingUploadTargetIds,
    stopEarly,
  };
}

export async function synchronizeWebsitePage(
  posts,
  uploadPost,
  recordUploadedPost,
  commitPage,
) {
  for (const post of posts ?? []) {
    const uploadedMediaCount = await uploadPost(post);
    await recordUploadedPost(post, uploadedMediaCount);
  }
  await commitPage();
}

export function selectLocalIncrementalPage(posts, archiveKnownIdentifiers) {
  const fresh = [];
  let stopEarly = false;

  for (const post of posts ?? []) {
    const knownLocally = postIdentifiers(post).some((identifier) =>
      archiveKnownIdentifiers.has(identifier)
    );
    if (knownLocally) {
      stopEarly = true;
      break;
    }
    fresh.push(post);
  }

  return { fresh, stopEarly };
}
