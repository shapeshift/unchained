MODULES := $(shell grep -E '^\s+\./' go.work | tr -d '\t ')
COINSTACKS := $(filter ./coinstacks/%,$(MODULES))
MAKEFLAGS += --no-print-directory
GOPATH=$(firstword $(subst :, ,$(shell go env GOPATH)))

.PHONY: all build clean $(COINSTACKS)

all: install $(COINSTACKS)

$(COINSTACKS):; $(MAKE) -C $@ install generate

install:
	go install gotest.tools/gotestsum@latest
	go install golang.org/x/tools/cmd/goimports@latest
	curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(GOPATH)/bin v2.6.1

build:
	go build $(addsuffix /...,$(MODULES))

clean:
	go clean $(addsuffix /...,$(MODULES))
	find . -type f -name 'swagger.json' -exec rm -f {} +

lint:
	golangci-lint run

test:
	go test $(addsuffix /...,$(MODULES))

tidy:
	@for mod in $(MODULES); do (cd $$mod && go mod tidy); done