FROM alpine:3.17

RUN apk add --no-cache bash curl grep jq sed unzip wget \
	&& rm -rf /var/cache/apk/*

ARG VERSION

RUN wget https://github.com/bnb-chain/bsc/releases/download/${VERSION}/geth_linux && \
	mv geth_linux /usr/local/bin/geth && \
	chmod +x /usr/local/bin/geth

RUN wget https://github.com/bnb-chain/bsc/releases/download/${VERSION}/mainnet.zip && \
	unzip mainnet.zip && \
	rm mainnet.zip

# Remove LogConfig from included config.toml to keep logging directed at stdout
RUN sed -i -e '/\[Node.LogConfig\]/,+5d' config.toml

EXPOSE 8545 8546 30303 30303/udp

ENTRYPOINT ["geth"]