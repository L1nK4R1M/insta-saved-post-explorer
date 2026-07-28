# Places mobile usability - Validation

## Validation strategy

Use unit tests for authorization/scoring contracts, focused Playwright for UI
geometry and navigation, repository gates for integration safety, and hosted
health/browser/SQL/error evidence for the authorized critical release.

## Acceptance scenarios

### AT-001: Mobile switch remains contained

Requirements: FR-001, NFR-001. EV-001 is the mobile Playwright assertion and
the 390 x 844 Production bounding rectangle.

### AT-002: Return navigation is explicit

Requirements: FR-002. EV-002 is the visible `/` link in local and Production
browser verification.

### AT-003: Public linked posts use configured owner

Requirements: FR-003. EV-003 is the action test plus a live place detail with
one linked thumbnail and zero sheet errors.

### AT-004: Review mutations remain protected

Requirements: FR-004. EV-004 is the retained non-admin confirm/reject test.

### AT-005: New city results use 10 km

Requirements: FR-005, NFR-002. EV-005 is the table-driven scoring and database
expectation evidence with no schema or dependency diff.

### AT-006: Input counts remain unambiguous

Requirements: FR-006. EV-006 is the read-only result of 407 post records and
646 candidate locations.

### AT-007: Hosted code rollout is healthy

Requirements: FR-007. EV-007 is CI #149, READY Preview and Production, HTTP 200
health/Places responses and zero initial route runtime errors.

### AT-008: Data correction is exact and reversible

Requirements: FR-008, NFR-003. EV-008 is Neon backup `br-curly-firefly-asy8hqti`,
the exact 29-row transaction, zero remaining 25 km rows and unchanged aggregates.

## Quality commands

```text
npm run lint
npm run typecheck
npm run test
npm run build
npx playwright test tests/e2e/places.spec.ts tests/e2e/places-globe.spec.ts
git diff --check
```

## Evidence ledger

| Evidence | Result |
| --- | --- |
| EV-001 / EV-002 | 6 desktop Places E2E and 1 mobile E2E passed; Production switch and link visible |
| EV-003 / EV-004 | public owner-scoped read and admin mutation guards passed; live linked post visible |
| EV-005 / EV-006 | 29 focused tests passed; 407 records / 646 candidates verified |
| EV-007 | CI #149 passed; Production `8dbfd46` READY; health/routes and runtime window clean |
| EV-008 | backup created; 29 rows corrected; aggregates unchanged |
| Repository gates | lint, typecheck, 360 tests and 32-page build passed |
