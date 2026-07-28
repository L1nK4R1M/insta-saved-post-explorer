# Places mobile usability - Specification

## Problem

The mobile view switch can be clipped, direct Places visits lack an explicit
exit, public visitors cannot load associated post thumbnails, and city-level
approximate results use 25 km instead of the requested 10 km.

## Outcome

Production exposes a complete mobile toolbar, deterministic return navigation,
owner-scoped public linked posts and truthful 10 km city-level approximation.

## Goals

- Repair the four reported Places regressions without a parallel architecture.
- Preserve authorization, owner isolation, persisted relationships and counts.
- Promote code and the bounded data correction with reversible evidence.

## Non-goals

- Do not import more posts or reinterpret 646 location candidates as posts.
- Do not change theme eligibility, review authorization, API, worker or schema.
- Do not mutate any Production row outside the exact radius predicate.

## Functional requirements

- FR-001: The complete 2D/3D segmented control remains visible at supported mobile widths.
- FR-002: The Places page provides an explicit labelled link to the post library.
- FR-003: A public selected place loads linked post summaries through the configured owner scope.
- FR-004: Place confirmation and rejection remain administrator-only operations.
- FR-005: New city-like approximate provider results use a 10,000 metre radius.
- FR-006: Operator documentation distinguishes 407 post records from 646 location candidates.
- FR-007: Production code is promoted only after successful CI and READY Preview evidence.
- FR-008: Exactly 29 existing approximate 25,000 metre rows are corrected after a Neon backup.

## Non-functional requirements

- NFR-001: The mobile page has no view-switch clipping or horizontal overflow.
- NFR-002: The change adds no schema migration or dependency and preserves aggregate relations.
- NFR-003: Rollback retains the preceding Vercel deployment and an immutable Neon snapshot.

## Invariants

Reads remain limited to `getConfiguredOwnerId()`, review writes remain
admin-authenticated, Places eligibility remains canonical `Voyages` or
`Restaurant`, and exact or non-city precision semantics remain unchanged.
