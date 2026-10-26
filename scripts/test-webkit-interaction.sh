#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache output/assets
cp tests/fixtures/assets/preview.svg output/assets/preview.svg
swiftc -swift-version 5 -module-cache-path .build/module-cache -framework AppKit -framework WebKit tests/webkit-interaction/main.swift -o .build/webkit-interaction-tests
.build/webkit-interaction-tests
