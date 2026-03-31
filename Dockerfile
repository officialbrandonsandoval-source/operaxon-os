FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json tsconfig.json ./
COPY packages/ ./packages/
COPY agents/ ./agents/
COPY cli/ ./cli/

RUN npm install
RUN npm run build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/cli/start.js"]
