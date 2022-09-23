FROM quay.io/goswagger/swagger:v0.29.0

RUN go install github.com/cespare/reflex@latest

ENTRYPOINT ["reflex", "-s"]