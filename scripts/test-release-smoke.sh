#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build output/assets output/html output/pdf docs/design/renders docs/design/implementation
cp tests/fixtures/assets/preview.svg output/assets/preview.svg
python3 -m http.server 4173 --bind 127.0.0.1 > .build/release-smoke-server.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
READY=0
for _ in {1..40}; do
  kill -0 "$SERVER_PID" 2>/dev/null || { cat .build/release-smoke-server.log; exit 1; }
  if curl -fsS http://127.0.0.1:4173/dist/web/index.html >/dev/null 2>&1; then READY=1; break; fi
  sleep 0.2
done
[[ "$READY" == 1 ]] || { echo 'Local test server failed to start.' >&2; exit 1; }
for TEST in browser-smoke markdown-coverage scientific extensions export callouts scientific-cache table-range tabs selection-transitions; do
  if [[ "$TEST" == browser-smoke ]]; then node tests/browser-smoke.mjs; else node "tests/$TEST-browser.mjs"; fi
done
node tests/highlight-lifecycle-browser.mjs
if [[ "$(uname -s)" == Darwin ]]; then
  bash scripts/test-native.sh
  bash scripts/test-webkit-interaction.sh
  bash scripts/test-markdown-pdf.sh
fi
echo 'Release smoke checks complete; nothing published.'
