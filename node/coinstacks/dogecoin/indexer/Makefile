IMAGE = blockbook
PACKAGER = $(shell id -u):$(shell id -g)

gen-config:
	- docker run --platform linux/amd64 --rm -t -e PACKAGER=$(PACKAGER) -v "$(CURDIR):/out" $(IMAGE) ./generate-config.sh dogecoin

run:
	- mkdir -p db
	- mkdir -p logs
	- docker run --platform linux/amd64 --rm -t -v "$(CURDIR)/config.json:/config.json" -v "$(CURDIR)/db:/db" -v "$(CURDIR)/logs:/logs" -p 8000:8000 -p 8001:8001 $(IMAGE) /bin/blockbook -blockchaincfg=/config.json -datadir=/db -sync -internal=:8000 -public=:8001 -log_dir=/logs