#!/usr/bin/env bash
# Copies the wasm-bindgen output (no-modules build) into plugin/client/lib/.
#   tools/build.sh            copy wasm/demo/corvo.js + corvo_bg.wasm
#   tools/build.sh --rebuild  rebuild the wasm first (commands from wasm/README.md)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$PLUGIN/.." && pwd)"
WASM="$ROOT/wasm"
LIB="$PLUGIN/client/lib"

if [[ "${1:-}" == "--rebuild" ]]; then
  echo "[build] cargo build (wasm32-unknown-unknown, release)"
  ( cd "$WASM" && RUSTFLAGS='--cfg getrandom_backend="wasm_js"' \
      cargo build --release --target wasm32-unknown-unknown )
  echo "[build] wasm-bindgen --target no-modules"
  ( cd "$WASM" && wasm-bindgen --target no-modules --out-dir demo --out-name corvo \
      target/wasm32-unknown-unknown/release/corvo_wasm.wasm )
fi

for f in corvo.js corvo_bg.wasm; do
  [[ -f "$WASM/demo/$f" ]] || { echo "[build] missing $WASM/demo/$f (run with --rebuild)" >&2; exit 1; }
done
mkdir -p "$LIB"
cp "$WASM/demo/corvo.js" "$WASM/demo/corvo_bg.wasm" "$LIB/"
echo "[build] copied corvo.js ($(wc -c < "$LIB/corvo.js") B) and corvo_bg.wasm ($(wc -c < "$LIB/corvo_bg.wasm") B) -> $LIB"
[[ -f "$LIB/clipper.js" ]] || echo "[build] warning: $LIB/clipper.js missing (vendored clipper-lib 6.4.2)"
