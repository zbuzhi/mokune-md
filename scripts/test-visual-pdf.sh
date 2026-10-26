#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
swiftc -swift-version 5 -module-cache-path .build/module-cache -framework AppKit -framework WebKit -framework PDFKit src/native/DocumentExporter.swift tests/extensions-pdf/main.swift -o .build/visual-pdf-tests
.build/visual-pdf-tests --visual

.build/visual-pdf-tests --visual --letter
