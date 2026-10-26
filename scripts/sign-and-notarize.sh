#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${1:---plan}" == --plan ]]; then
  echo 'Plan only: public-source and EPL gates -> copy app -> Developer ID + hardened runtime -> ZIP -> Apple notarytool -> accepted status -> staple -> verify -> re-ZIP + hash. No commands executed.'
  exit 0
fi
[[ "${1:-}" == --execute ]] || { echo 'Use --plan, or explicitly --execute with signing identity and keychain profile.' >&2; exit 1; }
: "${MOKUNE_SIGN_IDENTITY:?Set a Developer ID Application identity already available in Keychain}"
: "${MOKUNE_NOTARY_PROFILE:?Set an existing notarytool Keychain profile name; never pass passwords here}"
node scripts/release-gate.mjs --public-source
node scripts/audit-bundle-licenses.mjs --public-binary
APP='dist/Mokune MD.app'
mkdir -p .release
STAGING=$(mktemp -d "$PWD/.release/signing.XXXXXX")
ditto "$APP" "$STAGING/Mokune MD.app"
FRAMEWORK="$STAGING/Mokune MD.app/Contents/Frameworks/Sparkle.framework"
if [[ -d "$FRAMEWORK" ]]; then
  # Explicit upstream Sparkle signing order. Do not use --deep to sign nested code.
  codesign --force --options runtime --timestamp --sign "$MOKUNE_SIGN_IDENTITY" "$FRAMEWORK/Versions/B/XPCServices/Installer.xpc"
  codesign --force --options runtime --timestamp --preserve-metadata=entitlements --sign "$MOKUNE_SIGN_IDENTITY" "$FRAMEWORK/Versions/B/XPCServices/Downloader.xpc"
  codesign --force --options runtime --timestamp --sign "$MOKUNE_SIGN_IDENTITY" "$FRAMEWORK/Versions/B/Autoupdate"
  codesign --force --options runtime --timestamp --sign "$MOKUNE_SIGN_IDENTITY" "$FRAMEWORK/Versions/B/Updater.app"
  codesign --force --options runtime --timestamp --sign "$MOKUNE_SIGN_IDENTITY" "$FRAMEWORK"
fi
codesign --force --options runtime --timestamp --sign "$MOKUNE_SIGN_IDENTITY" "$STAGING/Mokune MD.app"
codesign --verify --deep --strict "$STAGING/Mokune MD.app"
node --input-type=module -e 'import{binaryEvidence}from"./scripts/lib/binary-evidence.mjs";const e=binaryEvidence(process.argv[1]);if(!e.developerID||!e.hardenedRuntime||!e.signatureVerified)throw Error("Expected verified Developer ID and runtime signature");' "$STAGING/Mokune MD.app"
ditto -c -k --sequesterRsrc --keepParent "$STAGING/Mokune MD.app" "$STAGING/submission.zip"
xcrun notarytool submit "$STAGING/submission.zip" --keychain-profile "$MOKUNE_NOTARY_PROFILE" --wait --output-format json > "$STAGING/notary-result.json"
node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1]));if(s.status!=="Accepted")throw Error("Notarization was not accepted; inspect local result");' "$STAGING/notary-result.json"
xcrun stapler staple "$STAGING/Mokune MD.app"
xcrun stapler validate "$STAGING/Mokune MD.app"
codesign --verify --deep --strict "$STAGING/Mokune MD.app"
ditto -c -k --sequesterRsrc --keepParent "$STAGING/Mokune MD.app" "$STAGING/notarized-local.zip"
(cd "$STAGING" && shasum -a 256 notarized-local.zip > SHA256SUMS.txt)
echo "Notarized local candidate: $STAGING. No GitHub publication or feed update performed."
