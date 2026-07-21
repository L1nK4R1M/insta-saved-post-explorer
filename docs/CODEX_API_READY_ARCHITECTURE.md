# Codex Implementation Brief: Insta Post Explorer API-Ready Architecture

## 1. Mission

Upgrade `L1nK4R1M/insta-saved-post-explorer` so external clients such as Hermes, an MCP server, CLI tools, or future mobile apps can access the existing library through a stable, authenticated, versioned API.

The current Next.js application must remain functional. Reuse the existing server services and Prisma models. Do not rebuild the application, duplicate SQL logic, or force the web UI to call the external HTTP API when it can call server services directly.

Target branch:

```text
develop
```

Recommended working branch:

```text
feat/external-api-v1
```

## 2. Current Architecture

The repository already contains most of the required backend:

```text
src/app/                 Next.js routes and route handlers
src/features/library/    UI state, query parsing, shared library types
src/lib/import/          Import normalization and validation
src/server/              Prisma access, queries, imports, statistics
src/auth/                Administrator session authentication
prisma/                  PostgreSQL schema and migrations
```

Existing reusable services include:

```ts
queryLibraryPosts()
getLibraryPost()
getLibraryTags()
getLibraryCollections()
getLibraryStats()
getLibraryAuthors()
```

Existing routes already expose similar functionality:

```text
GET /api/posts
GET /api/posts/:id
GET /api/tags
GET /api/collections
GET /api/authors
GET /api/stats
GET /api/health
```

The new API must wrap the existing services rather than reimplement them.

## 3. Target Architecture

```text
                         ┌───────────────────────┐
                         │ Next.js Server UI    │
                         │ direct service calls │
                         └───────────┬───────────┘
                                     │
PostgreSQL ← Prisma ← Domain Services│
                                     │
                         ┌───────────┴───────────┐
                         │ Versioned HTTP API    │
                         │ /api/v1/*             │
                         └───────────┬───────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                  Hermes         MCP server      Future clients
```

Rules:

1. `src/server` is the business and data-access core.
2. The web application may call server services directly.
3. External clients must call `/api/v1`.
4. The MCP server must not access Prisma or PostgreSQL directly.
5. No endpoint may accept raw SQL.
6. Existing routes must keep their current behavior.

## 4. Scope of the First Implementation

Implement a read-only external API for:

- post search and filtering;
- post detail;
- tags;
- collections;
- authors;
- library statistics;
- API authentication;
- stable errors;
- automated tests;
- concise API documentation.

Do not implement in the first PR:

- personal Instagram-like history;
- place geocoding;
- Google Maps;
- embeddings or `pgvector`;
- write access for Hermes;
- a database-backed API-key management dashboard;
- a full MCP server.

Those are follow-up phases.

## 5. Required File Structure

Prefer this structure:

```text
src/
├── app/api/v1/
│   ├── posts/route.ts
│   ├── posts/[id]/route.ts
│   ├── tags/route.ts
│   ├── collections/route.ts
│   ├── authors/route.ts
│   └── stats/route.ts
│
├── auth/
│   └── api-key.ts
│
├── contracts/api/
│   ├── error.ts
│   ├── posts.ts
│   └── common.ts
│
└── server/
    └── existing services remain the source of truth

docs/
└── external-api.md

tests/unit/
├── api-key.test.ts
├── api-v1-posts.test.ts
└── api-v1-errors.test.ts
```

Do not move existing files unless necessary. Small additions are preferred over a large refactor.

## 6. Authentication Design

Use one high-entropy, read-only API key for V1.

Request format:

```http
Authorization: Bearer ipe_<random-secret>
```

Environment variable:

```env
EXTERNAL_API_KEY_SHA256=""
```

Generate a key locally:

```bash
node -e "console.log('ipe_' + require('crypto').randomBytes(32).toString('base64url'))"
```

Generate its SHA-256 hash:

```bash
node -e "const c=require('crypto'); const k=process.argv[1]; console.log(c.createHash('sha256').update(k).digest('hex'))" "ipe_REPLACE_ME"
```

Implementation requirements for `src/auth/api-key.ts`:

- read the Bearer token;
- reject missing or malformed headers with `401`;
- hash the provided token with SHA-256;
- compare hashes using `timingSafeEqual`;
- fail closed when the environment variable is absent in production;
- never log the raw token;
- expose a small function such as:

```ts
export function requireExternalApiKey(request: Request): void;
```

Use English comments only.

Recommended response headers:

```text
Cache-Control: private, no-store
Vary: Authorization
```

Future multi-key support may use an `ApiKey` Prisma model, but do not add that migration in V1.

## 7. API Contract

Base path:

```text
/api/v1
```

### 7.1 Search posts

```http
GET /api/v1/posts
```

Reuse `parseLibrarySearchParams()` and `queryLibraryPosts()`.

Supported parameters must remain aligned with the existing query parser:

