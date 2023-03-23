COINSTACKS := $(wildcard coinstacks/*)
MAKEFLAGS += --no-print-directory
GOPATH=$(firstword $(subst :, ,$(shell go env GOPATH)))

.PHONY: all build clean $(COINSTACKS)

all: $(COINSTACKS) install

$(COINSTACKS):; $(MAKE) -C $@ generate

install:
	go install gotest.tools/gotestsum@latest
	go install golang.org/x/tools/cmd/goimports@latest
	curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(GOPATH)/bin v1.52.1

build:
	go build ./...

clean:
	go clean ./...
	find . -type f -name 'swagger.json' -exec rm -f {} +

test:
	go test ./...