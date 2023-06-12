FROM debian:bullseye-slim

RUN apt-get update -y \
  	&& apt-get install -y curl jq wget \
  	&& apt-get clean \
  	&& rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

ARG VERSION

RUN wget https://github.com/dogecoin/dogecoin/releases/download/v${VERSION}/dogecoin-${VERSION}-x86_64-linux-gnu.tar.gz \
	&& tar -xzf dogecoin-${VERSION}-x86_64-linux-gnu.tar.gz \
	&& mv dogecoin-${VERSION}/bin/dogecoind /usr/local/bin/dogecoind

EXPOSE 8332 8333 18332 18333 18443 18444 38333 38332

ENTRYPOINT ["dogecoind"]