# Places address contract - Architecture

## Context and constraints

The existing Phase F metadata-first flow is retained:

```text
caption export -> external textual candidates -> strict JSONL import
-> Geoapify -> deterministic scoring -> atomic persistence
```

The model remains outside the application and cannot provide coordinates,
provider identity, or precision.

## Options considered

| Option | Strengths | Costs and risks | Decision |
|---|---|---|---|
| Keep address only in evidence | No contract change | Reproduces the defect; geocoder never receives the address | Rejected |
| Parse address into house/street/postcode model fields | Highly structured | Makes an untrusted model responsible for provider structure and expands the contract | Rejected |
| Add one bounded free-form `address` field | Minimal text-only expansion; maps directly to Geoapify `text` | Intentional JSONL compatibility break | Selected |
| Add a simple scoring bonus | Small change | Can cross the exact threshold without strong provider verification | Rejected |
| Gate address-authorized exact on provider evidence | Deterministic and conservative | Requires normalizing `rank.match_type` | Selected |

## Selected design

### Modules and ownership

| Module | Responsibility | Public interface | Dependencies |
|---|---|---|---|
| `src/lib/places/candidates.ts` | Untrusted candidate validation | `placeCandidateSchema` | Zod |
| `src/server/places/analysis-json-export.ts` | Declared model-output contract | v3 JSON document | candidate constants |
| `src/server/places/resolvers/geoapify.ts` | Provider query and normalization | `PlaceResolver` | Geoapify HTTP API |
| `src/lib/places/scoring.ts` | Deterministic precision decision | `scoreResolvedCandidate` | normalized candidate/provider data |
| `src/server/places/analysis.ts` | Atomic place/link persistence and narrow primary supersession | `persistMetadataAnalysis` | Prisma transaction |
| `src/server/places/jobs.ts` | Re-analysis identity | `PLACES_ANALYSIS_VERSION` | input hash/job repository |
| `scripts/places/import-candidate-batch.ts` | Local import lifecycle | CLI | Prisma singleton |

### Data and control flow

1. Export v3 declares `address` as a required nullable candidate field.
2. External analysis copies an exact postal/street address from evidence into
   `candidate.address`; it never invents coordinates.
3. Resolver uses `text=address, city, region, country` when address exists.
   Addressless candidates retain the previous structured request.
4. Resolver normalizes provider formatted address, result type, confidence, and
   match type.
5. Scoring computes the previous score unchanged, then evaluates address
   agreement. A provider rank can raise the score only when the textual address
   agrees.
6. Address authorizes `EXACT` only if the house number agrees, result type is
   specific, rank is at least 0.90, match type is `full_match` or
   `match_by_building` (or `inner_part` with rank at least 0.95), and no
   city/country/address contradiction exists.
7. Area result types follow the existing approximate branch regardless of the
   candidate address.
8. In a committed re-analysis, a new exact primary atomically supersedes only
   the previous automatic approximate primary link when that place was not
   retained by the current analysis. The old place and evidence remain.
9. The local importer disconnects Prisma in `finally` and sets only
   `process.exitCode` on failure so Windows libuv handles close naturally.

### Failure and recovery

- Old JSONL is rejected before provider calls; regenerate it from a v3 export.
- Provider timeout/retry behavior is unchanged.
- Missing provider rank or match type degrades to probable/unknown rather than
  exact.
- Rollback is a code revert plus restoring the default analysis version; no
  database rollback is required because no schema or automatic data mutation is
  included.

### Security or safety

- `address` is trimmed, bounded, and never logged.
- The request includes only candidate location fields, never a full caption.
- Only provider-normalized coordinates are persisted.
- Conflicting house numbers are a major contradiction.
- User-confirmed links and canonical places are never deleted by supersession.

### Compatibility and rollout

- Expand/contract is explicit: exporter v3 and candidate `address` become active
  together; old JSONL intentionally fails closed.
- `places-v2` creates a new idempotency identity for controlled re-analysis.
- Deploy to `develop`/Preview, run focused and real dry-run verification, obtain
  owner approval, then promote the same reviewed revision to Production.

### Rollback

Trigger: any false exact result, unexpected contract acceptance, secret leak, or
quality-gate failure. Revert the corrective commits on `develop`; do not promote.
If already promoted later, revert the same commits in Production. Existing v1
rows remain intact because rollout never deletes them automatically.
