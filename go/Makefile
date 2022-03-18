COINSTACKS := $(wildcard coinstacks/*)
MAKEFLAGS += --no-print-directory

.PHONY: all build clean $(COINSTACKS) husky

all: $(COINSTACKS) install-goimports husky

$(COINSTACKS):; $(MAKE) -C $@ generate

install-goimports:
	go install golang.org/x/tools/cmd/goimports@latest

husky:
	cd .. && ./node/node_modules/.bin/husky install

build:
	go build ./...

clean:
	go clean ./...
	find . -type f -name 'swagger.json' -exec rm -f {} +

test:
	go test ./...