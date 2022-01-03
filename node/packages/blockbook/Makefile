IMAGE = blockbook
GITCOMMIT = local
BUILDTIME = local 

build:
	- docker build -t $(IMAGE) --build-arg GITCOMMIT=$(GITCOMMIT) --build-arg BUILDTIME=$(BUILDTIME) -f Dockerfile .

clean:
	- docker rmi $(IMAGE)