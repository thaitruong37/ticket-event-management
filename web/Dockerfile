# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS builder
WORKDIR /app
COPY . .
# Next standalone does not copy public automatically; keep the directory present even
# when the application has no public assets yet.
RUN mkdir -p public && npm run build

FROM node:22-bookworm-slim AS web-runner
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

# Operational image for the long-running worker and one-off migration/bootstrap jobs.
# It intentionally keeps dev dependencies because the repository scripts run through tsx.
FROM node:22-bookworm-slim AS ops-runner
WORKDIR /app
ENV NODE_ENV=production

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app ./

USER nextjs
CMD ["npm", "run", "worker"]
