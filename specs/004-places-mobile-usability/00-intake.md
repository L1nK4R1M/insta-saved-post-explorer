# Places mobile usability - Intake

**Mode:** Critical
**Status:** Approved for implementation
**Date:** 2026-07-28

## Original request

Explain the 407-versus-647 discrepancy, keep the 2D/3D switch fully visible on
mobile, add a way back from Places, display posts associated with a selected
place, and reduce the city-level approximate area from 25 km to 10 km.

## Observed baseline

- The supplied JSONL contains 407 post records and 646 place candidates.
- Production evidence records 407 eligible posts, 51 places, 301 links and 254
  distinct linked posts.
- `/places` is readable without a session, but `loadPlacePostsAction` rejects
  the same visitor before its owner-scoped query.
- The mobile top bar keeps search, filters and the segmented control on one row
  inside an overflow-hidden stage.
- City-like provider results are assigned `25_000` metres by scoring.

## Scope decision

The implementation began as a Standard corrective change. The owner's explicit
Production deployment authorization on 28 July 2026 escalates the release to
Critical because 29 existing Neon rows must be corrected. It adds no dependency,
schema migration, API version, worker, provider, or eligibility change.

## Production-data boundary

The code changes the rule for future analyses. Production currently contains
29 `APPROXIMATE` rows at 25 km. Their update to 10 km is explicitly authorized,
must be preceded by a Neon branch backup, and must run as one bounded transaction.
