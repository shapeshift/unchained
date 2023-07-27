FROM debian:bullseye-slim

RUN apt-get update -y \
  	&& apt-get install -y curl jq wget \
  	&& apt-get clean \
  	&& rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

ARG VERSION


RUN wget https://github.com/litecoin-project/litecoin/releases/download/v${VERSION}/litecoin-${VERSION}-x86_64-linux-gnu.tar.gz \
	&& tar -xzf litecoin-${VERSION}-x86_64-linux-gnu.tar.gz \
	&& mv litecoin-${VERSION}/bin/litecoind /usr/local/bin/litecoind

EXPOSE 8332 8333 18332 18333 18443 18444 38333 38332

ENTRYPOINT ["litecoind"]