#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
APP="${1:-dist/Mokune MD.app}"
STYLE="${MOKUNE_ICON_STYLE:-original}"
case "$STYLE" in original|auto|glass|legacy) ;; *) echo "MOKUNE_ICON_STYLE must be original, auto, glass or legacy" >&2; exit 1 ;; esac
use_legacy() {
  rm -f "$APP/Contents/Resources/Assets.car"
  cp assets/icons/Mokune.icns "$APP/Contents/Resources/"
  /usr/libexec/PlistBuddy -c 'Delete :CFBundleIconName' "$APP/Contents/Info.plist" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c 'Delete :CFBundleIconFile' "$APP/Contents/Info.plist" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c 'Add :CFBundleIconFile string Mokune.icns' "$APP/Contents/Info.plist"
}
if [[ "$STYLE" == legacy ]]; then
  use_legacy
  echo "Using the approved original MD7 ICNS icon."
  exit 0
fi
if [[ -z "${DEVELOPER_DIR:-}" && -d /Applications/Xcode.app/Contents/Developer ]]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi
if ! ACTOOL="$(xcrun --find actool 2>/dev/null)"; then
  if [[ "$STYLE" == glass ]]; then
    echo "Liquid Glass icons require full Xcode with actool." >&2
    exit 1
  fi
  use_legacy
  echo "Full Xcode unavailable; using legacy ICNS icon." >&2
  exit 0
fi
ICON_DOCUMENT="$PWD/assets/icons/liquid-glass/Mokune.icon"
if [[ "$STYLE" == original ]]; then
  ICON_DOCUMENT="$PWD/assets/icons/original/Mokune.icon"
  cmp assets/icons/mokune-master.png "$ICON_DOCUMENT/Assets/approved-md7.png"
fi
STAGING="$(mktemp -d "$PWD/.build/glass-icons.XXXXXX")"
trap 'rm -rf "$STAGING"' EXIT
mkdir -p "$STAGING/Resources"
"$ACTOOL" "$ICON_DOCUMENT" \
  --compile "$STAGING/Resources" \
  --platform macosx --minimum-deployment-target 13.3 \
  --app-icon Mokune --target-device mac \
  --output-partial-info-plist "$STAGING/icon-info.plist"
test -s "$STAGING/Resources/Assets.car"
cp -R "$STAGING/Resources/." "$APP/Contents/Resources/"
/usr/libexec/PlistBuddy -c 'Delete :CFBundleIconFile' "$APP/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Merge $STAGING/icon-info.plist" "$APP/Contents/Info.plist"
if [[ "$STYLE" == original ]]; then
  cp assets/icons/Mokune.icns "$APP/Contents/Resources/Mokune.icns"
  /usr/libexec/PlistBuddy -c 'Set :CFBundleIconFile Mokune.icns' "$APP/Contents/Info.plist"
  echo "Compiled modern icon catalog directly from approved original MD7 artwork."
else
  echo "Compiled Liquid Glass icon and compatibility renditions."
fi
