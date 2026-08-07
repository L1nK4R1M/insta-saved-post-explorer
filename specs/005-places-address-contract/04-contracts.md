# Places address contract - Contracts

## Candidate JSONL

Every candidate contains exactly:

| Field | Type | Required | Meaning | Constraints |
|---|---|---|---|---|
| `name` | string or null | yes | Place/POI name | trimmed, 1..200 |
| `address` | string or null | yes | Postal/street address copied from evidence | trimmed, 1..300 |
| `city` | string or null | yes | City | trimmed, 1..200 |
| `region` | string or null | yes | Region/state | trimmed, 1..200 |
| `country` | string or null | yes | Country | trimmed, 1..200 |
| `category` | enum | yes | Existing candidate category | existing closed vocabulary |
| `confidence` | number | yes | Candidate textual confidence | 0..1 |
| `evidence` | array | yes | Bounded textual evidence | maximum 8 |

`address` remains text only. Coordinates, provider fields, provider IDs, and
precision remain forbidden.

## Export document

- `schema_version`: `places-caption-analysis-input-v3`
- `candidate_output_contract.required_candidate_fields`:
  `name,address,city,region,country,category,confidence,evidence`
- `candidate_output_contract.nullable_candidate_fields`:
  `name,address,city,region,country`
- identity fields remain `post_id,input_hash,analysis_version`
- default `analysis_version`: `places-v2`

## Resolver query

- With address: `text=<address, city, region, country>` and
  `bias=countrycode:none`; do not also send structured address fields.
- Without address: retain structured `name`, `city`, `state`, `country`.
- In both paths: retain existing `limit`, `format=json`, API key, timeout, retry,
  and response limits.

## Provider normalization

Add internal `providerMatchType: string | null` from `rank.match_type`. Persist it
only as bounded Place metadata next to the existing result type/rank/attribution.
Raw payloads remain forbidden.

## Scoring contract

- Legacy score remains unchanged for addressless candidates.
- Matching address can raise confidence to the provider's bounded
  `rank.confidence` when higher than the legacy score.
- Strong address verification requires matching house number,
  `providerRank >= 0.90`, and match type `full_match` or `match_by_building`.
  Geoapify `inner_part` is accepted only at `providerRank >= 0.95`; provider
  documentation defines match type as the address level matched and rank as the
  overall correctness signal.
- `EXACT` requires the existing threshold, a specific provider result, no
  contradiction, and either the legacy name match or strong address
  verification.
- Differing house number adds one contradiction and
  `address_contradiction`.
- Provider area/country/unknown result-type handling remains authoritative.

## Link supersession contract

- Trigger only when the current committed analysis persisted an `EXACT` link.
- Delete only an existing `isPrimary=true`, `isUserConfirmed=false`,
  `precision=APPROXIMATE` link for the same owner/post when its place is absent
  from the current analysis results.
- Never delete user-confirmed or secondary links, canonical places, jobs, or
  evidence.
- Run supersession and new-primary assignment in the existing transaction.

## CLI lifecycle contract

The local importer disconnects Prisma in `finally`. It never forces a successful
`process.exit(0)`; on failure it sets `process.exitCode = 1` and lets Node close
active handles naturally.

## Migration and compatibility

No database migration or backfill occurs. JSONL v2/places-v1 artifacts are not
silently upgraded; operators regenerate them. Production data correction is a
separate approved operation after Preview validation.
