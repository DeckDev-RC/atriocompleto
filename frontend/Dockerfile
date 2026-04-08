# syntax=docker/dockerfile:1.7

# Pinned to the current linux/amd64 manifests.
# If your deploy target is arm64, swap these digests for the arm64 variants.
ARG NODE_BUILDER_IMAGE=node:20-alpine@sha256:42d1d5b07c84257b55d409f4e6e3be3b55d42867afce975a5648a3f231bf7e81
ARG NGINX_RUNTIME_IMAGE=nginx:alpine@sha256:c1263cc56873d66f381fd07149aa0dc7244dd7c941334cd18473c46509f08465

FROM ${NODE_BUILDER_IMAGE} AS builder

WORKDIR /app

# Keep the frontend build deterministic and quieter in CI.
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=warn

# OCI metadata placeholders for external injection during build.
ARG OCI_IMAGE_SOURCE="https://github.com/your-org/your-repo"
ARG OCI_IMAGE_VERSION="0.0.0-dev"
ARG OCI_IMAGE_REVISION="unknown"

# Declare explicit Vite build args here as needed.
# Add new pairs following the same ARG -> ENV pattern.
ARG VITE_AGENT_API_URL=""
# ARG VITE_SOME_OTHER_VALUE=""

ENV VITE_AGENT_API_URL=${VITE_AGENT_API_URL}
# ENV VITE_SOME_OTHER_VALUE=${VITE_SOME_OTHER_VALUE}

# Copy dependency manifests first to maximize cache hits.
COPY --link package*.json ./

# Cache npm's package tarballs between builds; npm ci remains the deterministic installer.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --include=dev

# Copy the rest of the Vite app only after dependencies are resolved.
COPY --link . .

# Vite build generates the hashed dist/ assets that we serve from Nginx.
RUN npm run build


FROM ${NGINX_RUNTIME_IMAGE} AS runtime

ARG OCI_IMAGE_SOURCE="https://github.com/your-org/your-repo"
ARG OCI_IMAGE_VERSION="0.0.0-dev"
ARG OCI_IMAGE_REVISION="unknown"

LABEL org.opencontainers.image.source="${OCI_IMAGE_SOURCE}" \
      org.opencontainers.image.version="${OCI_IMAGE_VERSION}" \
      org.opencontainers.image.revision="${OCI_IMAGE_REVISION}"

# Remove the default vhost and prepare writable paths for a non-root nginx worker.
RUN rm -f /etc/nginx/conf.d/default.conf \
    && mkdir -p /var/cache/nginx /var/run /tmp/nginx /usr/share/nginx/html \
    && chown -R nginx:nginx /var/cache/nginx /var/run /tmp/nginx /usr/share/nginx/html

# Copy only the built static assets and the hardened nginx configuration.
COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html
COPY --chown=nginx:nginx nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:80/healthz || exit 1

USER nginx

CMD ["nginx", "-g", "daemon off;"]
