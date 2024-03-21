IMAGE=quay.io/goswagger/swagger:v0.30.5
USER=$(shell id -u):$(shell id -g)
ROOTDIR=$(shell git rev-parse --show-toplevel)/go

.PHONY: default docker generate

default: generate

docker:
	docker build -t shapeshiftdao/cosmoshub:${VERSION} \
		--build-arg NAMESPACE=GAIAD \
		--build-arg PROJECT=cosmoshub \
		--build-arg PROJECT_BIN=gaiad \
		--build-arg PROJECT_DIR=.gaia \
		--build-arg VERSION=${VERSION} \
		--build-arg REPOSITORY=https://github.com/cosmos/gaia \
		-f ../../build/Dockerfile.daemon \
		../../

generate:
	- docker run --platform=linux/amd64 --rm --user $(USER) -e GOCACHE=/tmp -v "$(ROOTDIR):$(ROOTDIR)" -w $(CURDIR) $(IMAGE) \
	  generate spec -o api/swagger.json -x protoc-gen-openapiv2 -m
