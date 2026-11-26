ARG NODE_VERSION=24
ARG PNPM_VERSION=12.23.0

FROM node:${NODE_VERSION}-alpine AS build
ARG PNPM_VERSION
ENV NODE_USE_ENV_PROXY=1
# Network-reaching build steps mount the proxy settings as build secrets
# (id=http_proxy/https_proxy/no_proxy, optional — absent when the operator
# exports none), exposed only as environment variables inside that RUN.
RUN --mount=type=secret,id=http_proxy,env=http_proxy \
    --mount=type=secret,id=https_proxy,env=https_proxy \
    --mount=type=secret,id=no_proxy,env=no_proxy \
    npm install --global --no-fund --no-audit "pnpm@${PNPM_VERSION}"
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/pnpm/store \
    --mount=type=secret,id=http_proxy,env=http_proxy \
    --mount=type=secret,id=https_proxy,env=https_proxy \
    --mount=type=secret,id=no_proxy,env=no_proxy \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
RUN pnpm typecheck && pnpm build \
    && mkdir -p apps/web/node_modules/.vite-temp

FROM node:${NODE_VERSION}-alpine AS runtime
COPY --from=build /src /app
# vite preview hosts the Inspector proxy, accounts and sandbox middleware;
# dev dependencies stay installed because the Vite config loads them.
WORKDIR /app/apps/web
USER 10001:10001
ENTRYPOINT ["node", "node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--strictPort"]
CMD ["--port", "27001"]
