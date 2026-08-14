# ── VoiceCart AI Production Multi-Stage Dockerfile ──

# Stage 1: Build Frontend Dashboard
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Production Server Runner
FROM node:20-alpine AS production
WORKDIR /app

# Install system dependencies (SQLite & curl for healthcheck)
RUN apk add --no-cache curl sqlite

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./
COPY --from=client-builder /app/client/dist /app/client/dist

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/engine-status || exit 1

CMD ["node", "server.js"]
