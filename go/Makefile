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
	curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b /tmp v2.6.1 && mv /tmp/golangci-lint $(GOPATH)/bin/golangci-lint-2.6.1
	curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b /tmp v1.62.2 && mv /tmp/golangci-lint $(GOPATH)/bin/golangci-lint-1.62.2

build:
	@for mod in $(MODULES); do ( \
		if echo $$mod | grep -q 'mayachain'; then \
			cd $$mod && CGO_ENABLED=1 CGO_LDFLAGS="-L$(CURDIR)/lib -lzec" go1.23.4 build ./...; \
		else \
			cd $$mod && go build ./...; \
		fi \
	) & done; wait

clean:
	@for mod in $(MODULES); do (cd $$mod && go clean ./...) & done; wait
	find . -type f -name 'swagger.json' -exec rm -f {} +

lint:
	@for mod in $(MODULES); do ( \
		if echo $$mod | grep -q 'mayachain'; then \
			cd $$mod && CGO_ENABLED=1 CGO_LDFLAGS="-L$(CURDIR)/lib -lzec" $(GOLANGCI_LINT_LEGACY) run --allow-parallel-runners; \
		else \
			cd $$mod && $(GOLANGCI_LINT) run --allow-parallel-runners; \
		fi \
	) & done; wait

tidy:
	@for mod in $(MODULES); do (cd $$mod && go mod tidy) & done; wait