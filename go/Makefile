COINSTACKS := $(wildcard coinstacks/*)
MAKEFLAGS += --no-print-directory

.PHONY: all build clean $(COINSTACKS) git-format-staged

all: $(COINSTACKS) install-goimports git-format-staged

$(COINSTACKS):; $(MAKE) -C $@ generate

install-goimports:
	go install golang.org/x/tools/cmd/goimports@latest

git-format-staged:
	chmod +x ./scripts/git-format-staged.py

build:
	go build ./...

clean:
	go clean ./...
	find . -type f -name 'swagger.json' -exec rm -f {} +

test:
	go test ./...