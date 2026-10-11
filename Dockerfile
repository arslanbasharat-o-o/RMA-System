# ==============================================================================
# Multi-stage Dockerfile for containerized deployment
# ==============================================================================

FROM node:24-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat python3 make g++

# ------------------------------------------------------------------------------
# Dependencies
# ------------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ------------------------------------------------------------------------------
# Builder
# ------------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . ./
RUN mkdir -p /app/public

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ARG NEXT_PUBLIC_APP_COMMIT=unknown
ENV NEXT_PUBLIC_APP_COMMIT=${NEXT_PUBLIC_APP_COMMIT}

RUN npm run build

# ------------------------------------------------------------------------------
# Production Runner (Next.js App)
# ------------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ARG APP_VERSION=unknown
ARG VCS_REF=unknown
LABEL org.opencontainers.image.source="https://github.com/arslanbasharat-o-o/RMA-System" \
      org.opencontainers.image.version="$APP_VERSION" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.title="RMA System" \
      org.opencontainers.image.description="RMA System supports returned mobile-display intake, inspection images, identification, and staff review through a web app and background worker." \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Create private storage volume folder
RUN mkdir -p /app/data/storage && chown -R nextjs:nodejs /app/data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/release.json ./release.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src ./src

USER nextjs

EXPOSE 3000

CMD ["npm", "run", "start"]

# ------------------------------------------------------------------------------
# Background Worker Runner
# ------------------------------------------------------------------------------
FROM node:24-alpine AS worker
WORKDIR /app

ARG APP_VERSION=unknown
ARG VCS_REF=unknown
LABEL org.opencontainers.image.source="https://github.com/arslanbasharat-o-o/RMA-System" \
      org.opencontainers.image.version="$APP_VERSION" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.title="RMA System Worker" \
      org.opencontainers.image.description="RMA System supports returned mobile-display intake, inspection images, identification, and staff review through a web app and background worker." \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

RUN mkdir -p /app/data/storage && chown -R nextjs:nodejs /app/data

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/release.json ./release.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src ./src

USER nextjs

CMD ["npm", "run", "worker"]
