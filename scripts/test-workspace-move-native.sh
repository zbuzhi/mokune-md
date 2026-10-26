#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
swiftc -module-cache-path .build/module-cache src/native/FileStore.swift src/native/WorkspaceDirectory.swift src/native/WorkspaceIndex.swift src/native/WorkspaceMovePlan.swift tests/workspace-move/main.swift -o .build/test-workspace-move
.build/test-workspace-move
