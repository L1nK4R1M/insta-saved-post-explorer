---
name: vibespec-implementing-changes
description: Use when implementing an approved Patch task or a ticket from a Standard or Critical change after required discovery and design gates are satisfied.
---

# Implementing Changes

## Execution contract

1. Read the current ticket, linked requirements, relevant domain terms, and directly related ADRs.
2. Confirm the public test seam and feedback command.
3. Implement one vertical slice using `vibespec-developing-with-tdd` when behavior changes.
4. Run focused checks frequently and relevant full checks before completion.
5. Keep changes inside ticket scope. Record newly discovered work rather than silently expanding scope.
6. Preserve unrelated user modifications.
7. Finish with `vibespec-reviewing-changes`, `vibespec-verifying-completion`, and `vibespec-converging-docs` as required by mode.

## Control rule

Do not commit, push, deploy, migrate, or perform destructive actions unless explicitly authorized by `.vibespec/project.yaml`, legacy `.vibespec/config.json`, repository policy, or the user.