```text
search or q
tag or tags
tagMode or tag_mode
theme
type
author
year
collection
sort
cursor
limit
random=1
```

Examples:

```http
GET /api/v1/posts?q=flan%20pistache&collection=recettes&sort=relevance&limit=20
GET /api/v1/posts?tag=Pistache&tagMode=and&limit=30
GET /api/v1/posts?author=damienpichon_&year=2026
```

Return the existing page shape unless a breaking security issue requires a DTO:

```ts
type PostPageResponse = {
  items: LibraryPost[];
  nextCursor: string | null;
  total: number;
  totalFiltered: number;
  totalLibrary: number;
};
```

List results must remain compact. Do not return full media arrays or unnecessarily large metadata when the existing service already returns a compact projection.

### 7.2 Post detail

```http
GET /api/v1/posts/:id
```

Reuse `getLibraryPost()`.

Responses:

```text
200 post
400 invalid id
401 invalid API key
404 not found
500 internal error
```

### 7.3 Tags

```http
GET /api/v1/tags
```

Reuse `getLibraryTags()`.

Response:

```json
{
  "items": [
    {
      "name": "Pistache",
      "slug": "pistache",
      "count": 12
    }
  ]
}
```

### 7.4 Collections

```http
GET /api/v1/collections
```

Reuse `getLibraryCollections()`.

### 7.5 Authors

```http
GET /api/v1/authors?q=<query>&limit=<1..50>
```

Reuse `getLibraryAuthors()` and the existing Zod constraints.

### 7.6 Statistics

```http
GET /api/v1/stats
```

Reuse `getLibraryStats()`.

Important naming rule:

- `totalLikes` currently means the sum of likes received by imported posts.
- It does not mean the number of posts liked by the owner.

Document this clearly. Do not rename it silently in V1.

## 8. Standard Error Format

All `/api/v1` routes should return the same error structure:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing API key"
  }
}
```

Suggested codes:

```text
BAD_REQUEST
UNAUTHORIZED
NOT_FOUND
RATE_LIMITED
INTERNAL_ERROR
SERVICE_UNAVAILABLE
```

Do not expose:

- stack traces;
- SQL errors;
- Prisma internals;
- environment values;
- authentication details.

Reuse the current error handling where possible, but add a V1 adapter if the existing error shape is inconsistent.

## 9. Required Corrections Before Exposing the API

Review and fix these issues without changing expected UI behavior.

### 9.1 Relevance count consistency

Verify that `countRelevantPosts()` applies every filter used by `queryRelevantPosts()`:

- theme;
- content type;
- author;
- year;
- collection;
- tags;
- search text.

The current implementation may calculate `totalFiltered` without all active filters. The count query and the result query must use the same conditions.

### 9.2 Random relevance consistency

Verify that `getRandomRelevantPost()` applies the same filters as normal relevant search, including:

- author;
- year;
- collection.

A random result must never escape the active filter set.

### 9.3 Full-text index

The relevant-search query calls:

```sql
to_tsvector('simple', search_text)
```

Add an expression GIN index through a Prisma SQL migration if no equivalent index already exists:

```sql
CREATE INDEX IF NOT EXISTS posts_search_text_fts_idx
ON posts
USING GIN (to_tsvector('simple', search_text));
```

Do not add a second equivalent index.

### 9.4 Large date-sorted queries

`queryPostsByEffectiveSavedDate()` currently loads candidate identifiers before sorting in memory. Do not rewrite it in the first PR unless tests or benchmarks show a concrete problem. Add a technical-debt note for a future SQL-native cursor implementation.

## 10. API Route Pattern

Each route should remain thin:

```ts
export async function GET(request: Request): Promise<NextResponse> {
  try {
    requireExternalApiKey(request);

    const query = parseLibrarySearchParams(
      new URL(request.url).searchParams,
    );

    const result = await queryLibraryPosts(
      query,
      getConfiguredOwnerId(),
    );

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "private, no-store",
        "Vary": "Authorization",
      },
    });
  } catch (error: unknown) {
    return externalApiErrorResponse(error);
  }
}
```

Route handlers may:

- authenticate;
- validate input;
- call one server service;
- map the response;
- set headers.

Route handlers must not:

- import Prisma directly;
- contain raw SQL;
- duplicate search logic;
- contain business rules;
- access the browser session cookie.

## 11. Web Application Compatibility

Do not force the web UI to call `/api/v1`.

Preferred internal path:

```text
Server Component → server service → Prisma
```

Preferred external path:

```text
Hermes or MCP → /api/v1 → server service → Prisma
```

Keep current routes such as `/api/posts` unchanged unless a bug fix is shared safely by both APIs.

## 12. MCP-Ready Contract

The HTTP API should support these future MCP tools without further backend redesign:

```text
search_saved_posts
get_saved_post
list_saved_tags
list_saved_collections
search_saved_authors
get_library_stats
```

Expected mapping:

```text
search_saved_posts       → GET /api/v1/posts
get_saved_post           → GET /api/v1/posts/:id
list_saved_tags          → GET /api/v1/tags
list_saved_collections   → GET /api/v1/collections
search_saved_authors     → GET /api/v1/authors
get_library_stats        → GET /api/v1/stats
```

The MCP server should later be implemented as a separate client of this API. It must not share database credentials.

## 13. Future Data-Model Extensions

Do not implement these now, but preserve room for them.

### 13.1 Personal interactions

`Post.likesCount` is engagement received by the post. Personal likes require a separate model:

```prisma
enum InteractionType {
  SAVED
  LIKED
}

