ARG BASE_IMAGE

FROM $BASE_IMAGE

COPY . .

WORKDIR dist

ENTRYPOINT ["/usr/local/bin/node", "index.js", "$@"]
