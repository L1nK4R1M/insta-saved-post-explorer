# Places v5 international address extraction

**Mode:** critical  
**Status:** draft  
**Owner:** repository owner

## Problem

Regex-only extraction misses valid international caption address orderings and
leaves old approximate areas visible instead of provider-verified results.

## Outcomes

- `OUT-001`: v5 can extract a textual address from supported international
  caption formats without generating coordinates.
- `OUT-002`: Geoapify alone verifies locations and determines coordinates.
- `OUT-003`: Approximate results are isolated per post; only verified exact
  provider identities may be shared.

## Functional requirements

- `REQ-001`: Send only the eligible post caption and minimal locale context to
  the configured OpenAI address-extraction adapter.
- `REQ-002`: The adapter returns strict existing candidate JSON: name, nullable
  address/city/region/country, category, confidence, and bounded evidence.
- `REQ-003`: The model copies or conservatively normalizes textual evidence; it
  must not infer a house number, postcode, country, coordinates, provider ID,
  or precision absent from the caption/context.
- `REQ-004`: v5 must recognize street-number-first and street-number-last
  patterns, postal codes, locality, country, diacritics, Latin and non-Latin
  scripts when stated in captions; unsupported/ambiguous text returns no
  candidate or `UNKNOWN`.
- `REQ-005`: Each candidate passes existing strict validation, Geoapify
  resolution, and deterministic scoring unchanged; no model output can create
  a pin directly.
- `REQ-006`: A committed v5 reanalysis removes only obsolete unconfirmed
  automatic approximate primary links for the same post; it preserves confirmed
  links, canonical exact places, jobs, and evidence.
- `REQ-007`: `places-v5` is a separate idempotency identity. v3 input and
  candidate schema stay compatible unless a later approved contract changes
  them.

## Non-functional requirements

- `NFR-001`: Per-post requests, output tokens, retries, timeouts, and total
  batch spend are configured and bounded.
- `NFR-002`: Captions, prompts, API keys, and raw provider payloads are not
  logged or persisted beyond existing bounded evidence.
- `NFR-003`: Provider/API failures leave the post reviewable and cannot create
  a false exact place.

## Invariants

- `INV-001`: OpenAI is textual extraction only; Geoapify is coordinate source.
- `INV-002`: `UNKNOWN` creates no canonical place.
- `INV-003`: An approximate place is never shared merely by city/area.
- `INV-004`: No user-confirmed link is removed automatically.

## Acceptance criteria

- `AC-001`: Fixture captions cover Belgian number-last, French number-first,
  US, Japanese, and Arabic-script examples; each output is strict and
  text-only.
- `AC-002`: Missing/ambiguous evidence produces no candidate or `UNKNOWN`.
- `AC-003`: A mocked OpenAI response cannot bypass Geoapify/scoring safeguards.
- `AC-004`: Persistence tests prove approximate post isolation and confirmed
  link preservation.
- `AC-005`: Develop dry-run reports cost/request metrics and zero DB writes.

## Out of scope

- Worker activation, API-key provisioning, spend approval, production reanalysis,
  map-provider replacement, and bulk deletion of legacy Places data.
