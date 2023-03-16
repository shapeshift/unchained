# ARG BASE_IMAGE

# FROM $BASE_IMAGE
FROM node:18.12.1-alpine

COPY . .

WORKDIR dist

ENTRYPOINT ["/usr/local/bin/node", "index.js", "$@"]
