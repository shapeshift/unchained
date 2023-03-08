FROM node:18.12.1-alpine

COPY . .

RUN yarn build

WORKDIR dist

ENTRYPOINT ["/usr/local/bin/node", "index.js", "$@"]
