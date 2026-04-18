#!/bin/bash
# Installs the standalone tv-mcp binary to ~/.tv-mcp/bin/tv-mcp.
# Requires the GitHub CLI (`gh`) authenticated against FrontToBackCulture
# because the tv-mcp repo is private.

set -e

REPO="FrontToBackCulture/tv-mcp"
DEST_DIR="$HOME/.tv-mcp/bin"
DEST="$DEST_DIR/tv-mcp"

echo "=== tv-mcp installer (macOS) ==="

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI (gh) is not installed."
  echo "Install it from https://cli.github.com/ then run: gh auth login"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh is not authenticated. Run: gh auth login"
  exit 1
fi

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

echo "Downloading latest $ASSET from $REPO..."
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

gh release download --repo "$REPO" --pattern "$ASSET" --dir "$TMP_DIR"

mv "$TMP_DIR/$ASSET" "$DEST"
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
