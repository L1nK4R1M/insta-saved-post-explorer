# Workflow

## Shared sequence

1. **Route** the change.
2. **Discover** relevant code, docs, history, tests, contracts, and operational constraints.
3. **Clarify** only decisions that materially change behavior, safety, architecture, or scope.
4. **Specify** the desired observable outcomes and exclusions.
5. **Design** boundaries and contracts when the mode requires it.
6. **Slice** work into independently verifiable vertical tasks.
7. **Implement** one slice at a time with a tight feedback loop.
8. **Verify** the original behavior, focused tests, full relevant suite, static checks, and build where applicable.
9. **Review** spec compliance and code quality as separate reports.
10. **Converge** durable docs and produce a handoff when work continues elsewhere.

## Mode shortcuts

Patch may combine steps 3 through 6 in one short brief. Standard and Critical keep artifacts separate enough for traceability. Critical work must identify rollback and approval gates before implementation.
