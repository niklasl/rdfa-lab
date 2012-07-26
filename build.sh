#!/bin/sh

coffee -cb js/rdfa-json.coffee

cat js/jsonld/core.js js/ld.js js/rdf.js js/rdfa-json.js js/lore.js \
    > build/lore-all.js

if [[ $1 == '--min' ]]; then
    uglifyjs -o build/lore-all-min.js build/lore-all.js
fi
