#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
swiftc -swift-version 5 -module-cache-path .build/module-cache src/native/FileStore.swift tests/native/main.swift -o .build/test-native
.build/test-native
