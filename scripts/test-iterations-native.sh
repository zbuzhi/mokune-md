#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
swiftc -module-cache-path .build/module-cache src/native/RecentDocuments.swift tests/recent/main.swift -o .build/test-recent
.build/test-recent
swiftc -module-cache-path .build/module-cache src/native/WorkspaceDirectory.swift src/native/WorkspaceIndex.swift src/native/WorkspaceSearch.swift tests/workspace-search/main.swift -o .build/test-workspace-search
.build/test-workspace-search
swiftc -module-cache-path .build/module-cache src/native/ImageImport.swift tests/image-import/main.swift -o .build/test-image-import
.build/test-image-import
