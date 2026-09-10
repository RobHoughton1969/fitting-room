#!/bin/bash
# Concatenates src/ into the single-file app at index.html.
# No toolchain, no dependencies — the whole build is a cat.
set -euo pipefail
cd "$(dirname "$0")"

THREE="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"

{
  cat src/head.html
  cat src/body.html
  printf '\n<script src="%s"></script>\n' "$THREE"
  for f in src/js/*.js; do
    printf '\n<script>\n'
    cat "$f"
    printf '</script>\n'
  done
} > index.html

printf 'built index.html — %s bytes\n' "$(wc -c < index.html | tr -d ' ')"
