ARG BASE_IMAGE

FROM $BASE_IMAGE

COPY . .

RUN yarn build

WORKDIR dist

ENTRYPOINT ["/usr/local/bin/node", "index.js", "$@"]
