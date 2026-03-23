#!/bin/bash
# Build tv-mcp sidecar binary with correct Tauri naming convention
#
# Tauri expects: binaries/tv-mcp-{target-triple}
# e.g. binaries/tv-mcp-aarch64-apple-darwin
#
# Usage:
#   ./scripts/build-sidecar.sh          # release build
#   ./scripts/build-sidecar.sh debug    # debug build (for dev)

set -euo pipefail

PROFILE="${1:-release}"
TARGET="${TAURI_TARGET_TRIPLE:-$(rustc -vV | grep host | awk '{print $2}')}"

echo "[build-sidecar] Building tv-mcp for $TARGET ($PROFILE)..."

cd src-tauri

# Determine destination path
mkdir -p binaries
DEST="binaries/tv-mcp-${TARGET}"
if [[ "$TARGET" == *"windows"* ]]; then
    DEST="${DEST}.exe"
fi

# Create placeholder so Tauri's build.rs doesn't fail during compilation
# (Tauri validates sidecar existence before the binary is compiled)
if [ ! -f "$DEST" ]; then
    touch "$DEST"
    chmod +x "$DEST" 2>/dev/null || true
fi

# Build the actual binary
if [ "$PROFILE" = "debug" ]; then
    cargo build --bin tv-mcp
    SRC="target/debug/tv-mcp"
else
    cargo build --release --bin tv-mcp
    SRC="target/release/tv-mcp"
fi

if [[ "$TARGET" == *"windows"* ]]; then
    SRC="${SRC}.exe"
fi

# Replace placeholder with real binary
cp "$SRC" "$DEST"
chmod +x "$DEST" 2>/dev/null || true

# Print version for verification
VERSION=$("$DEST" --version 2>/dev/null || echo "unknown")
echo "[build-sidecar] Built $DEST ($VERSION)"
