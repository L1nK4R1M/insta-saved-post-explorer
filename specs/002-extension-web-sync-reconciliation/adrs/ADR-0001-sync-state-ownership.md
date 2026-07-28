# ADR-0001: Separate web ownership from extension archive state

Status: ACCEPTED
Date: 2026-07-28

## Context

The web sync previously combined the extension archive with identifiers returned
by the owner-scoped web session. Local export history was therefore treated as
proof that PostgreSQL already contained a post, causing false early completion.

## Decision

The web session is the sole source of website ownership identifiers. The
extension archive is used only to compute reconciliation targets. Target
progress commits after every selected post on the page succeeds, so MV3 restart
or later upload failure cannot advance the stop boundary prematurely.

## Consequences

- Existing API and message contracts remain unchanged.
- Healthy synchronization retains the first safe website-known boundary.
- Real gaps may require additional rate-limited Instagram pages.
- Residual targets produce an explicit incomplete result.
- No migration, new permission, provider or dependency is required.

## Alternatives rejected

Ignoring the archive fixes only newest contiguous gaps. Scanning the full feed
on every refresh wastes requests. Persisted archive-minus-web targets provide
the required reconciliation with the smallest compatible state addition.
