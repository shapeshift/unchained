FROM golang:1.23.4 as builder

ARG COINSTACK

COPY ./go.mod /app/go.mod
COPY ./go.sum /app/go.sum

COPY ./static /app/static
COPY ./internal /app/internal
COPY ./cmd/${COINSTACK} /app/cmd/${COINSTACK}
COPY ./pkg /app/pkg
COPY ./coinstacks/${COINSTACK}/*.go /app/coinstacks/${COINSTACK}/
COPY ./coinstacks/${COINSTACK}/api /app/coinstacks/${COINSTACK}/api

COPY ./lib /app/lib
COPY ./radix /app/radix

WORKDIR /app/cmd/${COINSTACK}
RUN CGO_ENABLED=1 CGO_LDFLAGS="-L/app/lib -lzec" GOOS=linux GOARCH=amd64 go build -a -o /go/bin/app

FROM alpine

ARG COINSTACK

RUN apk add --no-cache libgcc libstdc++

COPY --from=builder /app/lib /lib
COPY --from=builder /app/static static
COPY --from=builder /app/coinstacks/${COINSTACK}/api/swagger.json swagger.json
COPY --from=builder /go/bin/app /go/bin/app

ENV LD_LIBRARY_PATH=/lib

ENTRYPOINT [ "/go/bin/app" ]