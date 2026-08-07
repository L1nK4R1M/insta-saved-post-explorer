# Places address contract - Develop release evidence

Date: 28 July 2026

## GitHub

- PR: #52
- reviewed head: `f0d44a908dc4a1062552b77e7f7a8c7977085918`
- squash merge on `develop`: `71106cc75ab16c5746c452f9332ef30df51557ca`
- CI run: #153 (`30395057656`), success
- CI jobs: lint/types/unit/build and browser tests, both success
- open review threads: 0

## Vercel Preview

- deployment: `dpl_632ZKgw3HdT6XwuCfynP3RQkBZBc`
- branch: `develop`
- commit: `71106cc75ab16c5746c452f9332ef30df51557ca`
- state: READY
- immutable deployment root: HTTP 200

## Neon develop read-only export

- branch: `develop` (`br-sparkling-glade-as9gow4m`)
- post: `cmrfhnykb000hjs04ndgb3avh`
- export schema: `places-caption-analysis-input-v3`
- analysis version: `places-v2`
- record count: 1
- business writes: false
- temporary export and candidate fixture: removed after the dry-run boundary

## External-data boundary

No live Geoapify dry-run was executed. The attempted operation was stopped
before transmission because it would send the exact caption-derived address of
the selected post to a third party. Explicit owner authorization is required
before that request and before any develop candidate import. Production code and
data remain unchanged.

This records the boundary at the time of PR #53. The owner subsequently granted
explicit authorization; the later bounded evidence is recorded in
`2026-07-28-real-dry-run-follow-up.md`.
