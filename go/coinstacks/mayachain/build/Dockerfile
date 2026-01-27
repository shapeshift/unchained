FROM golang:1.23.4 AS builder

WORKDIR /app

COPY go/shared/go.mod go/shared/go.sum go/shared/
COPY go/pkg/mayachain/go.mod go/pkg/mayachain/go.sum go/pkg/mayachain/
COPY go/coinstacks/mayachain/go.mod go/coinstacks/mayachain/go.sum go/coinstacks/mayachain/

RUN go mod download

COPY go/lib go/lib
COPY go/radix go/radix
COPY go/static go/static
COPY go/shared go/shared
COPY go/pkg/mayachain go/pkg/mayachain
COPY go/coinstacks/mayachain go/coinstacks/mayachain

WORKDIR /app/go/coinstacks/mayachain/cmd
RUN CGO_ENABLED=1 CGO_LDFLAGS="-L/app/go/lib -lzec" GOOS=linux GOARCH=amd64 go build -a -o /go/bin/app

FROM gcr.io/distroless/cc-debian12

ENV LD_LIBRARY_PATH=/lib

COPY --from=builder /app/go/lib lib
COPY --from=builder /app/go/static static
COPY --from=builder /app/go/coinstacks/mayachain/api/swagger.json swagger.json
COPY --from=builder /go/bin/app /go/bin/app
