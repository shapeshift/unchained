FROM debian:bullseye-slim

RUN apt-get update -y \
	&& apt-get install -y curl wget jq unzip \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

ARG VERSION

RUN wget https://github.com/bnb-chain/bsc/releases/download/${VERSION}/geth_linux && \
	mv geth_linux /usr/local/bin/geth && \
	chmod +x /usr/local/bin/geth

RUN wget https://github.com/bnb-chain/bsc/releases/download/${VERSION}/mainnet.zip && \
	unzip mainnet.zip && \
	rm mainnet.zip

EXPOSE 8545 8546 30303 30303/udp

ENTRYPOINT ["bsc"]