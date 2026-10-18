# Base image is overridable. Cloud Build pulls the mirrored copy from Artifact
# Registry because Docker Hub returns 401 for unauthenticated CI pulls; local
# builds can override with --build-arg BASE_IMAGE=node:20-alpine.
ARG BASE_IMAGE=us-central1-docker.pkg.dev/aibuilder-manuos/manuos-repo/node:20-alpine

# Stage 1: Dependencies
FROM ${BASE_IMAGE} AS deps
# openssl is required by the Prisma query engine; libc6-compat for musl builds.
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Builder
FROM ${BASE_IMAGE} AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . ./

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Build-time placeholders only: real values are injected by Cloud Run at runtime.
# The app never queries the build database unless a route is statically rendered,
# but supplying a valid SQLite URL (and an applied schema) keeps that safe.
# BETTER_AUTH_SECRET is deliberately NOT set here: auth.ts falls back to a
# non-production default during build, and the real value comes from Secret
# Manager at runtime.
ENV DATABASE_URL="file:/tmp/manuos-build.db"

RUN npx prisma generate
RUN npx prisma migrate deploy
RUN npm run build

# Stage 3: Runner
FROM ${BASE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
# Absolute SQLite path: Prisma resolves relative file: URLs against the schema
# directory baked in at generate time, which does not exist in the runner.
ENV DATABASE_URL="file:/app/data/manuos.db"
ENV MANUOS_DATA_DIR="/app/data"
ENV MANUOS_BACKUP_DIR="/mnt/backups"
ENV MANUOS_BACKUP_INTERVAL_SECONDS="60"

# sqlite3 powers the online snapshot taken by docker-entrypoint.sh.
RUN apk add --no-cache sqlite libc6-compat openssl

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --chown=nextjs:nodejs scripts/docker-entrypoint.sh ./docker-entrypoint.sh

# Runtime migrations: bake the Prisma CLI (with its schema engine) and the
# migration history into the runner so the entrypoint can run
# `prisma migrate deploy` against a baseline restored from the bucket that
# predates this image. The CLI needs only @prisma/engines plus its helpers;
# @prisma/client is already provided by the standalone output trace.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@prisma/debug ./node_modules/@prisma/debug
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@prisma/engines-version ./node_modules/@prisma/engines-version
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@prisma/fetch-engine ./node_modules/@prisma/fetch-engine
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@prisma/get-platform ./node_modules/@prisma/get-platform
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# /app/data holds the live database (tmpfs); /app/storage is replaced by a
# symlink to durable storage by the entrypoint. Both must be writable by nextjs.
RUN chmod 755 ./docker-entrypoint.sh \
 && mkdir -p /app/data /app/storage \
 && chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 8080

ENTRYPOINT ["/app/docker-entrypoint.sh"]
