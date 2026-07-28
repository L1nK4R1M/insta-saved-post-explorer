# Evidence

Store inspectable proof here when it does not belong directly in a Markdown table:

- test logs;
- benchmark results;
- query plans;
- screenshots;
- migration dry-run output;
- security scanner reports;
- API contract reports;
- rollout or rollback rehearsal output.

Do not store secrets, production personal data, or unnecessarily large generated files.

Current evidence:

- `2026-07-28-verification.md`: RED/GREEN history, final gates, package hash,
  review boundaries and unverified production smoke.
- `2026-07-28-production-hotfix-verification.md`: isolated `main` promotion,
  fresh production-base gates, rollback and remaining hosted smoke.
