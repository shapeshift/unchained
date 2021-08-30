#!/bin/bash

set -e

if [ $# -lt 2 ]; then
    echo "Missing arugments" 1>&2
    echo "Usage: <coin> [build opts]" 1>&2
    exit 1
fi

coin=$1

# generate coin config
go run build/templates/generate.go $coin

# copy config to mounted volume
mv build/pkg-defs/blockbook/blockchaincfg.json /out/config.json

# update ownership from root to user
chown $PACKAGER /out/config.json