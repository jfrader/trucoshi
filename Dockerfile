# Dockerfile
FROM node:21-alpine

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

RUN yarn install
RUN yarn build

EXPOSE 2992
