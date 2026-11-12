#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build/tests .build/module-cache
xcrun swiftc native/Luma.swift tests/native-controller.swift \
  -D CONTROLLER_TEST -parse-as-library -O \
  -module-cache-path "$PWD/.build/module-cache" \
  -framework AppKit -framework WebKit -framework GameController \
  -o .build/tests/native-controller
.build/tests/native-controller
