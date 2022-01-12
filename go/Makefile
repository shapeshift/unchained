COINSTACKS := $(wildcard coinstacks/*)
MAKEFLAGS += -j$(words $(COINSTACKS)) --no-print-directory

.PHONY: all $(COINSTACKS)

all: $(COINSTACKS)

$(COINSTACKS):; $(MAKE) -C $@ generate
