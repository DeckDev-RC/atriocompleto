FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Production ----
FROM node:22-alpine

WORKDIR /app

# Add tini for proper signal handling (PID 1 problem)
RUN apk add --no-cache tini

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 3001

# Health check: every 15s, timeout 5s, 3 retries = restart after ~45s of failure
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

# Use tini as init — handles SIGTERM/SIGINT properly + reaps zombie processes
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
