#!/bin/sh

pg_isready -U midgard

exit echo $?