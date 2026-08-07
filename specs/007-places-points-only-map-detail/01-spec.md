# Places points-only map and post detail

**Mode:** critical  
**Status:** implemented, awaiting Preview verification

- `REQ-001`: Map and globe render only `EXACT` and `PROBABLE`; approximate results remain available in list/review and in the database.
- `REQ-002`: Selecting a point loads owner-scoped post details internally without adding captions to the external V1 API.
- `REQ-003`: When several posts share an exact place, the user can select each post and see its image, author, theme, caption, and Instagram link.
- `REQ-004`: Desktop map chrome uses a neutral, familiar cartographic visual language without changing provider or copying proprietary Google Maps assets.
- `INV-001`: No Places data deletion and no Production deployment are part of this change.

Acceptance: focused API/action/query/component tests pass; lint, typecheck, full tests, build and Preview smoke are required before convergence.
