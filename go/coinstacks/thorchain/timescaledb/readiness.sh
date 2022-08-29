#!/bin/bash

nc -z localhost 5432

exit $(echo $?)