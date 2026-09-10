#!/bin/bash
# Builds the app from src/. No toolchain, no dependencies — the whole build
# is a cat. Two outputs, same content, different packaging:
#
#   index.html         a complete HTML document. This is the app. Open it,
#                      serve it, publish it to Pages.
#   dist/artifact.html the same page as a fragment, with no doctype/html/
#                      head/body. The Claude artifact viewer supplies those
#                      itself and rejects a page that brings its own.
set -euo pipefail
cd "$(dirname "$0")"

THREE="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"

body() {
  cat src/body.html
  printf '\n<script src="%s"></script>\n' "$THREE"
  for f in src/js/*.js; do
    printf '\n<script>\n'
    cat "$f"
    printf '</script>\n'
  done
}

{
  printf '<!doctype html>\n<html lang="en">\n<head>\n'
  printf '<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  cat src/head.html
  printf '</head>\n<body>\n'
  body
  printf '</body>\n</html>\n'
} > index.html

mkdir -p dist
{ cat src/head.html; body; } > dist/artifact.html

printf 'built index.html (%s bytes) and dist/artifact.html (%s bytes)\n' \
  "$(wc -c < index.html | tr -d ' ')" "$(wc -c < dist/artifact.html | tr -d ' ')"
