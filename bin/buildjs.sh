#!/bin/bash

rm -rf templates/boltzmann-js
tsc --project ./tsconfig-build-js.json
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
  sed -i'' -e 's/^import {\(.*\)} from '"'"'\(.*\)'"'"'/const {\1} = require("\2")/g' "$file"
  sed -i'' -e 's/^import \* as \(.*\) from '"'"'\(.*\)'"'"'/const \1 = require("\2")/g' "$file"
  sed -i'' -e 's/^import \(.*\) from '"'"'\(.*\)'"'"'/const \1 = require("\2")/g' "$file"
  sed -i'' -e 's/^export {/module.exports = {...module.exports, /g' "$file"
  sed -i'' -e 's/^export const \(.*\) = \(.*\)/const \1 = \2; module.exports.\1 = \1;/g' "$file"
done
