#!/bin/sh

curl -s --connect-timeout 10 http://localhost:8001/api/v2 -H 'Content-Type: application/json' > /dev/null

if [ "$?" != "0" ]
then
    echo "Connection timeout..."
    exit 1
fi

exit 0
