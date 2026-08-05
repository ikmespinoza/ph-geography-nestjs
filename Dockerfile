# syntax=docker/dockerfile:1
#
# PH Geography API — production image (PHG-020).
#
# Four stages, because three facts about this repo rule out a single-stage build:
#
#  1. The Prisma client is *generated TypeScript* (`prisma-client` generator →
#     src/generated/prisma), which `nest build` compiles into dist/generated/prisma.
#     There is no engine binary: Prisma 7 talks to Postgres through @prisma/adapter-pg
#     and loads its query compiler from @prisma/client/runtime (a production
#     dependency). So the runtime needs `dist/` + prod node_modules and nothing else —
#     but `prisma generate` must run *before* the compiler, and it needs both
#     prisma/schema.prisma and prisma.config.ts present at install time.
#  2. A production install must skip lifecycle scripts: `postinstall` is
#     `prisma generate` (needs the prisma CLI — a devDependency) and `prepare` is
#     `husky` (likewise). `pnpm install --prod` without --ignore-scripts fails.
#  3. Migrations and the seed are dev tooling. `prisma migrate deploy` needs the CLI
#     (~42 MB) + @prisma/engines (~21 MB) and loads prisma.config.ts, which imports
#     `dotenv`; `prisma db seed` shells out to `ts-node`. A slim runtime image cannot
#     migrate or seed itself, so the `migrator` stage keeps that tooling and runs as a
#     one-shot job (see docker-compose.yml) instead of bloating the served image.
#
# Build the served image explicitly — the last stage is the default, but being
# explicit keeps CI and a local build identical:
#   docker build --target runtime -t ph-geography-api .

# ── base ────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    # Corepack fetches the pinned pnpm (packageManager in package.json) on first use
    # and would otherwise stop to ask for confirmation on a non-interactive build.
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ── deps ── full dependency tree; postinstall generates the Prisma client ────────
FROM base AS deps
# prisma.config.ts carries the schema path, so `prisma generate` needs it alongside
# the schema itself. Copied before src/ so a source edit doesn't re-run the install.
COPY package.json pnpm-lock.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ── build ── compile src/ (plus the generated client) into dist/ ─────────────────
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
# After the install, never before: `postinstall` wrote the generated client into
# src/generated/, and that directory is gitignored — so it is not in the build
# context to be overwritten, but the COPY must not precede the thing that creates it.
COPY src ./src
RUN pnpm build

# ── migrator ── one-shot schema + seed job; keeps the dev tooling fact 3 needs ────
#
# Both steps in the default command, so the image is the whole release step on its
# own — a deploy target that runs it as a pre-deploy job gets a migrated *and* seeded
# database without having to know it needs two commands. Both are idempotent:
# `migrate deploy` applies only what is pending, and the seed upserts by `code`.
# Cities cannot be written without the classifications, so the seed is not optional.
FROM build AS migrator
CMD ["sh", "-c", "pnpm db:migrate && pnpm db:seed"]

# ── runtime ── what actually ships: dist/ + production dependencies ──────────────
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
# --ignore-scripts is mandatory (fact 2), not an optimisation.
#
# The store is deleted in the same layer or it ships: pnpm's content-addressable
# store lives under PNPM_HOME and hard-links into node_modules, so removing it frees
# ~52 MB while every installed file survives (the inodes are still referenced).
# It has to happen in this RUN — a later `rm` would only mask files the layer below
# already committed. The corepack download cache goes with it, so the `pnpm` shim on
# PATH would have to re-fetch: the served image is not meant to run package scripts.
# It runs `node dist/main.js`, and the one-shot ingestion is `node dist/ingest.js`.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts \
    && rm -rf /pnpm /root/.cache
COPY --from=build /app/dist ./dist

# Unprivileged: uid 1000, present in the base image. Nothing here writes to disk —
# pino logs to stdout and Prisma keeps no scratch space — so root-owned, world-
# readable application files are fine.
USER node

EXPOSE 3000

# Liveness, deliberately — NOT /health/ready. Readiness reports *down* until the
# first ingestion populates SourceSyncState, so probing it here would mark a freshly
# started stack permanently unhealthy and restart-loop it before anyone could run the
# first scrape. Liveness answers "restart me"; readiness answers "route traffic to
# me", and belongs to the load balancer.
#
# Node 20's global fetch means no curl/wget in the image, and reading PORT keeps the
# probe pointed wherever the app is actually listening.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Exec form: node is PID 1 and receives SIGTERM directly, which is what
# enableShutdownHooks() needs to drain (Terminus starts answering 503, Prisma
# disconnects). Zombie reaping is the orchestrator's job — `init: true` in compose.
CMD ["node", "dist/main.js"]
