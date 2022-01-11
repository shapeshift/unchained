IMAGE=quay.io/goswagger/swagger
USER=$(shell id -u):$(shell id -g)

generate:
	- docker run --rm -it --user $(USER) -e GOPATH=$(HOME)/go:/go -e GOCACHE=/tmp -v "$(HOME):$(HOME)" -w "$(CURDIR)/api" $(IMAGE) generate spec -o swagger.json -m