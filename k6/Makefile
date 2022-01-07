IMAGE=loadimpact/k6
USER=$(shell id -u):$(shell id -g)
TEST_FILE="test.js"

test:
	- docker run --rm -it --user ${USER} -v "$(CURDIR):/out" $(IMAGE) run /out/$(TEST_FILE)
