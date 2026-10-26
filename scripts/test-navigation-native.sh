#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
swiftc -swift-version 5 -O -module-cache-path .build/module-cache src/native/WorkspaceDirectory.swift tests/native-navigation/main.swift -o .build/test-navigation-native
.build/test-navigation-native
