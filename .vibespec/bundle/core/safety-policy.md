# Safety and Control Policy

Agents must not perform these actions without explicit authorization or an explicit repository policy:

- Commit or push changes.
- Merge branches or open/merge pull requests.
- Deploy to any environment.
- Run destructive database, storage, infrastructure, or account operations.
- Apply production migrations.
- Rotate, reveal, or replace secrets.
- Modify billing, access control, security policy, or external integrations.
- Delete unrelated files or discard uncommitted user work.

Prefer dry-runs, previews, reversible migrations, backups, feature flags, and staged rollout. Critical changes must state the approval point and rollback command or procedure before execution.
