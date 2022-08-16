#!/bin/sh

nc -z localhost 5432

exit $(echo $?)