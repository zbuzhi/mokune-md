#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
swiftc -module-cache-path .build/module-cache src/native/FileStore.swift src/native/DiskMergeSnapshot.swift tests/merge-snapshot/main.swift -o .build/test-merge-native
.build/test-merge-native
