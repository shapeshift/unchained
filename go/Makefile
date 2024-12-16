COINSTACKS := $(wildcard coinstacks/*)
MAKEFLAGS += --no-print-directory
GOPATH=$(firstword $(subst :, ,$(shell go env GOPATH)))

.PHONY: all build clean $(COINSTACKS)

all: install $(COINSTACKS)

$(COINSTACKS):; $(MAKE) -C $@ generate

install:
	go install gotest.tools/gotestsum@latest
	go install golang.org/x/tools/cmd/goimports@latest
	curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(GOPATH)/bin v1.62.2
	docker build -t unchained-local-go -f ./build/Dockerfile.local .

build:
	go build ./...

clean:
	go clean ./...
	find . -type f -name 'swagger.json' -exec rm -f {} +

lint:
	golangci-lint run

test:
	go test ./...