#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
APP="${1:-dist/Mokune MD.app}"
STYLE="${MOKUNE_ICON_STYLE:-original}"
PLIST="$APP/Contents/Info.plist"
ICON_FILE=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "$PLIST")
if [[ "$STYLE" == original || "$STYLE" == legacy ]]; then
  [[ "$ICON_FILE" == Mokune.icns ]]
  cmp assets/icons/Mokune.icns "$APP/Contents/Resources/Mokune.icns"
  if [[ "$STYLE" == original && -s "$APP/Contents/Resources/Assets.car" ]]; then
    cmp assets/icons/mokune-master.png assets/icons/original/Mokune.icon/Assets/approved-md7.png
    [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconName' "$PLIST")" == Mokune ]]
    mkdir -p .build
    ICON_CATALOG_INFO=$(mktemp "$PWD/.build/icon-verify.XXXXXX")
    trap 'rm -f "$ICON_CATALOG_INFO"' EXIT
    /usr/bin/assetutil --info "$APP/Contents/Resources/Assets.car" > "$ICON_CATALOG_INFO"
    /usr/bin/grep -F 'approved-md7' "$ICON_CATALOG_INFO" >/dev/null
    if /usr/bin/grep -F 'md-mark' "$ICON_CATALOG_INFO" >/dev/null; then
      echo 'Original MD7 catalog unexpectedly contains the redrawn lettermark.' >&2
      exit 1
    fi
  elif /usr/libexec/PlistBuddy -c 'Print :CFBundleIconName' "$PLIST" >/dev/null 2>&1; then
    echo 'Static MD7 fallback must not have an unresolved catalog icon name.' >&2
    exit 1
  fi
  echo 'Verified: approved original MD7 artwork and exact compatibility ICNS.'
else
  test -s "$APP/Contents/Resources/Mokune.icns"
  if [[ "$STYLE" == glass ]]; then
    test -s "$APP/Contents/Resources/Assets.car"
    [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconName' "$PLIST")" == Mokune ]]
  fi
  echo "Verified icon packaging for $STYLE."
fi
