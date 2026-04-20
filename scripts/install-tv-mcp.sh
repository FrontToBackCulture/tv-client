#!/bin/bash
# Installs the standalone tv-mcp binary to ~/.tv-mcp/bin/tv-mcp.
# tv-mcp is a public repo, so no authentication is required.

set -e

REPO="FrontToBackCulture/tv-mcp"
DEST_DIR="$HOME/.tv-mcp/bin"
DEST="$DEST_DIR/tv-mcp"

echo "=== tv-mcp installer (macOS) ==="

ARCH=$(uname -m)
case "$ARCH" in
  arm64) ASSET="tv-mcp-aarch64-apple-darwin" ;;
  *)
    echo "ERROR: Only Apple Silicon (arm64) is supported. Detected: $ARCH"
    exit 1
    ;;
esac

# Kill anything currently running so we can overwrite the binary
if pgrep -f "$DEST" >/dev/null 2>&1; then
  echo "Stopping running tv-mcp processes..."
  pkill -9 -f "$DEST" || true
  sleep 1
fi

mkdir -p "$DEST_DIR"

URL="https://github.com/$REPO/releases/latest/download/$ASSET"
echo "Downloading $URL..."

curl -fL --progress-bar -o "$DEST" "$URL"
chmod +x "$DEST"
xattr -d com.apple.quarantine "$DEST" 2>/dev/null || true

VERSION=$("$DEST" --version 2>/dev/null || echo "unknown")
echo ""
echo "✅ Installed: $DEST"
echo "   Version:   $VERSION"
echo ""

# Offer to register with Claude Code
if command -v claude >/dev/null 2>&1; then
  CURRENT=$(claude mcp list 2>/dev/null | grep -E '^tv-mcp:' || true)
  if echo "$CURRENT" | grep -qF "$DEST"; then
    echo "Claude Code already points at $DEST — no changes needed."
  else
    if [ -n "$CURRENT" ]; then
      echo "Claude Code currently has: $CURRENT"
      echo "Updating to point at $DEST..."
      claude mcp remove tv-mcp >/dev/null 2>&1 || true
    else
      echo "Registering tv-mcp with Claude Code..."
    fi
    claude mcp add tv-mcp "$DEST"
    echo ""
    claude mcp list | grep -E '^tv-mcp:' || true
  fi
else
  echo "Claude Code (claude) not found on PATH — skipping registration."
  echo "To register manually later: claude mcp add tv-mcp \"$DEST\""
fi

echo ""
echo "Done. Run \`claude mcp list\` any time to verify."
