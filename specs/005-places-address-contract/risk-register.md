# Places address contract - Risk register

| ID | Risk | Likelihood | Impact | Detection | Mitigation | Rollback trigger | Owner |
|---|---|---|---|---|---|---|---|
| `RSK-001` | Wrong address becomes exact | Medium | High | contradiction/exact regression tests and Preview sample | require house number, provider rank, match type, specific result, no contradiction | any false exact | repository owner |
| `RSK-002` | Old JSONL fails unexpectedly | High | Medium | strict parser/operator dry-run | schema v3 and explicit regeneration guide | importer ambiguity | repository owner |
| `RSK-003` | Address query leaks caption or secret | Low | High | URL/error tests | bounded address-only query and stable errors | any leakage | repository owner |
| `RSK-004` | Re-analysis duplicates old approximate links | Medium | Medium | Preview data audit before commit | no automatic re-import in this change; separate data plan | duplicate Preview result | repository owner |
| `RSK-005` | develop regresses to 25 km | Low | High | branch graph and radius tests | base work on current main descendant before PR to develop | any 25 km city radius | repository owner |

## Approval gates

| Gate | Required evidence | Approver | Status |
|---|---|---|---|
| Implementation to develop | full local gates, two reviews, convergence PASS | Codex/user workflow | Pending |
| Preview data re-analysis | single-post dry-run plus duplicate-link plan | repository owner | Pending |
| Production promotion | clean Preview validation and explicit approval | repository owner | Pending |
