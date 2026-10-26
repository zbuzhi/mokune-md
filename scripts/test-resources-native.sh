#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
swiftc -module-cache-path .build/module-cache src/native/FileStore.swift src/native/ImageImport.swift src/native/WorkspaceDirectory.swift src/native/ResourceInventory.swift tests/resources/main.swift -o .build/test-resources
.build/test-resources
