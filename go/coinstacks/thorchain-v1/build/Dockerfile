FROM golang:1.25.0 as builder

ARG COINSTACK

WORKDIR /app

COPY go/shared/go.mod go/shared/go.sum go/shared/
COPY go/pkg/thorchain/go.mod go/pkg/thorchain/go.sum go/pkg/thorchain/
COPY go/coinstacks/thorchain-v1/go.mod go/coinstacks/thorchain-v1/go.sum go/coinstacks/thorchain-v1/

RUN go mod download

COPY go/static go/static
COPY go/shared go/shared
COPY go/pkg/thorchain go/pkg/thorchain
COPY go/coinstacks/thorchain-v1 go/coinstacks/thorchain-v1

WORKDIR /app/go/coinstacks/thorchain-v1/cmd
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -a -o /go/bin/app

FROM alpine

ARG COINSTACK

COPY --from=builder /app/go/static static
COPY --from=builder /app/go/coinstacks/thorchain-v1/api/swagger.json swagger.json
COPY --from=builder /go/bin/app /go/bin/app
