#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ICTOOL="${ICTOOL:-/Applications/Icon Composer.app/Contents/Executables/ictool}"
if [[ ! -x "$ICTOOL" ]]; then
  echo "Icon Composer is required. Set ICTOOL to its ictool executable." >&2
  exit 1
fi
mkdir -p output/icons/liquid-glass
for generation in 26 27; do
  for rendition in Default Dark TintedLight TintedDark ClearLight ClearDark; do
    "$ICTOOL" assets/icons/liquid-glass/Mokune.icon --export-image \
      --output-file "output/icons/liquid-glass/${rendition}-${generation}.png" \
      --platform macOS --rendition "$rendition" \
      --width 512 --height 512 --scale 1 --design-generation "$generation"
  done
done
