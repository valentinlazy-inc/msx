#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  BASE_URL=https://example.com YAMMY_TOKEN=token ./scripts/build-static.sh
  ./scripts/build-static.sh --base-url https://example.com --yammy-token token [--out-dir dist]

Environment:
  BASE_URL       Public directory URL where the built files will be hosted.
  YAMMY_TOKEN    YummyAnime X-Application token. YUMMY_TOKEN is also accepted.
  OUT_DIR        Output directory. Defaults to dist.
USAGE
}

BASE_URL="${BASE_URL:-}"
TOKEN="${YAMMY_TOKEN:-${YUMMY_TOKEN:-}}"
OUT_DIR="${OUT_DIR:-dist}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --yammy-token|--yummy-token)
      TOKEN="${2:-}"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$BASE_URL" ]; then
  echo "BASE_URL is required." >&2
  usage >&2
  exit 2
fi

if [ -z "$TOKEN" ]; then
  echo "YAMMY_TOKEN or YUMMY_TOKEN is required." >&2
  usage >&2
  exit 2
fi

BASE_URL="${BASE_URL%/}"
mkdir -p "$OUT_DIR"

for file in start.json menu.json launch.json app.html; do
  BASE_URL="$BASE_URL" TOKEN="$TOKEN" perl -0pe 's/\{BASE\}/$ENV{BASE_URL}/g; s/\{YUMMY_TOKEN\}/$ENV{TOKEN}/g' "$file" > "$OUT_DIR/$file"
done

cp favicon.ico "$OUT_DIR/favicon.ico"

printf 'Built static MSX files into %s\n' "$OUT_DIR"
printf 'Start URL: %s/start.json\n' "$BASE_URL"
