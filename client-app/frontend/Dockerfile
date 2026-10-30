# ── Stage 1: install dependencies ─────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
# Downloads on a flaky link: a stalled request gives up after a minute and is
# retried (up to ten times) rather than sitting for ten minutes and aborting
# the whole install. The npm cache is a BuildKit cache mount, kept between
# builds, so a second attempt reuses every tarball the first one managed to
# fetch instead of starting from nothing. (`npm cache clean` used to wipe it
# on every build, which is the opposite of what a bad connection needs.)
# With the lockfile copied in, `npm ci` installs exactly what the repo pins.
RUN --mount=type=cache,id=npm-cache,target=/root/.npm,sharing=locked \
    npm config set fetch-timeout 60000 \
 && npm config set fetch-retry-mintimeout 2000 \
 && npm config set fetch-retry-maxtimeout 30000 \
 && npm config set fetch-retries 10 \
 && npm config set maxsockets 4 \
 && npm ci --prefer-offline

# ── Stage 2: build ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# .env.local is copied in via COPY . . above — Next.js reads NEXT_PUBLIC_* from
# it automatically during build. Both proxy settings are emptied here: the
# /api rewrite is fixed at build time, so a value from .env.local would bake
# a proxy to the container's own localhost into the image. Behind Docker,
# nginx routes /api instead (next.config.ts adds no rewrite when both are empty).
ENV NEXT_PUBLIC_API_URL=""
ENV API_PROXY_TARGET=""
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Webpack, not Turbopack: on Alpine (linux/x64 musl) only the WebAssembly SWC
# bindings load, and Turbopack refuses to build without the native ones. The
# `dev` script makes the same choice (`next dev --webpack`).
RUN npx next build --webpack

# ── Stage 3: runtime ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public                                 ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
