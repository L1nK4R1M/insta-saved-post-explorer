# Places address contract - Specification compliance review

Fixed diff: `bebf680..codex/places-address-contract` working tree.

## Findings

No blocker, high, medium, or low finding.

## Requirement review

- `REQ-001/002`: runtime Zod, public JSON Schema, and export v3 all require the
  same nullable bounded `address` field.
- `REQ-003/004`: address uses Geoapify free-form `text`; addressless structured
  requests remain; bounded provider match type is normalized.
- `REQ-005/006/007`: exactness requires every specified provider and
  contradiction gate; shared postcode does not mask a different first house
  number; area types remain approximate.
- `REQ-008`: default version is places-v2 and version changes alter the input
  hash/idempotency identity.
- `REQ-009`: no schema/data operation or confirmed-place mutation exists.

All acceptance criteria have local evidence. Preview/provider/data rollout
criteria remain correctly classified as release gates, not hidden completion
claims.
