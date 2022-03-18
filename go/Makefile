COINSTACKS := $(wildcard coinstacks/*)
MAKEFLAGS += --no-print-directory

.PHONY: all build clean $(COINSTACKS)

all: $(COINSTACKS) install-goimports

$(COINSTACKS):; $(MAKE) -C $@ generate

install-goimports:
	go install golang.org/x/tools/cmd/goimports@latest

build:
	go build ./...

clean:
	go clean ./...
	find . -type f -name 'swagger.json' -exec rm -f {} +

test:
	go test ./...