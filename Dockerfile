# Multi-stage Next.js build optimised for production.
# Uses Next's standalone output for the smallest possible runtime image.

# ───── 1. dependencies ─────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ───── 2. build ─────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Next 15 standalone output drops everything to .next/standalone/
RUN npm run build

# ───── 3. runtime ─────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Without standalone output, copy everything we need to run next start
COPY --from=builder --chown=nextjs:nodejs /app/.next        ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public       ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/lib          ./lib
COPY --from=builder --chown=nextjs:nodejs /app/scripts      ./scripts

USER nextjs
EXPOSE 3000
ENV PORT=3000

# `next start` will respect PORT if -p is not passed; package.json's
# start command pins to 3000 explicitly which is fine.
CMD ["npm", "run", "start"]
