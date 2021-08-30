FROM debian:10

# install dependencies
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y git wget build-essential pkg-config lxc-dev libzmq3-dev \
    libgflags-dev libsnappy-dev zlib1g-dev libbz2-dev \
    liblz4-dev graphviz && \
    apt-get clean

ENV GOLANG_VERSION=go1.15.5.linux-amd64
ENV GOPATH=/go
ENV PATH=$PATH:$GOPATH/bin
ENV BLOCKBOOK_VERSION=master
ENV BLOCKBOOK_URL=https://github.com/trezor/blockbook.git
ENV ROCKSDB_VERSION=v6.13.3
ENV CGO_CFLAGS="-I/opt/rocksdb/include"
ENV CGO_LDFLAGS="-L/opt/rocksdb -lrocksdb -lstdc++ -lm -lz -lbz2 -lsnappy -llz4"

# install and configure go
RUN cd /opt && wget https://dl.google.com/go/$GOLANG_VERSION.tar.gz && \
    tar xf $GOLANG_VERSION.tar.gz
RUN ln -s /opt/go/bin/go /usr/bin/go
RUN mkdir -p $GOPATH
RUN echo -n "GO version: " && go version
RUN echo -n "GOPATH: " && echo $GOPATH

# install rocksdb
RUN cd /opt && git clone -b $ROCKSDB_VERSION --depth 1 https://github.com/facebook/rocksdb.git
RUN cd /opt/rocksdb && CFLAGS=-fPIC CXXFLAGS=-fPIC make -j 4 release
RUN strip /opt/rocksdb/ldb /opt/rocksdb/sst_dump

# set up blockbook
RUN git clone -b $BLOCKBOOK_VERSION --depth 1 $BLOCKBOOK_URL
WORKDIR /blockbook

# build blockbook binary
RUN go build -ldflags="-s -w -X github.com/trezor/blockbook/common.version=${BLOCKBOOK_VERSION}"
RUN mv blockbook /bin

# copy in generate config script
ADD generate-config.sh .
RUN chmod +x generate-config.sh

# create mount points 
VOLUME /out
VOLUME /config
VOLUME /db
VOLUME /logs

# expose ports
EXPOSE 8000
EXPOSE 8001
