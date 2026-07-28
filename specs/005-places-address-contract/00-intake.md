# Places address contract - Intake

**Mode:** critical  
**Status:** approved for implementation  
**Owner:** repository owner

## Request

Make a caption street address a first-class textual candidate field and adapt
Geoapify resolution and deterministic scoring so a provider-verified address can
produce an exact place.

## Observed defect

The post `cmrfhnykb000hjs04ndgb3avh` (`hungryconsti`) contains
`12 rue de l'Independance Americaine, 78000 Versailles` in its caption. The
candidate contract retained the account handle as `name` but had no `address`
field. Geoapify therefore received only name/city/region/country and returned a
city result. The deterministic scorer correctly classified that city result as
`APPROXIMATE` with a 10 km radius.

## Route and gates

- Phase: corrective vertical slice inside completed Phase F2.
- Target: `develop` and Preview first; Production is excluded until owner
  approval after verification.
- Entry gate: Phase F is complete and the resolver, strict JSONL importer,
  scoring seam, and address persistence already exist.
- No Prisma migration, dependency, authentication change, worker change, or new
  API route is required.
- The branch is based on current `main`, which is a seven-commit descendant of
  `origin/develop`, so the PR to `develop` also reconciles already approved
  Production fixes and preserves the 10 km radius.

## Initial evidence

- Candidate schema: `src/lib/places/candidates.ts` has no `address`.
- Resolver: `src/server/places/resolvers/geoapify.ts` sends only structured
  name/city/state/country fields.
- Scoring: `src/lib/places/scoring.ts` can authorize `EXACT` only through a name
  match.
- Geoapify documents free-form `text` as the alternative for an address and
  returns `rank.confidence`, `rank.match_type`, `result_type`, and a formatted
  address for validation.

## Scope boundary

This change updates the contract and code path. It does not re-import or delete
existing Production places. Any data correction is a later, separately approved
rollout step after Preview evidence.
