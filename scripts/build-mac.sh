#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
APP="$PWD/dist/block2gether.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/app" "$PWD/.build/module-cache"
for ARCH in arm64 x86_64; do
  xcrun swiftc native/Luma.swift -parse-as-library -O -target "$ARCH-apple-macosx13.0" -module-cache-path "$PWD/.build/module-cache" -framework AppKit -framework WebKit -framework GameController -o "$PWD/.build/Luma-$ARCH"
done
xcrun lipo -create "$PWD/.build/Luma-arm64" "$PWD/.build/Luma-x86_64" -output "$APP/Contents/MacOS/block2gether"
cp app/*.html app/*.css app/*.js "$APP/Contents/Resources/app/"
if [ -f native/Luma.icns ]; then cp native/Luma.icns "$APP/Contents/Resources/Luma.icns"; fi
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>block2gether</string>
<key>CFBundleIdentifier</key><string>com.kverde.luma</string>
<key>CFBundleName</key><string>block2gether</string>
<key>CFBundleDisplayName</key><string>block2gether</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.1.2</string>
<key>CFBundleVersion</key><string>4</string>
<key>CFBundleIconFile</key><string>Luma</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>GCSupportsControllerUserInteraction</key><true/>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>NSHumanReadableCopyright</key><string>block2gether — blocks in harmony</string>
</dict></plist>
PLIST
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
printf 'Built %s\n' "$APP"
