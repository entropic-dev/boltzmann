#!/bin/bash

set -e

tmpdir=$(mktemp -d)
trap "{ rm -rf $tmpdir ; }" EXIT

mkdir -p $tmpdir

TEST=1 node ./index.js $tmpdir --language=node --with-postgres --with-redis --no-honeycomb
cd $tmpdir; npm i; cd -
cd $tmpdir; $tmpdir/node_modules/.bin/tap --cov $tmpdir/boltzmann.js; cd -
