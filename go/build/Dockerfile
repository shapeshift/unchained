FROM golang:1.22.0 as builder

ARG COINSTACK

COPY ./go.mod /app/go.mod
COPY ./go.sum /app/go.sum

COPY ./static /app/static
COPY ./internal /app/internal
COPY ./cmd/${COINSTACK} /app/cmd/${COINSTACK}
COPY ./pkg /app/pkg
COPY ./coinstacks/${COINSTACK}/*.go /app/coinstacks/${COINSTACK}/
COPY ./coinstacks/${COINSTACK}/api /app/coinstacks/${COINSTACK}/api

WORKDIR /app/cmd/${COINSTACK}
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -a -o /go/bin/app

FROM alpine

ARG COINSTACK

COPY --from=builder /app/static static
COPY --from=builder /app/coinstacks/${COINSTACK}/api/swagger.json swagger.json
COPY --from=builder /go/bin/app /go/bin/app

ENTRYPOINT [ "/go/bin/app" ]