# Places address candidate contract

Date: 28 July 2026  
Mode: Critical  
Target: `develop` and Preview before any Production promotion

## Problem

The candidate JSONL contract could retain a street address only inside an
evidence excerpt. Geoapify therefore resolved handle/name and city fields rather
than the address itself. A caption containing
`12 rue de l'Independance Americaine, 78000 Versailles` produced a city-level
result and an approximate 10 km zone.

## Delivered behavior

- every strict candidate now requires `address: string | null`;
- the public JSON Schema and analysis export schema v3 declare the field;
- address candidates use Geoapify free-form address geocoding;
- provider `rank.match_type` is normalized and retained as bounded metadata;
- a matching house number plus a specific provider result, rank at least 0.90,
  address-level match type, and no contradiction can authorize `EXACT` even when
  the Instagram handle differs from the provider name;
- a different house number blocks exactness;
- city-level provider results remain approximate with a 10 km radius;
- the default analysis identity advances to `places-v2`, allowing controlled
  re-analysis without colliding with successful v1 jobs.

## Compatibility

This is an intentional fail-closed JSONL contract change. Old candidate files
without `address` must be regenerated from a v3 export. Addressless candidates
remain valid by sending `address: null`, and their legacy scores are unchanged.

No Prisma migration, dependency, authentication change, worker change, API
route, or automatic data rewrite is included. Existing and user-confirmed places
are untouched.

## Rollout and rollback

1. Merge the reviewed change to `develop` and wait for the stable Preview.
2. Generate a fresh v3 input and perform a single-post dry-run for the observed
   `hungryconsti` case.
3. Audit possible coexistence with the previous automatic city link before any
   committed re-analysis.
4. Request explicit owner approval before promoting code or correcting data in
   Production.

Rollback is a code revert. No database rollback is needed because this revision
performs no automatic data operation.
