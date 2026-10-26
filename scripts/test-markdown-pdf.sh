#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache output/pdf
swiftc -swift-version 5 -module-cache-path .build/module-cache -framework AppKit -framework WebKit -framework PDFKit src/native/DocumentExporter.swift tests/markdown-pdf/main.swift -o .build/markdown-pdf-tests
.build/markdown-pdf-tests
