# Dockerfile
FROM node:24-alpine

ARG APP_PORT=2999

RUN mkdir -p /opt/app
WORKDIR /opt/app

COPY package.json yarn.lock /opt/app/
COPY bin /opt/app/bin/
COPY src /opt/app/src/
COPY test /opt/app/test/
COPY prisma /opt/app/prisma/
COPY nodemon.json  /opt/app/
COPY tsconfig.json  /opt/app/
COPY tsconfig.dist.json /opt/app/
COPY tsconfig.base.json /opt/app/
COPY .env /opt/app/
COPY .env.test /opt/app/

RUN yarn --pure-lockfile && yarn cache clean
RUN yarn build

EXPOSE $APP_PORT
