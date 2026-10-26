#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
swiftc -swift-version 5 -module-cache-path .build/module-cache src/native/WorkspaceWatcher.swift tests/workspace-watch/main.swift -o .build/test-workspace-watch
.build/test-workspace-watch
