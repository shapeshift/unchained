IMAGE=openapitools/openapi-generator-cli
SPEC=https://docs.tendermint.com/master/rpc/openapi.yaml
USER=$(shell id -u):$(shell id -g)

generate:
	- docker run --rm -it --user ${USER} -v "$(CURDIR):/out" $(IMAGE) generate -g go -i ${SPEC} --package-name client -o /out/client

clean:
	- rm -rf client