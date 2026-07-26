FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/worker/package.json services/worker/package.json
RUN npm ci
COPY services/worker services/worker
RUN npm run worker:build

FROM node:24-bookworm-slim AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/worker/package.json services/worker/package.json
RUN npm ci --omit=dev --workspace services/worker --include-workspace-root=false

FROM node:24-bookworm-slim AS runtime
RUN groupadd --gid 10001 worker && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /app/services/worker/dist ./services/worker/dist
USER 10001:10001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "services/worker/dist/index.js"]
