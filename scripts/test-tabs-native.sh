#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/module-cache
swiftc -module-cache-path .build/module-cache src/native/FileStore.swift src/native/SessionArchive.swift src/native/DiskMergeSnapshot.swift src/native/DocumentSession.swift src/native/RecoveryArchive.swift tests/tabs/main.swift -o .build/test-tabs
.build/test-tabs
swiftc -module-cache-path .build/module-cache src/native/WorkspaceDirectory.swift src/native/FileStore.swift src/native/SessionArchive.swift src/native/DiskMergeSnapshot.swift src/native/DocumentSession.swift src/native/WorkspaceRemoval.swift tests/workspace-removal/main.swift -o .build/test-removal
.build/test-removal
