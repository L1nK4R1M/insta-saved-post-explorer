# Places address contract

**Mode:** critical  
**Status:** approved  
**Owner:** repository owner

## Problem

Caption street addresses are currently reduced to evidence excerpts. The
geocoder cannot query the address itself, so a precise caption can resolve only
to a city and appear as an approximate 10 km zone.

## Outcomes

- `OUT-001`: A valid candidate JSONL line explicitly carries a nullable textual
  `address` field.
- `OUT-002`: A street address is sent to Geoapify as a free-form address query.
- `OUT-003`: A high-confidence, address-level provider verification can produce
  `EXACT` without requiring the candidate `name` to match the provider name.
- `OUT-004`: Existing addressless name-based scoring and all area radii retain
  their behavior.

## Functional requirements

- `REQ-001`: Require `address: string | null` on every strict place candidate;
  bound non-null values to 300 trimmed characters.
- `REQ-002`: Export schema v3 must declare every required candidate field,
  including `address`, while continuing to forbid coordinates, provider fields,
  and precision.
- `REQ-003`: When `address` is non-null, query Geoapify with free-form `text`
  built only from address/city/region/country; never include a caption or secret
  in logs or errors.
- `REQ-004`: Normalize provider `rank.match_type` in addition to the existing
  provider rank confidence.
- `REQ-005`: Score address agreement deterministically and allow an address to
  authorize `EXACT` only for a specific provider result, a matching house number,
  provider rank at least 0.90, an accepted address-level match type, and no
  contradiction. `inner_part` requires the stricter rank threshold 0.95 because
  Geoapify documents match type as the matched address level, not overall
  correctness.
- `REQ-006`: A differing house number is a contradiction and must not produce
  `EXACT`.
- `REQ-007`: A provider city/district/region result remains `APPROXIMATE`, even
  when the candidate contains an address.
- `REQ-008`: Change the default analysis version to `places-v2` so previously
  analyzed captions can be reprocessed under the new contract without colliding
  with successful v1 jobs.
- `REQ-009`: Preserve user-confirmed data and perform no automatic Production
  re-import in this code change.
- `REQ-010`: The local candidate importer must disconnect Prisma and terminate
  naturally with exit code 0 after a successful dry-run.
- `REQ-011`: When a committed re-analysis produces a new exact primary, remove
  only the previous unconfirmed automatic approximate primary link if that place
  was not also produced by the current analysis. Preserve its canonical place,
  jobs, evidence, secondary links, and every user-confirmed link.

## Non-functional requirements

- `NFR-001`: Candidate parsing stays strict and bounded at the untrusted JSONL
  boundary.
- `NFR-002`: One candidate still causes at most one bounded Geoapify request with
  the existing retry, timeout, and result limits.
- `NFR-003`: No secret, full caption, raw provider payload, or invented
  coordinate is persisted or logged.
- `NFR-004`: Focused tests, lint, typecheck, the full unit suite, and production
  build must pass before a PR is proposed.

## Invariants and compatibility

- `INV-001`: Models propose text only; only `PlaceResolver` returns coordinates.
- `INV-002`: `UNKNOWN` creates no canonical place.
- `INV-003`: A city is never converted into a fake exact pin.
- `INV-004`: Existing name-based exact matches without an address retain their
  previous confidence and precision.
- `INV-005`: Approximation radii remain 5 km district, 10 km city, 50 km county,
  and 150 km state/region.
- `INV-006`: Old candidate JSONL without `address` is intentionally rejected;
  operators must regenerate it from the v3 input.
- `INV-007`: Re-analysis may supersede an automatic approximate primary link,
  but never deletes a canonical place or historical evidence.

## Error and edge-case behavior

- `ERR-001`: Missing `address`, an overlong address, or an unknown candidate
  property causes `INVALID_RECORD` at import.
- `ERR-002`: Address present but no provider result follows the existing
  `UNKNOWN` path.
- `ERR-003`: Address present but provider returns only an area remains
  `APPROXIMATE` with the documented radius.
- `ERR-004`: Conflicting house numbers add `address_contradiction` and block
  `EXACT`.
- `ERR-005`: Address agreement without a strong provider rank/match type may be
  `PROBABLE`, but never address-authorized `EXACT`.

## Acceptance criteria

- `AC-001` verifies `REQ-001` and `REQ-002`: strict schema and export tests show
  that `address` is required, nullable, bounded, and declared in schema v3.
- `AC-002` verifies `REQ-003`: resolver tests inspect the URL and find `text`
  with the address and no caption/name leakage; addressless candidates retain
  the structured request.
- `AC-003` verifies `REQ-004` and `REQ-005`: a hungryconsti-shaped candidate and
  a `full_match` building response score `EXACT` with no radius.
- `AC-004` verifies `REQ-006`: a different house number is never `EXACT` and
  records the contradiction reason.
- `AC-005` verifies `REQ-007`: an address candidate resolved only as `city`
  remains a 10 km `APPROXIMATE` zone.
- `AC-006` verifies `REQ-008`: default exports use `places-v2` and the resulting
  hash differs from v1 for otherwise identical input.
- `AC-007` verifies compatibility: existing no-address scoring cases and all
  quality gates remain green.
- `AC-008` verifies the real Geoapify `amenity` / rank 1 / `inner_part` response
  for hungryconsti scores `EXACT`, while `inner_part` below 0.95 remains non-exact.
- `AC-009` verifies a committed exact re-analysis removes only the previous
  automatic approximate primary link and preserves a user-confirmed approximate
  primary plus all canonical places.
- `AC-010` verifies the real dry-run exits 0 after printing a successful report.

## Test seams

| Seam | Behaviors | Existing or new | Evidence method |
|---|---|---|---|
| `placeCandidateSchema` | `REQ-001` | Existing | `places-candidates.test.ts` |
| `buildPlacesAnalysisInput` | `REQ-002`, `REQ-008` | Existing | `places-analysis-json-export.test.ts` |
| `GeoapifyPlaceResolver.resolve` | `REQ-003`, `REQ-004` | Existing | `geoapify-resolver.test.ts` |
| `scoreResolvedCandidate` | `REQ-005` to `REQ-007` | Existing | `places-scoring.test.ts` |
| caption export/hash | `REQ-008` | Existing | `places-caption-batch-postgres.test.ts` |
| `persistMetadataAnalysis` | `REQ-009`, `REQ-011` | Existing | `places-analysis-postgres.test.ts` |
| candidate importer CLI | `REQ-010` | Existing | real develop dry-run + CI gates |

## Out of scope

- Automatic Production re-analysis or canonical place cleanup.
- A second geocoder, batch-geocoding API, deep media analysis, or schema migration.
- Parsing a free-form address into model-supplied coordinates or provider fields.

## Assumptions and risks

- `ASM-001`: Geoapify returns `rank.confidence` and `rank.match_type` for normal
  address results; missing values degrade safely below address-authorized exact.
- `RSK-001`: A false address match could create a wrong exact pin. Mitigation:
  matching house number, provider rank, provider match type, specific result
  type, and contradiction gates are all required.
