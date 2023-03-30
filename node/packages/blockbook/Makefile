IMAGE = blockbook
GITCOMMIT = local
BUILDTIME = local 

build:
	- docker build --platform linux/amd64 -t $(IMAGE) --build-arg GITCOMMIT=$(GITCOMMIT) --build-arg BUILDTIME=$(BUILDTIME) -f Dockerfile .

clean:
	- docker rmi $(IMAGE)