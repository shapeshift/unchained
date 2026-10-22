MODULES := $(shell find . -name go.mod -not -path './vendor/*' -exec dirname {} \;)
COINSTACKS := $(filter ./coinstacks/%,$(MODULES))
MAKEFLAGS += --no-print-directory
GOPATH=$(firstword $(subst :, ,$(shell go env GOPATH)))

.PHONY: all build clean generate install lint tidy test-mayachain

all: install generate

generate:
	@for cs in $(COINSTACKS); do $(MAKE) -C $$cs install generate & done; wait

install:
	go install gotest.tools/gotestsum@latest
	go install golang.org/x/tools/cmd/goimports@latest
	bash scripts/install-golangci-lint.sh 2.15.0 $(GOPATH)/bin/golangci-lint-2.15.0

define build_mod
build-$(subst /,-,$(1)):
	@if echo $(1) | grep -q 'mayachain'; then \
		cd $(1) && CGO_ENABLED=1 CGO_LDFLAGS="-L$(CURDIR)/lib -lzec" go build ./...; \
	else \
		cd $(1) && go build ./...; \
	fi
endef

$(foreach mod,$(MODULES),$(eval $(call build_mod,$(mod))))
build:
	@$(MAKE) -j $(foreach mod,$(MODULES),build-$(subst /,-,$(mod)))

test-mayachain:
	cd pkg/mayachain && CGO_ENABLED=1 CGO_LDFLAGS="-L$(CURDIR)/lib -lzec" LD_LIBRARY_PATH="$(CURDIR)/lib" go test ./...

define lint_mod
lint-$(subst /,-,$(1)):
	@if ! echo $(1) | grep -q 'mayachain'; then \
		cd $(1) && golangci-lint-2.15.0 run --allow-parallel-runners; \
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
