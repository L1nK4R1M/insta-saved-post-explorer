# Backend API Profile

Load this profile for HTTP, RPC, event, or service interfaces.

## Additional gates

- Versioning, compatibility, authentication, authorization, idempotency, timeouts, limits, and error taxonomy are explicit.
- Input is validated at trust boundaries.
- Retries are bounded and safe.
- Observability covers latency, errors, saturation, and correlation.
- Contract and integration tests exercise real serialization and persistence boundaries.
- Schema evolution uses backward-compatible rollout where required.
