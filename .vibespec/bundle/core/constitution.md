# VibeSpec Constitution

## Non-negotiable principles

1. **Evidence before assertion.** Completion requires fresh verification output.
2. **User control.** Commits, pushes, deployments, destructive actions, and production migrations require explicit authorization or repository policy.
3. **Smallest sufficient process.** Documentation depth follows change risk, not habit.
4. **Brownfield respect.** Existing code, contracts, naming, and tests are inspected before design.
5. **Vertical delivery.** Each implementation slice creates observable end-to-end behavior.
6. **Public-seam testing.** Tests prefer stable public interfaces over internals.
7. **Traceability.** Standard and critical requirements map to tasks, tests, and evidence.
8. **Separate review axes.** Spec compliance and engineering quality are assessed independently.
9. **No hidden scope.** Unrequested behavior is recorded as a proposal, not silently implemented.
10. **Documentation convergence.** Durable docs describe the system after the change, not the work diary.

Repository-specific rules override this pack when they are explicit and safer. Conflicts must be surfaced, not silently resolved.
