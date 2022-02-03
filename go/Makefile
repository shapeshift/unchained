COINSTACKS := $(wildcard coinstacks/*)
MAKEFLAGS += --no-print-directory

.PHONY: all build clean $(COINSTACKS)

all: $(COINSTACKS)

$(COINSTACKS):; $(MAKE) -C $@ generate

build:
	go build ./...

clean:
	go clean ./...
	find . -type f -name 'swagger.json' -exec rm -f {} +