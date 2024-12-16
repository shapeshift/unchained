IMAGE=unchained-local-go
USER=$(shell id -u):$(shell id -g)
ROOTDIR=$(shell git rev-parse --show-toplevel)/go

.PHONY: generate

generate:
	- docker run --platform=linux/amd64 --rm --user $(USER) -e GOCACHE=/tmp -v "$(ROOTDIR):$(ROOTDIR)" -w $(CURDIR) $(IMAGE) \
	  swagger generate spec -o api/swagger.json -x protoc-gen-openapiv2 -m