# Places v5 design

## Decision

Use one OpenAI adapter behind the existing caption-analysis boundary. It emits
the existing text-only candidate contract; Geoapify and deterministic scoring
remain downstream authorities. This avoids a second geocoder and avoids asking
the model for geographic coordinates.

## Options

| Option | Decision | Reason |
|---|---|---|
| More regexes | Rejected | Cannot reliably cover scripts and ordering globally. |
| OpenAI textual extraction + Geoapify | Selected | Broad language coverage with independent verification. |
| OpenAI coordinates | Rejected | Violates Places coordinate-authority invariant. |

## Flow

`eligible caption -> OpenAI strict textual candidate -> schema validation -> Geoapify -> deterministic scoring -> atomic persistence`

## Safety and recovery

Requests are owner-scoped and bounded. Timeout, refusal, invalid JSON, budget
exhaustion, or ambiguous output become reviewable results. Rollback is disabling
the v5 adapter/version; no automatic data deletion occurs. Legacy approximate
cleanup is a separately approved, reversible data operation after Preview proof.
