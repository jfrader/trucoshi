# syntax=docker/dockerfile:1

FROM node:24-alpine AS dependencies

WORKDIR /opt/app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive

FROM dependencies AS build

COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json tsconfig.base.json tsconfig.dist.json ./

RUN DATABASE_URL=postgresql://build:build@localhost:5432/build yarn build

FROM build AS development

ARG APP_PORT=2992

ENV NODE_ENV=development
ENV APP_PORT=${APP_PORT}

COPY --chown=node:node bin ./bin
COPY --chown=node:node test ./test
COPY --chown=node:node nodemon.json ./nodemon.json
COPY --chown=node:node LICENSE README.md ./

RUN chown -R node:node /opt/app

USER node

EXPOSE ${APP_PORT}

STOPSIGNAL SIGTERM

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-${APP_PORT}}/health/live" || exit 1

CMD ["yarn", "start"]

FROM node:24-alpine AS runtime

ARG APP_PORT=2992

ENV NODE_ENV=production
ENV APP_PORT=${APP_PORT}

WORKDIR /opt/app

# The published root package is intentionally browser-facing. Production uses
# a private manifest so server-only dependencies never reach npm consumers.
COPY --chown=node:node server-runtime/package.json ./package.json
COPY --chown=node:node server-runtime/yarn.lock ./yarn.lock
COPY --chown=node:node prisma ./prisma
RUN yarn install --frozen-lockfile --non-interactive --production=true \
  && yarn cache clean

COPY --chown=node:node --from=build /opt/app/build ./build
COPY --chown=node:node bin ./bin
COPY --chown=node:node LICENSE README.md ./

USER node

EXPOSE ${APP_PORT}

STOPSIGNAL SIGTERM

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-${APP_PORT}}/health/live" || exit 1

CMD ["node", "bin/trucoshi-server"]
