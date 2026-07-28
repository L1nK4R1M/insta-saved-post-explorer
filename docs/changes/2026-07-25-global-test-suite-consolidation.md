# Change record — global test suite consolidation

- Date: 25 July 2026
- Branch: `claude/global-test-suite-consolidation` (from `develop` `3ca846c`)
- Scope: **tests and test configuration only.** Zero production files changed.

## 1. What the audit actually found

The suite was described as "too large". Measuring it first changed what should be
done about it.

| Domain | Files | Tests | Time | Share of unit time |
| --- | ---: | ---: | ---: | ---: |
| PostgreSQL / DB invariants | 11 | 129 | 4.96 s | **61 %** |
| Pure domain, lib, parsers | 31 | 273 | 0.84 s | 10 % |
| API route handlers | 7 | 45 | 0.23 s | 3 % |
| Components (jsdom) | 5 | 19 | 2.11 s | 26 % |

Two findings decided the plan:

1. **The waste was in the browser suite, not in the unit suite.** 56 e2e scenarios
   were each run on two Playwright projects — 112 executions, 85 s. And the second
   run was largely not even different work: **every viewport-sensitive test already
   sets its own viewport** with `test.use` or `setViewportSize`, which overrides the
   project's device emulation. `mobile-toolbar.spec.ts` and the 360 px library
   scenario produced byte-identical runs on both projects.
2. **The unit suite is not where the cost is, and most of it is load-bearing.**
   61 % of unit time is the PostgreSQL suites — ownership, composite foreign keys,
   idempotence, the P2002 regression already met in production, cursors, atomic
   transactions, audit evidence. Those are exactly the tests the mission forbids
   touching, and rightly: they are the expensive ones because they cover the
   expensive risks.

A third observation, recorded so no one chases it later: the repository contains
**416 authored `it()` blocks** but vitest reports **466 tests**, because seven files
use `it.each`. Converting those to loops would have "reduced the test count" by 50
without saving a millisecond or removing a single case. It was not done.

## 2. What changed

| File | Tests before | Action | Tests after | Risk still covered |
| --- | ---: | --- | ---: | --- |
| `playwright.config.ts` | — | **MERGE** — desktop becomes the default project and runs everything; the mobile project runs only `@mobile`-tagged scenarios | — | Real device emulation is still exercised where it is the point |
| `tests/e2e/mobile-toolbar.spec.ts` | 13 × 2 = 26 | **MERGE** — 5 mobile widths → 2 (360 and 420, the boundaries); default project only | 7 × 1 = 7 | Same breakpoint, same assertions; the intermediate widths added no branch |
| `tests/e2e/places.spec.ts` | 10 × 2 = 20 | **MERGE** — route + navigation merged; URL filters + search + deep link merged; keyboard + overflow merged | 6 × 1 = 6 | Every assertion kept verbatim; parsing rules already proven in `places-query-state` |
| `tests/e2e/places-globe.spec.ts` | 7 (runtime skips) | **MERGE** — runtime `test.skip` replaced by declarative `@mobile @mobile-only` tag | 7 (6 desktop + 1 mobile) | Identical coverage; the report now shows work done instead of a wall of skips |
| `tests/e2e/library.spec.ts` | 20 × 2 = 40 | **KEEP** — scoped to the default project | 20 × 1 = 20 | Unchanged content; see §5 for why it was not merged further |
| `tests/e2e/auth-and-import.spec.ts` | 5 × 2 = 10 | **KEEP** — default project only | 5 × 1 = 5 | Auth, cookie protection, health check, idempotent import: untouched |
| `tests/e2e/visual.spec.ts` | 1 × 2 = 2 | **KEEP** — default project only | 1 × 1 = 1 | On-demand capture, unchanged |
| `tests/unit/places-cursor.test.ts` | 12 | **MERGE** — 10 `it("rejects a … token")` folded into two rejection tables | 3 | All 10 malformed inputs still asserted, plus the round-trip and url-safety |
| `tests/unit/places-candidates.test.ts` | 14 | **MERGE** — per-field schema rejections folded into two tables | 8 | All 17 rejected shapes still asserted, including every "the model must not supply this" case |

Everything else was classified **KEEP** and left byte-identical.

## 3. Before / after

| Metric | Before | After | Δ |
| --- | ---: | ---: | ---: |
| Unit test files | 54 | 54 | — |
| Unit tests | 466 | **448** | −18 (−3.9 %) |
| e2e scenarios | 56 | **46** | −10 (−18 %) |
| **e2e executions** | 112 | **46** | **−66 (−59 %)** |
| e2e actually executed (non-skipped) | 92 | **40** | −52 (−57 %) |
| Desktop / mobile split | 56 / 56 | **45 / 1** | mobile −98 % |
| e2e wall time | 84–85 s | **49–69 s** | −19 % to −41 % |
| Unit wall time | 15–21 s | 15–21 s | unchanged (see below) |
| lint / typecheck / build | 14 / 7 / 33 s | 12 / 4 / 29 s | unchanged in substance |

