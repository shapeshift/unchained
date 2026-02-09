FROM node:22.14.0-alpine

ARG DIR
ARG PACKAGE

WORKDIR /app

# Root config
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn/

# Package.json files for dependency resolution
COPY node/packages/websocket/package.json node/packages/websocket/
COPY node/packages/prometheus/package.json node/packages/prometheus/
COPY node/packages/blockbook/package.json node/packages/blockbook/
COPY node/coinstacks/common/api/package.json node/coinstacks/common/api/
COPY node/${DIR}/package.json node/${DIR}/

# Install dependencies
RUN yarn install

# Source files
COPY tsconfig.json ./
COPY node/packages node/packages/
COPY node/coinstacks/common node/coinstacks/common/
COPY node/${DIR} node/${DIR}/

# Build
RUN yarn workspaces foreach -Rpt --from ${PACKAGE} run build

WORKDIR /app/node/${DIR}