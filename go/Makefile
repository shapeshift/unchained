COINSTACKS := $(wildcard coinstacks/*)
MAKEFLAGS += --no-print-directory

.PHONY: all build clean $(COINSTACKS)

all: $(COINSTACKS) install-goimports precommit-hook

$(COINSTACKS):; $(MAKE) -C $@ generate

install-goimports:
	go install golang.org/x/tools/cmd/goimports@latest

precommit-hook:
	chmod +x ./scripts/pre-commit
	@if [[ -f ../.git/hooks/pre-commit ]]; then echo "== pre-commit hook existed"; exit 1; fi
	@if [[ -L ../.git/hooks/pre-commit ]]; then rm ../.git/hooks/pre-commit; true; fi
	ln -s ../../go/scripts/pre-commit ../.git/hooks/pre-commit

build:
	go build ./...

clean:
	go clean ./...
	find . -type f -name 'swagger.json' -exec rm -f {} +

test:
	go test ./...