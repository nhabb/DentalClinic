# ── Stage 1: production dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache python3 make g++ openssl libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

# ── Stage 2: build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++ openssl libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# prisma.config.ts uses Prisma's own env() resolver which reads from a .env file,
# not just process.env. Write a dummy .env so prisma generate can run without a
# real DB. Removed after build. Real vars are injected at runtime via env_file.
RUN printf 'DATABASE_URL=postgresql://build:build@localhost:5432/build\nDIRECT_URL=postgresql://build:build@localhost:5432/build\n' > .env \
 && npx prisma generate \
 && npm run build \
 && rm -f .env

# ── Stage 3: runtime ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nestjs

# Production node_modules (native binaries compiled for Alpine)
COPY --from=deps    /app/node_modules          ./node_modules
# Prisma generated client (prisma generate writes into @prisma/client; Prisma 7 uses Wasm, no .prisma dir)
COPY --from=builder /app/node_modules/@prisma  ./node_modules/@prisma
# Compiled NestJS app
COPY --from=builder /app/dist                  ./dist

USER nestjs
EXPOSE 5000

CMD ["node", "dist/src/main"]
