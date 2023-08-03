#!/bin/sh

set -e

trap 'exit' SIGTERM SIGINT

tail -f /dev/null &

wait $!