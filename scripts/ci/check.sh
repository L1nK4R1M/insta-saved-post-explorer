#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"

initial_state="$(git status --porcelain)"

git diff --check
while IFS= read -r script; do
    [ -z "$script" ] || bash -n "$script"
done < <(git ls-files '*.sh')

npm run lint
npm run typecheck
npm run worker:typecheck
npm run worker:test
npm run worker:test:postgres
npm test -- media-identity-postgres.test.ts
npm run worker:smoke
npm run worker:test -- container-contract.test.ts
docker build -f services/worker/Dockerfile -t insta-post-explorer-worker:ci .
npm test
npm run build

final_state="$(git status --porcelain)"
if [ "$initial_state" != "$final_state" ]; then
    echo '::error::CI validation modified repository state' >&2
    git status --short
    exit 1
fi

echo 'Insta Post Explorer validation completed successfully.'
