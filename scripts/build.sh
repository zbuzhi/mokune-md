#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(uname -s)" == Darwin ]] || { echo 'Native app build requires macOS.' >&2; exit 1; }
command -v node >/dev/null
xcrun --find swiftc >/dev/null
ARCH="${MOKUNE_ARCH:-$(uname -m)}"
case "$ARCH" in arm64|x86_64|universal) ;; *) echo 'MOKUNE_ARCH must be arm64, x86_64 or universal' >&2; exit 1 ;; esac
node scripts/fetch-sparkle.mjs
SPARKLE_VERSION=$(node -p 'JSON.parse(require("fs").readFileSync("legal/sparkle.json")).version')
SPARKLE_ROOT=".build/sparkle-$SPARKLE_VERSION"
node scripts/build-web.mjs
node scripts/third-party.mjs
node scripts/audit-bundle-licenses.mjs
bash scripts/build-icons.sh
APP="dist/Mokune MD.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" .build/module-cache
MINIMUM_OS=$(node -p 'JSON.parse(require("fs").readFileSync("app.build.json")).minimumSystemVersion')
TARGETS=("$ARCH")
if [[ "$ARCH" == universal ]]; then TARGETS=(arm64 x86_64); fi
for TARGET in "${TARGETS[@]}"; do
  swiftc -swift-version 5 -O -target "$TARGET-apple-macosx$MINIMUM_OS" -module-cache-path .build/module-cache -framework AppKit -framework WebKit -framework UniformTypeIdentifiers -F "$SPARKLE_ROOT" -framework Sparkle -Xlinker -rpath -Xlinker @executable_path/../Frameworks src/native/*.swift -o ".build/Mokune-$TARGET"
done
if [[ "$ARCH" == universal ]]; then
  lipo -create .build/Mokune-arm64 .build/Mokune-x86_64 -output "$APP/Contents/MacOS/Mokune"
  lipo "$APP/Contents/MacOS/Mokune" -verify_arch arm64
  lipo "$APP/Contents/MacOS/Mokune" -verify_arch x86_64
else
  cp ".build/Mokune-$ARCH" "$APP/Contents/MacOS/Mokune"
  lipo "$APP/Contents/MacOS/Mokune" -verify_arch "$ARCH"
fi
rm -rf "$APP/Contents/Resources/web"
mkdir -p "$APP/Contents/Resources/web" "$APP/Contents/Resources/legal"
cp -R dist/web/. "$APP/Contents/Resources/web/"
cp THIRD_PARTY_NOTICES.md LICENSE NOTICE PRIVACY.md SOURCE_AVAILABILITY.md "$APP/Contents/Resources/"
cp legal/sbom.cdx.json legal/elk-source.json legal/elk-java-components.json legal/elk-java-build-inputs.md "$APP/Contents/Resources/legal/"
cp assets/icons/Mokune.icns "$APP/Contents/Resources/"
node scripts/write-app-plist.mjs "$APP/Contents/Info.plist"
bash scripts/build-glass-icons.sh "$APP"
bash scripts/verify-app-icon.sh "$APP"
mkdir -p "$APP/Contents/Frameworks"
rm -rf "$APP/Contents/Frameworks/Sparkle.framework"
ditto "$SPARKLE_ROOT/Sparkle.framework" "$APP/Contents/Frameworks/Sparkle.framework"
cp licenses/Sparkle-2.10.1.txt "$APP/Contents/Resources/"
# Keep Sparkle's signed helpers intact. Sign the enclosing framework, then the app.
codesign --force --sign - "$APP/Contents/Frameworks/Sparkle.framework"
codesign --force --sign - "$APP"
codesign --verify --deep --strict "$APP"
node scripts/build-manifest.mjs "$APP" "$ARCH"
echo "Built local ad-hoc app: $PWD/$APP ($ARCH); not notarized or published."
