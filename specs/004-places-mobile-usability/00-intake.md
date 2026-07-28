# Places mobile usability - Intake

## Original request

Explain the 407-versus-647 discrepancy, keep the complete 2D/3D switch visible
on mobile, provide a way back from Places, display associated posts, and reduce
the city-level approximate area from 25 km to 10 km.

## Desired outcome

The public Places experience must be usable from a small screen and must expose
the already owner-scoped linked posts. Future city-level analyses and the 29
matching Production rows must use 10 km without altering unrelated records.

## Existing-system evidence

The supplied JSONL contains 407 post records and 646 candidate locations.
Production contained 51 places, 301 links and 254 distinct linked posts. The
read-only page was public while its post-loading action still required a
session. The single-row mobile toolbar was clipped by its stage container.

## Risk classification

Mode is Critical. The code correction itself is narrow and additive, but the
owner authorized a GitHub/Vercel Production promotion and a guarded Neon update
of 29 rows. No schema migration, dependency, worker, provider, eligibility rule
or public API contract is introduced.

## Production-data boundary

Only `APPROXIMATE` rows whose stored radius equals 25,000 metres are eligible
for correction. A named Neon branch must preserve the pre-change snapshot, and
the transaction must fail unless exactly 29 rows are affected.
