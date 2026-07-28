# Places address contract - Engineering quality and security review

Fixed diff: `bebf680..codex/places-address-contract` working tree.

## Findings

No blocker, high, medium, or low finding inside the change.

## Review notes

- Trust boundary remains strict, bounded, and text-only; coordinates/provider
  identity/precision remain forbidden from model output.
- The resolver uses the provider-documented alternative `text` request only
  when address exists and retains bounded retries/timeouts/results.
- Exact scoring cannot be obtained from provider confidence alone: textual and
  house-number agreement, specific result type, address-level match type,
  threshold, and zero contradictions are all required.
- Addressless scoring confidence is locked at its prior value in regression
  coverage; area radii and country/unknown handling are unchanged.
- Provider response storage adds only bounded match type, not a raw payload.
- No dependency, migration, authentication, public API route, secret, generated
  candidate file, or user data is included.

## Existing environmental note

The locked dependency install reports 12 high-severity advisories. This diff
does not alter dependencies or the lockfile; remediation belongs in a dedicated
dependency/security change and is not concealed as part of this feature.
