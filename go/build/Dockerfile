FROM golang:1.25.0 as builder

ARG COINSTACK

WORKDIR /app

COPY go/go.mod go/go.sum go/

COPY go/static go/static
COPY go/internal go/internal
COPY go/cmd/${COINSTACK} go/cmd/${COINSTACK}
COPY go/pkg go/pkg
COPY go/coinstacks/${COINSTACK}/*.go go/coinstacks/${COINSTACK}/
COPY go/coinstacks/${COINSTACK}/api go/coinstacks/${COINSTACK}/api

WORKDIR /app/go/cmd/${COINSTACK}
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -a -o /go/bin/app

FROM alpine

ARG COINSTACK

COPY --from=builder /app/go/static static
COPY --from=builder /app/go/coinstacks/${COINSTACK}/api/swagger.json swagger.json
COPY --from=builder /go/bin/app /go/bin/app