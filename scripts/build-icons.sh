#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ICONSET=".build/Mokune.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" assets/icons/mokune-master.png --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  retina=$((size * 2))
  sips -z "$retina" "$retina" assets/icons/mokune-master.png --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o assets/icons/Mokune.icns
