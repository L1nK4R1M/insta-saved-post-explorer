# Develop Preview origin release evidence

Date: 2026-07-28

## Merge

- Pull request: `#42`
- Reviewed head: `fba1b2f0d50ff18c805ea835e8a23af5f49dc7d4`
- Squash merge on `develop`:
  `2b877ba043a004b925acdfae3f3decd7fbc89a44`
- `origin/develop` was fetched and resolved to the exact squash commit.

## Hosted checks

The pull-request head completed successfully:

- Lint, types, unit tests and build: PASS
- Browser tests: PASS
- Vercel Preview Comments: PASS

The squash commit completed successfully:

- Lint, types, unit tests and build: PASS
- Browser tests: PASS
- Vercel Preview Comments: PASS

## Deployment

GitHub recorded one Vercel `Preview` deployment for the squash commit with
state `success`:

```text
https://insta-saved-post-explorer-iggnl8o7f-l1nk4r1ms-projects.vercel.app
```

The installable extension artifact remains:

```text
C:\tmp\insta-saved-sync-v4.2.5.zip
SHA-256 9F842FD55066B2E88E981A1B545ABAB101E6AE0AE462D92349863FAE7E94479D
```

## Remaining operator validation

No live Preview synchronization is claimed. Replace files in the existing
unpacked extension directory, reload extension 4.2.5, open the stable develop
alias and run the documented **Actualiser les posts** smoke against the isolated
Preview database.
