# Run with the repository root as build context. Rust is not needed: the
# checked-in editor runtimes are verified by the normal prebuild hook.
FROM node:22-bookworm-slim AS build
WORKDIR /workspace
COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm ci --prefix apps/web --registry=$NPM_REGISTRY --no-audit --no-fund
COPY apps/web ./apps/web
COPY packages/craft-editors/site ./packages/craft-editors/site
COPY packages/craft-editors/*-classic-comments.patch ./packages/craft-editors/
RUN npm --prefix apps/web run build \
    && node apps/web/scripts/compress-static.mjs apps/web/dist

FROM nginx:1.28-alpine
RUN apk add --no-cache nodejs
ENV RFQ_API_UPSTREAM=rfq-service:48081 \
    RFQ_OFFICE_UPSTREAM=rfq-service:48081 \
    NGINX_ENVSUBST_FILTER=^RFQ_
COPY deploy/web/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/web/proxy.conf /etc/nginx/rfq-proxy.conf
COPY deploy/web/check-rfq-web.sh /usr/local/bin/check-rfq-web.sh
COPY deploy/web/migrate-nginx.mjs /usr/local/lib/rfq/migrate-nginx.mjs
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
RUN chmod +x /usr/local/bin/check-rfq-web.sh
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD /bin/sh /usr/local/bin/check-rfq-web.sh || exit 1
