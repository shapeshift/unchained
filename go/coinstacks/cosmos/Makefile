IMAGE=quay.io/goswagger/swagger
USER=$(shell id -u):$(shell id -g)
ROOTDIR=$(shell git rev-parse --show-toplevel)/go

generate:
	- docker run --rm -it --user $(USER) -e GOCACHE=/tmp -v "$(ROOTDIR):$(ROOTDIR)" -w $(CURDIR) $(IMAGE) generate spec -o api/swagger.json -m