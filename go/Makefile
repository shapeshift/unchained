MODULES := $(shell find . -name go.mod -not -path './vendor/*' -exec dirname {} \;)
COINSTACKS := $(filter ./coinstacks/%,$(MODULES))
MAKEFLAGS += --no-print-directory
GOPATH=$(firstword $(subst :, ,$(shell go env GOPATH)))

.PHONY: all build clean generate install lint tidy

all: install generate

generate:
	@for cs in $(COINSTACKS); do $(MAKE) -C $$cs install generate & done; wait

install:
	go install gotest.tools/gotestsum@latest
	go install golang.org/x/tools/cmd/goimports@latest
	curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b /tmp v2.6.1 && mv /tmp/golangci-lint $(GOPATH)/bin/golangci-lint-2.6.1
	curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b /tmp v1.62.2 && mv /tmp/golangci-lint $(GOPATH)/bin/golangci-lint-1.62.2

define build_mod
build-$(subst /,-,$(1)):
	@if echo $(1) | grep -q 'mayachain'; then \
		cd $(1) && CGO_ENABLED=1 CGO_LDFLAGS="-L$(CURDIR)/lib -lzec" go1.23.4 build ./...; \
	else \
		cd $(1) && go build ./...; \
	fi
endef

$(foreach mod,$(MODULES),$(eval $(call build_mod,$(mod))))
build:
	@$(MAKE) -j $(foreach mod,$(MODULES),build-$(subst /,-,$(mod)))

define lint_mod
lint-$(subst /,-,$(1)):
	@if ! echo $(1) | grep -q 'mayachain'; then \
		cd $(1) && golangci-lint-2.6.1 run --allow-parallel-runners; \
	fi
endef

$(foreach mod,$(MODULES),$(eval $(call lint_mod,$(mod))))
lint:
	@$(MAKE) -j $(foreach mod,$(MODULES),lint-$(subst /,-,$(mod)))

clean:
	@for mod in $(MODULES); do (cd $$mod && go clean ./...) & done; wait
	find . -type f -name 'swagger.json' -exec rm -f {} +

tidy:
	@for mod in $(MODULES); do (cd $$mod && go mod tidy) & done; wait
