FROM mhart/alpine-node:slim-14.17.0

WORKDIR /app

# Include build artifacts
COPY package.json ./package.json
COPY lerna.json ./lerna.json
COPY node_modules ./node_modules

# Include common packages
COPY packages packages/
COPY coinstacks/common coinstacks/common/