**The unit duration did not move, and it was not expected to.** The 18 removed
tests cost microseconds; the time is in the PostgreSQL suites, which were not
touched. Successive runs of the same suite varied between 15 s and 23 s on this
machine depending on load, so any "improvement" claimed at that scale would be
measurement noise, not a result.

**The e2e figures are given as a range on purpose.** Repeated runs of the same tree
measured 84–85 s before and 49–69 s after; browser timing on a shared machine is
noisy, and quoting a single flattering pair would overstate the precision. The
number that is *not* noisy is the execution count: 112 → 46, which is what CI
actually pays for — each execution also carrying a retry budget (`retries: 2`).

## 4. Critical tests explicitly preserved

Nothing on the protected list was removed, merged or weakened:

- **all 11 PostgreSQL suites**, untouched — ownership and cross-owner isolation,
  composite FK invariants, idempotence, the P2002 regression, opaque cursors,
  atomic transactions and rollback, migrations, worker isolation, audit evidence
  completeness (129 tests);
- **authentication and boundary**: `api-key`, `auth-config`, `auth-session`,
  `auth-token`, `sync-token`, `url-security` (HTTPS enforcement and media
  allowlist);
- **public API contract**: `api-v1-places`, `api-v1-posts`, `api-v1-errors`;
- **business logic**: `places-eligibility`, `places-merge-state`, `places-scoring`,
  `geoapify-resolver` (retries, backoff, `Retry-After`);
- **the FR-I-12 regression found in review**: `places-globe-lazy-load`, which fails
  against the pre-fix implementation;
- **e2e journeys**: authentication, idempotent import, main API read, `/places` 2D,
  `/places` 3D, WebGL fallback, one mobile journey, review-adjacent read actions,
  and the assertion that **no real provider request is ever made**.

## 5. Limits and what was deliberately not done

- **`library.spec.ts` (20 scenarios) was scoped but not merged.** It is the largest
  browser file and contains plausible merge candidates — two Masonry layout
  scenarios, two anonymous-read scenarios, one assertion that a removed sort control
  stays removed. Merging them would save perhaps 3 scenarios. Halving its cost was
  already achieved by dropping the duplicate project run, and rewriting 300 lines of
  a historical suite for a marginal further gain is a worse trade than leaving it
  legible. Recorded here as a future candidate rather than half-done now.
- **The 30–50 % global reduction target was not reached** (−3.9 % unit, −18 % e2e
  scenarios). Reaching it would have required deleting PostgreSQL suites covering
  ownership, idempotence and audit — 61 % of unit time and the highest-value tests
  in the repository. The mission forbids that, and it would have been the wrong
  trade regardless: those seconds buy real protection. The execution-level target
  **was** exceeded: −59 % executions, −98 % mobile runs.
- Component tests (19, 26 % of unit time at 111 ms each) are the next most expensive
  per test, but each one covers a behaviour no unit test can reach: lazy loading,
  WebGL fallback, URL/state synchronisation, selection across a view switch.
- `mobile-toolbar.spec.ts` now covers 2 widths instead of 5. If a regression ever
  appears at 375, 390 or 412 px specifically, that case is no longer caught — an
  accepted trade, since all five sit on the same side of the same breakpoint.

## 6. Proof that no production code was modified

```
git diff --name-only origin/develop -- src/ prisma/ package.json package-lock.json scripts/
  → (empty)

git diff --name-only origin/develop
  playwright.config.ts
  tests/e2e/mobile-toolbar.spec.ts
  tests/e2e/places-globe.spec.ts
  tests/e2e/places.spec.ts
  tests/unit/places-candidates.test.ts
  tests/unit/places-cursor.test.ts
```

No `.skip` was added, no timeout was reduced, no test was replaced by a snapshot,
and no coverage tool was introduced — verified by diff.

## 7. Verification

Run before and after, in the same environment:

```
                 before      after
npm run lint ..... 14 s       12 s      OK, 0 warning
npm run typecheck . 7 s        4 s      OK
npm run test ..... 466 tests  448 tests OK, 54 files, 0 failed
                   15.0 s     19.6 s    (same range; machine-load noise)
npm run build .... 33 s       29 s      OK
npm run test:e2e . 92 passed  40 passed OK, 46 executions (was 112)
                   84-85 s    49-69 s
```
