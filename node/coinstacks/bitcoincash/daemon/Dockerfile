FROM debian:bullseye-slim

RUN apt-get update -y \
  	&& apt-get install -y curl jq wget \
  	&& apt-get clean \
  	&& rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

ARG VERSION

RUN wget https://github.com/bitcoin-cash-node/bitcoin-cash-node/releases/download/v${VERSION}/bitcoin-cash-node-${VERSION}-x86_64-linux-gnu.tar.gz \
	&& tar -xzf bitcoin-cash-node-${VERSION}-x86_64-linux-gnu.tar.gz \
	&& mv bitcoin-cash-node-${VERSION}/bin/bitcoind /usr/local/bin/bitcoind

EXPOSE 8332 8333 18332 18333 18443 18444 38333 38332

ENTRYPOINT ["bitcoind"]