FROM golang:1.25.0 as builder

WORKDIR /app

COPY go/shared/go.mod go/shared/go.sum go/shared/
COPY go/pkg/cosmos/go.mod go/pkg/cosmos/go.sum go/pkg/cosmos/
COPY go/coinstacks/cosmos/go.mod go/coinstacks/cosmos/go.sum go/coinstacks/cosmos/

COPY go/static go/static
COPY go/shared go/shared
COPY go/pkg/cosmos go/pkg/cosmos
COPY go/coinstacks/cosmos go/coinstacks/cosmos

WORKDIR /app/go/coinstacks/cosmos/cmd
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -a -o /go/bin/app

FROM alpine

COPY --from=builder /app/go/static static
COPY --from=builder /app/go/coinstacks/cosmos/api/swagger.json swagger.json
COPY --from=builder /go/bin/app /go/bin/app
