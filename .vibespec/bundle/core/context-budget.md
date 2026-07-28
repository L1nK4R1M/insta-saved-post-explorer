# Context Budget Policy

## Default loading

Load only:

1. Repository instructions.
2. The selected skill.
3. Files directly relevant to the current task.

Do not preload all core documents, profiles, templates, ADRs, specs, tickets, or historical reports.

## Size targets

- Bootstrap instructions: at most 220 words.
- Frequently triggered skill: target 220 words or fewer.
- Other skill: target 500 words or fewer.
- One canonical source per rule. Cross-reference instead of copying.

## Working-set rules

- Prefer summaries with links to source files.
- Clear or hand off context between independent tickets.
- Keep tickets small enough for one fresh agent context.
- Read only ADRs and domain terms related to touched boundaries.
- Keep generated logs and evidence outside prompts unless needed to decide or verify.
- Archive superseded change artifacts rather than carrying them forward.
