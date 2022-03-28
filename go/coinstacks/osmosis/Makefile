IMAGE=quay.io/goswagger/swagger:v0.29.0
USER=$(shell id -u):$(shell id -g)
ROOTDIR=$(shell git rev-parse --show-toplevel)/go

.PHONY: generate

generate:
	- docker run --platform=linux/amd64 --rm --user $(USER) -e GOCACHE=/tmp -v "$(ROOTDIR):$(ROOTDIR)" -w $(CURDIR) $(IMAGE) \
	  generate spec -o api/swagger.json -x protoc-gen-openapiv2 -m