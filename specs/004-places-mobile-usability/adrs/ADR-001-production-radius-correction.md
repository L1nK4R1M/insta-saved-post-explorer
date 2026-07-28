# ADR-001: Separate guarded Production radius correction

## Status

Accepted on 28 July 2026.

## Context

Future scoring needed a 10 km city-level radius while Production already held
29 approximate city records at 25 km. Silently clamping presentation would make
stored data untruthful, and coupling a database write to application deployment
would weaken the review and rollback boundary.

## Decision

Deploy the scoring code through GitHub and Vercel first. After health succeeds,
create a point-in-time Neon branch and run a separate transaction matching only
`precision = 'APPROXIMATE' AND approximation_radius_meters = 25000`. Abort unless
the affected row count equals 29.

## Consequences

The code path and existing-data correction remain independently observable and
reversible. The backup branch must be retained until the release is accepted.
Any reversal must target the backed-up IDs rather than overwrite newer writes.
