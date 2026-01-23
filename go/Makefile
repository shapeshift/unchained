MODULES := $(shell find . -name go.mod -not -path './vendor/*' -exec dirname {} \;)
COINSTACKS := $(filter ./coinstacks/%,$(MODULES))
MAKEFLAGS += --no-print-directory
GOPATH=$(firstword $(subst :, ,$(shell go env GOPATH)))

.PHONY: all build clean generate

all: install generate

generate:
	@for cs in $(COINSTACKS); do $(MAKE) -C $$cs install generate & done; wait

install:
	go install gotest.tools/gotestsum@latest
	go install golang.org/x/tools/cmd/goimports@latest
	curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(GOPATH)/bin v2.6.1

build:
	@for mod in $(MODULES); do (cd $$mod && go build ./...) & done; wait

clean:
	@for mod in $(MODULES); do (cd $$mod && go clean ./...) & done; wait
	find . -type f -name 'swagger.json' -exec rm -f {} +

lint:
	@for mod in $(MODULES); do (cd $$mod && golangci-lint run) & done; wait

test:
	@for mod in $(MODULES); do (cd $$mod && go test ./...) & done; wait

tidy:
	@for mod in $(MODULES); do (cd $$mod && go mod tidy) & done; wait