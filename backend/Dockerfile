# syntax=docker/dockerfile:1.7

# Pinned to the current linux/amd64 manifest digest for node:22-alpine.
# If your Swarm nodes are arm64, replace this digest with the arm64 one.
ARG NODE_BASE_IMAGE=node:22-alpine@sha256:1e8b5d68cac394f76c931b266fe5c224c3fe4cdbc33131e064c83b88235fe77e

FROM ${NODE_BASE_IMAGE} AS builder

WORKDIR /app

# Reduce npm noise during CI/container builds without changing install behavior.
ENV NPM_CONFIG_LOGLEVEL=warn

# Copy lockfiles first so dependency installation stays cached until they change.
COPY --link package*.json ./

# Single dependency install for the whole build.
# BuildKit cache keeps the npm package cache between builds without baking it into the image.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci

# Copy only the files required to compile the TypeScript backend.
COPY --link tsconfig.json ./
COPY --link src ./src

# Compile first with dev dependencies available, then prune them away in-place.
RUN npm run build \
    && npm prune --omit=dev \
    && npm cache clean --force


FROM ${NODE_BASE_IMAGE} AS runtime

WORKDIR /app

ARG OCI_IMAGE_SOURCE="https://github.com/your-org/your-repo"
ARG OCI_IMAGE_VERSION="0.0.0-dev"
ARG OCI_IMAGE_REVISION="unknown"

LABEL org.opencontainers.image.source="${OCI_IMAGE_SOURCE}" \
      org.opencontainers.image.version="${OCI_IMAGE_VERSION}" \
      org.opencontainers.image.revision="${OCI_IMAGE_REVISION}"

ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=warn
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Keep tini as PID 1 so SIGTERM/SIGINT propagate correctly in Swarm/Easypanel.
RUN apk add --no-cache \
      tini \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ttf-freefont \
    && mkdir -p /app \
    && ln -sf /usr/bin/chromium /usr/bin/chromium-browser \
    && chown node:node /app

# Copy only the runtime artifacts already prepared in the builder.
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist

EXPOSE 3001

# Liveness endpoint chosen to avoid restart loops caused by transient Redis/Supabase issues.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3001}/api/health/live" || exit 1

USER node

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
