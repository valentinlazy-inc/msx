#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
DIST_DIR="${DIST_DIR:-$ROOT_DIR/dist}"
STATIC_DIR="$DIST_DIR/static"

rm -rf "$DIST_DIR"
mkdir -p "$STATIC_DIR"

cp "$ROOT_DIR/worker.js" "$DIST_DIR/worker.js"
cp "$ROOT_DIR/app.html" "$ROOT_DIR/start.json" "$ROOT_DIR/menu.json" "$ROOT_DIR/launch.json" "$STATIC_DIR/"
cp "$ROOT_DIR/favicon.ico" "$STATIC_DIR/favicon.ico"

if [ -f "$ROOT_DIR/logo_pink.png" ]; then
  cp "$ROOT_DIR/logo_pink.png" "$STATIC_DIR/logo_pink.png"
fi

if [ -d "$ROOT_DIR/assets" ]; then
  cp -R "$ROOT_DIR/assets" "$STATIC_DIR/assets"
fi

printf 'Built Cloudflare bundle into %s\n' "$DIST_DIR"
printf 'Worker entry: %s/worker.js\n' "$DIST_DIR"
printf 'Static assets: %s\n' "$STATIC_DIR"
