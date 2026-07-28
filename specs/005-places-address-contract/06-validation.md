# Places address contract - Validation strategy

## Red/green sequence

1. Candidate schema: address is mandatory nullable and bounded.
2. Export contract: schema v3 declares required and nullable candidate fields.
3. Resolver: address uses `text`; addressless behavior stays structured;
   provider match type is normalized.
4. Scoring: hungryconsti address becomes exact only with strong provider
   verification; different house number is blocked; city fallback remains 10 km;
   no-address baseline remains unchanged.
5. Analysis version: default is places-v2 and changes the input hash.
6. Real provider: `amenity` / rank 1 / `inner_part` becomes exact, while
   `inner_part` below 0.95 stays non-exact.
7. Persistence: an exact re-analysis removes only the old automatic approximate
   primary; a confirmed primary, canonical places, and evidence remain.
8. CLI lifecycle: the real dry-run prints success and exits 0 on Windows.

## Focused commands

```text
npm run test -- tests/unit/places-candidates.test.ts tests/unit/places-analysis-json-export.test.ts tests/unit/geoapify-resolver.test.ts tests/unit/places-scoring.test.ts tests/unit/places-caption-batch-postgres.test.ts
```

## Repository gates

```text
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

## Original-scenario proof

At minimum, a deterministic unit case uses:

```text
name: @airelleschateaudeversailles
address: 12 rue de l'Independance Americaine, 78000 Versailles
provider: amenity/inner_part/rank 1 (real) or building/full_match/rank >= 0.90
```

Expected result: `EXACT`, radius null, reasons include address verification.

The owner authorized the single-post Geoapify dry-run for
`cmrfhnykb000hjs04ndgb3avh`. Record only bounded provider/scoring metadata, not
the address. This is supporting runtime evidence, not a substitute for
deterministic tests. Do not commit the re-import or touch Production without the
later owner gate.

## Review gates

- Fixed-diff specification compliance review.
- Fixed-diff engineering quality/security review.
- `07-convergence.md` can become `PASS` only with no uncovered requirement and
  all required local gates green.
