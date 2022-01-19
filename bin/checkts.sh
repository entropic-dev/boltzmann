#!/bin/bash

set -e

function get_platform() {
  if [ "$OSTYPE" == "linux-gnu" ]; then
    echo linux
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo darwin
  elif [ "$OSTYPE" == "cygwin" ]; then
    echo windows
  elif [ "$OSTYPE" == "msys" ]; then
    echo windows
  elif [ "$OSTYPE" == "win32" ]; then
    echo windows
  else
    echo "Cannot detect OS" >&2
    exit 1
  fi
}
plat=$(get_platform)

if [ ! -e node_modules ]; then
  npm ci
else
  npm i
fi

node_modules/.bin/tsc --noEmit --project ./tsconfig-build-js.json
