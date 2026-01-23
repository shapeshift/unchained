FROM golang:1.25.0 as builder

ARG COINSTACK

WORKDIR /app

# Copy workspace files
COPY go/go.work go/go.work.sum go/

# Copy all module go.mod/go.sum files
COPY go/shared/go.mod go/shared/go.sum* go/shared/
COPY go/pkg/cosmos/go.mod go/pkg/cosmos/go.sum* go/pkg/cosmos/
COPY go/pkg/thorchain/go.mod go/pkg/thorchain/go.sum* go/pkg/thorchain/
COPY go/coinstacks/${COINSTACK}/go.mod go/coinstacks/${COINSTACK}/go.sum* go/coinstacks/${COINSTACK}/

# Copy shared module source
COPY go/shared go/shared

# Copy pkg modules source
COPY go/pkg go/pkg

# Copy static files
COPY go/static go/static

# Copy coinstack source
COPY go/coinstacks/${COINSTACK} go/coinstacks/${COINSTACK}

WORKDIR /app/go/coinstacks/${COINSTACK}/cmd
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -a -o /go/bin/app

FROM alpine

ARG COINSTACK

COPY --from=builder /app/go/static static
COPY --from=builder /app/go/coinstacks/${COINSTACK}/api/swagger.json swagger.json
COPY --from=builder /go/bin/app /go/bin/app
