# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./
COPY packages/types/package.json packages/types/
COPY packages/runtime/package.json packages/runtime/
COPY packages/governor/package.json packages/governor/
COPY packages/meridian/package.json packages/meridian/
COPY packages/sentinel/package.json packages/sentinel/
COPY packages/coordinator/package.json packages/coordinator/
COPY packages/security/package.json packages/security/
COPY cli/package.json cli/

# Install dependencies
RUN npm install --ignore-scripts

# Copy source
COPY tsconfig.json ./
COPY packages/ packages/
COPY cli/ cli/

# Build all packages
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Security: run as non-root user
RUN addgroup -g 1001 operaxon && \
    adduser -u 1001 -G operaxon -s /bin/sh -D operaxon

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/*/dist ./packages/
COPY --from=builder /app/packages/*/package.json ./packages/
COPY --from=builder /app/cli/dist ./cli/dist
COPY --from=builder /app/cli/package.json ./cli/

# Create data directory for memory/audit
RUN mkdir -p /data/operaxon && chown -R operaxon:operaxon /data/operaxon

# Switch to non-root
USER operaxon

# Default port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -q --spider http://localhost:3000/health || exit 1

ENTRYPOINT ["node", "cli/dist/index.js"]
CMD ["start"]
