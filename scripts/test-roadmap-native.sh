#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
swiftc -module-cache-path .build/module-cache src/native/FileStore.swift src/native/VersionStore.swift tests/versions/main.swift -o .build/test-versions
.build/test-versions
swiftc -module-cache-path .build/module-cache src/native/WorkspaceDirectory.swift src/native/DocumentLink.swift tests/document-link/main.swift -o .build/test-document-link
.build/test-document-link
