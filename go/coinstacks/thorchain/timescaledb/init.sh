#!/bin/sh

set -e

start_service() {
  #su postgres -c 'postgres -c max_connections=100 -c shared_buffers=128MB -c wal_buffers=16MB -c work_mem=8MB -c plan_cache_mode=force_custom_plan' &
  initdb
  postgres \
    -c max_connections=100 \
    -c shared_buffers=128MB \
    -c wal_buffers=16MB \
    -c work_mem=8MB \
    -c plan_cache_mode=force_custom_plan' &
  PID="$!"
}

stop_service() {
  echo "Catching signal and sending to PID: $PID"
  kill $PID
  while $(kill -0 $PID 2>/dev/null); do
    sleep 1
  done
}

trap 'stop_service' TERM INT

start_service
wait $PID