model PostInteraction {
  id         String          @id @default(cuid())
  ownerId    String          @map("owner_id")
  postId     String          @map("post_id")
  type       InteractionType
  occurredAt DateTime?       @map("occurred_at")
  importedAt DateTime        @default(now()) @map("imported_at")
  post       Post            @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@unique([ownerId, postId, type])
  @@index([ownerId, type])
  @@map("post_interactions")
}
```

### 13.2 Places

Future map support should use normalized models rather than only `metadata`:

```prisma
model Place
model PostPlace
```

Expected future routes:

```text
GET /api/v1/places
GET /api/v1/places/stats
GET /api/v1/places/geojson
```

### 13.3 Semantic search

Future hybrid search:

```text
PostgreSQL full-text search
+ pgvector similarity
+ optional reranking
```

Do not add embeddings until the V1 API is stable and measured.

## 14. Tests

Add focused tests. Avoid large snapshot files.

### Authentication

Test:

- valid token;
- missing header;
- invalid scheme;
- invalid token;
- missing production configuration;
- constant-time comparison path;
- no token leakage in error output.

### Posts API

Test:

- basic list;
- text search;
- tags with AND and OR;
- author;
- year;
- collection;
- content type;
- relevance sorting;
- cursor pagination;
- limit boundaries;
- random mode;
- unknown parameters remain harmless;
- full detail;
- not found.

### Consistency

Add regression tests proving:

- relevance result count uses the same filters as results;
- random relevance respects author, year, and collection;
- existing `/api/posts` behavior remains unchanged.

## 15. Documentation

Create `docs/external-api.md` containing only:

1. authentication;
2. endpoint table;
3. parameter table;
4. two search examples;
5. pagination example;
6. error format;
7. Hermes/MCP integration example;
8. security warning not to expose the key in browser code.

Do not generate a large framework-dependent Swagger UI in V1. A small static OpenAPI JSON is optional only if it does not duplicate contracts manually.

## 16. Environment and Deployment

Update:

```text
.env.example
docs/deployment.md
scripts/vercel-preflight.mjs
```

Add validation for:

```env
EXTERNAL_API_KEY_SHA256=""
```

Production deployment must fail closed when the external API is enabled but the key hash is invalid or absent.

Never expose the raw API key through:

- `NEXT_PUBLIC_*`;
- logs;
- route responses;
- GitHub Actions output;
- committed configuration.

Treat `package.json` as the source of truth for the Node.js version unless the repository is intentionally aligned in a separate change.

## 17. Quality Gates

Run:

```bash
npm install
npm run db:generate
npm run lint
npm run typecheck
npm run test
npm run build
```

Run relevant Playwright tests if route behavior or authentication flow affects browser journeys:

```bash
npm run test:e2e
```

Do not declare completion when any required command fails. Report existing unrelated failures separately.

## 18. Definition of Done

The implementation is complete when:

- `/api/v1` provides authenticated read-only access;
- all new routes reuse existing server services;
- existing web routes and UI still work;
- relevance counts match active filters;
- random search respects active filters;
- the full-text index exists once;
- errors are stable and do not leak internals;
- the key is never exposed client-side;
- unit tests cover authentication and main queries;
- deployment preflight validates the new secret;
- concise documentation exists;
- lint, typecheck, tests, and build pass.

## 19. Codex Execution Protocol

Follow this order:

1. Inspect the latest `develop` branch.
2. Confirm current route names and service signatures.
3. Create `feat/external-api-v1`.
4. Add API-key authentication and tests.
5. Fix relevance filter inconsistencies.
6. Add the full-text index migration if missing.
7. Add `/api/v1` routes as thin adapters.
8. Add consistent errors.
9. Update environment validation and deployment docs.
10. Run all quality gates.
11. Produce a final summary with:
    - changed files;
    - migrations;
    - endpoints;
    - environment variables;
    - test results;
    - deferred work.

## 20. Non-Negotiable Constraints

- No raw SQL endpoint.
- No Prisma access from MCP or browser code.
- No duplicated search implementation.
- No breaking changes to existing routes.
- No write permissions for Hermes in V1.
- No API key in client-side JavaScript.
- No comments in French inside code.
- No speculative large refactor.
- Prefer small cohesive functions and strict TypeScript.
- Preserve owner partitioning through `APP_OWNER_ID`.
