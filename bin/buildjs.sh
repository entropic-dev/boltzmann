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
fi

rm -rf templates/boltzmann-js
node_modules/.bin/tsc --project ./tsconfig-build-js.json
cat ./templates/boltzmann/index.tera | \
  sed -e 's/void `{%/\/\/ /g' | \
  sed -e 's/\.ts/.js/g' | \
  sed -e 's/boltzmann\//boltzmann-js\//g' > templates/boltzmann-js/index.tera

cp -r templates/boltzmann{,-js}/middleware/templates

for file in $(find templates/boltzmann-js -name '*.js'); do
  data=$(sed -E '/^import/{s/([[:alnum:]]+) as ([[:alnum:]]+)/\1: \2/g;}' <"$file")
  echo "$data" > "$file"
  data=$(sed -E '/^export/{s/([[:alnum:]]+) as ([[:alnum:]]+)/\2: \1/g;}' <"$file")
  echo "$data" > "$file"

  if [ "$plat" = "darwin" ]; then
    sed -i '' -e 's/^import {\(.*\)} from '"'"'\(.*\)'"'"'/const {\1} = require("\2")/g' "$file"
    sed -i '' -e 's/^import \* as \(.*\) from '"'"'\(.*\)'"'"'/const \1 = require("\2")/g' "$file"
    sed -i '' -e 's/^import \(.*\) from '"'"'\(.*\)'"'"'/const \1 = require("\2")/g' "$file"
    sed -i '' -e 's/^export {/module.exports = {...module.exports, /g' "$file"
    sed -i '' -e 's/^export const \(.*\) = \(.*\)/const \1 = \2; module.exports.\1 = \1;/g' "$file"
  else
    sed -i -e 's/^import {\(.*\)} from '"'"'\(.*\)'"'"'/const {\1} = require("\2")/g' "$file"
    sed -i -e 's/^import \* as \(.*\) from '"'"'\(.*\)'"'"'/const \1 = require("\2")/g' "$file"
    sed -i -e 's/^import \(.*\) from '"'"'\(.*\)'"'"'/const \1 = require("\2")/g' "$file"
    sed -i -e 's/^export {/module.exports = {...module.exports, /g' "$file"
    sed -i -e 's/^export const \(.*\) = \(.*\)/const \1 = \2; module.exports.\1 = \1;/g' "$file"
  fi
done

ls templates/boltzmann*
