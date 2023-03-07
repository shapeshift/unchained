FROM debian:11

# install dependencies
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y build-essential git wget pkg-config lxc-dev libzmq3-dev \
    libgflags-dev libsnappy-dev zlib1g-dev libbz2-dev \
    libzstd-dev liblz4-dev graphviz && \
    apt-get clean

ENV GOLANG_VERSION=go1.19.2.linux-amd64
ENV GOPATH=/go
ENV PATH=$PATH:$GOPATH/bin

# install and configure go
RUN wget https://dl.google.com/go/$GOLANG_VERSION.tar.gz -O - | tar -xzf - -C /opt
RUN ln -s /opt/go/bin/go /usr/bin/go
RUN mkdir -p $GOPATH

ENV ROCKSDB_VERSION=v7.7.2
ENV ROCKSDB_PORTABLE=0

# install rocksdb
RUN cd /opt && git clone -b $ROCKSDB_VERSION --depth 1 https://github.com/facebook/rocksdb.git
RUN cd /opt/rocksdb && CFLAGS=-fPIC CXXFLAGS=-fPIC PORTABLE=$PORTABLE_ROCKSDB make -j 4 static_lib

# commit: 1bcdcc6
ENV BLOCKBOOK_VERSION=master
ENV BLOCKBOOK_URL=https://github.com/trezor/blockbook.git

# set up blockbook
RUN git clone -b $BLOCKBOOK_VERSION --depth 1 $BLOCKBOOK_URL
WORKDIR /blockbook

ENV CGO_CFLAGS="-I/opt/rocksdb/include"
ENV CGO_LDFLAGS="-L/opt/rocksdb -ldl -lrocksdb -lstdc++ -lm -lz -lbz2 -lsnappy -llz4 -lzstd"

# download blockbook dependencies
RUN go mod download

# hack to increase read limit for go-ethereum websocket client
RUN sed -i 's/wsMessageSizeLimit\ =\ 15\ \*\ 1024\ \*\ 1024/wsMessageSizeLimit = 50 * 1024 * 1024/g' $GOPATH/pkg/mod/github.com/ethereum/go-ethereum*/rpc/websocket.go 
RUN sed -i 's/wsMessageSizeLimit\ =\ 15\ \*\ 1024\ \*\ 1024/wsMessageSizeLimit = 50 * 1024 * 1024/g' $GOPATH/pkg/mod/github.com/ava-labs/coreth*/rpc/websocket.go 

# build blockbook binary
RUN go build -ldflags="-s -w -X github.com/trezor/blockbook/common.version=${BLOCKBOOK_VERSION}"
RUN mv blockbook /bin

# copy in generate config script
ADD generate-config.sh .
RUN chmod +x generate-config.sh

# create mount points 
VOLUME /out
VOLUME /db
VOLUME /logs

# expose ports
EXPOSE 8000
EXPOSE 8001
