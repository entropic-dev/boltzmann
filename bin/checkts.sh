#!/bin/bash

set -e

if [ ! -e node_modules ]; then
  npm ci
else
  npm i
fi

node_modules/.bin/tsc --noEmit --project ./tsconfig-build-js.json
