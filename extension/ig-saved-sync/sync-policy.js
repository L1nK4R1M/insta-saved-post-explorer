function normalizedIdentifier(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function postIdentifiers(post) {
  return [normalizedIdentifier(post?.pk), normalizedIdentifier(post?.code)]
    .filter(Boolean);
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
  extensionArchiveIds,
  websiteKnownExternalIds,
) {
  const websiteKnown = new Set(
    (websiteKnownExternalIds ?? []).map(normalizedIdentifier).filter(Boolean),
  );
  return [...new Set(
    (extensionArchiveIds ?? [])
      .map(normalizedIdentifier)
      .filter((identifier) => identifier && !websiteKnown.has(identifier)),
  )];
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
    const isPendingTarget = primaryId
      ? remainingTargets.has(primaryId)
      : false;

    const knownByWebsite = identifiers.some((identifier) =>
      websiteKnownIdentifiers.has(identifier)
    );
    if (knownByWebsite) {
      if (primaryId) remainingTargets.delete(primaryId);
      if (remainingTargets.size === 0) {
        stopEarly = true;
        break;
      }
      continue;
    }
    fresh.push(post);
    if (isPendingTarget && primaryId) {
      remainingTargets.delete(primaryId);
      pendingUploadTargetIds.push(primaryId);
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
