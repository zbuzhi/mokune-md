#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
swiftc -module-cache-path .build/module-cache src/native/FileStore.swift src/native/SessionArchive.swift src/native/DiskMergeSnapshot.swift src/native/DocumentSession.swift tests/session/main.swift -o .build/test-session
.build/test-session
