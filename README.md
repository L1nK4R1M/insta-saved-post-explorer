# Mosaïque — Instagram Saved Post Explorer

Mosaïque is a private, responsive library for importing, searching, filtering,
and browsing saved Instagram posts. Its selected visual direction combines a
Pinterest-like masonry view with a contextual Instagram-style detail drawer and
professional filters.

## Highlights

- Regular grid and accessible masonry views.
- Accent-insensitive search across captions, authors, themes, and tags.
- Multi-tag filters with AND/OR modes and URL-persisted state.
- Keyboard-accessible post detail with previous/next navigation.
- JSON import supporting raw arrays and exporter envelopes containing `items`.
- Bounded, idempotent import batches with per-record validation.
- PostgreSQL schema with Prisma, cursor pagination, and local sample fallback.
- Persistent `light`, `dark`, and `system` themes.
- Public read-only browsing with password-only administrator mode using a signed HTTP-only session cookie.
- Vercel, GitHub Actions, database release, and operations documentation.
- Public readiness endpoint at `GET /api/health` and deployment-secret preflight.

The selected visual reference and exact ImageGen prompt are available in
[`docs/ui-concepts`](docs/ui-concepts/README.md). Design tokens are documented in
[`docs/design-system-d.md`](docs/design-system-d.md).

## Branding

The default logo source is `resources/branding/insta-post-explorer-logo.png` and
is served by `GET /api/brand/logo`. Replace that single file to update every
in-app logo placement and the favicon. To use an externally managed logo
without changing code, set `NEXT_PUBLIC_APP_LOGO_URL` to its HTTPS URL.

## Stack

- Next.js 16 App Router, React 19, strict TypeScript
- Tailwind CSS 4 and Radix UI primitives
- PostgreSQL and Prisma 6
- Zod validation
- Vitest and Playwright
- Vercel deployment with Neon-compatible pooled/direct connections

## Requirements

- Node.js 22 or later
- npm 10 or later
- PostgreSQL 15 or later for persistent imports

The library can render the committed sample export without a database. Imports,
updates, and persistent pagination require PostgreSQL.

## Local setup

```powershell
npm install
Copy-Item .env.example .env.local
npm run db:generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For a temporary local-only preview without authentication, set
`AUTH_DISABLED=true` in `.env.local`. This flag is rejected in production and
must never be configured on Vercel.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled PostgreSQL URL used by the serverless runtime |
| `DATABASE_DIRECT_URL` | Direct PostgreSQL URL used only for migrations |
| `AUTH_SECRET` | Random secret used to sign administrator sessions |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the administrator password |
| `AUTH_DISABLED` | Explicit development-only authentication bypass |
| `APP_OWNER_ID` | Stable owner partition key for personal data |
| `NEXT_PUBLIC_APP_URL` | Canonical public application URL |
| `IMPORT_MAX_BYTES` | Server-side request limit, at most `1000000` |
| `MEDIA_HOST_ALLOWLIST` | Extra comma-separated HTTPS image hostnames |

Generate a secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Generate a password hash locally, replacing the placeholder before executing:

```powershell
node -e "require('bcryptjs').hash('replace-with-a-strong-password', 12).then(console.log)"
```

Do not commit `.env.local` or paste credentials into issues, logs, or chat.

## Database

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
```

Production releases use:

```powershell
npm run db:deploy
```

The seed command refuses to run on Vercel production unless
`ALLOW_PRODUCTION_SEED=true` is deliberately supplied.

## JSON import format

Both shapes are accepted:

```json
[
  {
    "post_url": "https://www.instagram.com/p/example/",
    "thumbnail_url": "https://example.com/thumbnail.jpg",
    "username": "example_user",
    "caption": "Caption du post",
    "main_theme": "Cuisine",
    "tags": ["recette", "protéiné"]
  }
]
```

```json
{
  "schema_version": "0.5.0",
  "items": []
}
```

Common aliases such as `postUrl`, `url`, `thumbnail`, `author`, `description`,
and `content_type` are normalized. Unsafe URLs, oversized metadata, invalid dates,
and malformed rows are rejected. The browser submits batches of at most 100 items
and 850 kB; the API independently enforces a 1 MB maximum.

The committed example is
[`resources/instagram-saved-posts.sample.json`](resources/instagram-saved-posts.sample.json).

## Quality commands

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

## Project structure

```text
prisma/                 schema, migrations, seed
src/app/                routes and API handlers
src/auth/               administrator session and authorization
src/features/library/   library UI and query state
src/lib/import/         JSON normalization and validation
src/server/             database and import services
tests/unit/             business-logic tests
tests/e2e/              browser journeys
docs/                   architecture, design, deployment, operations
```

## Deployment

See [`docs/deployment.md`](docs/deployment.md) for the deployment architecture,
[`docs/vercel-manual-checklist.md`](docs/vercel-manual-checklist.md) for every
manual Vercel/GitHub/PostgreSQL step, and
[`docs/operations.md`](docs/operations.md) for migrations, rollback, secret
rotation, and incident procedures.

The production order is intentionally explicit:

1. Provision PostgreSQL and configure pooled/direct URLs.
2. Configure authentication and application variables.
3. Deploy and validate a Vercel preview.
4. Run the protected database release workflow.
5. Promote the verified preview to production.

Database migrations are never run automatically inside every Vercel build.
The Vercel build first runs `npm run deploy:check` and fails closed when a
required secret is absent, malformed, or still contains a placeholder.

## Image strategy and limits

Instagram CDN URLs may expire. The UI reserves media space and shows a fallback
when loading fails. The data layer keeps media URLs abstract enough for a future
migration to Vercel Blob, Cloudinary, Supabase Storage, or S3 without scraping or
circumventing Instagram protections.

Known follow-up work before public or very large-scale operation includes a
50,000-record query benchmark, distributed login throttling backed by a shared
store, durable media storage, and optional worker-based streaming for JSON files
larger than 20 MB.
