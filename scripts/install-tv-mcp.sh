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

# Kill ANY running tv-mcp process (including legacy copies bundled
# inside /Applications/TV Client.app or at ~/.tv-desktop/bin/tv-mcp).
if pgrep -x tv-mcp >/dev/null 2>&1; then
  echo "Stopping running tv-mcp processes (including any legacy copies)..."
  pkill -9 -x tv-mcp || true
  sleep 1
fi

# Warn about legacy bundled binary, if present — the new flow replaces it.
LEGACY_BUNDLED="/Applications/TV Client.app/Contents/Resources/tv-mcp"
LEGACY_OLD_STANDALONE="$HOME/.tv-desktop/bin/tv-mcp"
if [ -f "$LEGACY_BUNDLED" ] || [ -f "$LEGACY_OLD_STANDALONE" ]; then
  echo ""
  echo "⚠️  Detected legacy tv-mcp install:"
  [ -f "$LEGACY_BUNDLED" ] && echo "     $LEGACY_BUNDLED  (bundled inside TV Client.app, pre-v0.10.30)"
  [ -f "$LEGACY_OLD_STANDALONE" ] && echo "     $LEGACY_OLD_STANDALONE  (old standalone location)"
  echo "    These are ignored once Claude Desktop/Code are reconfigured below."
  echo "    You can safely delete ~/.tv-desktop/ after this script completes."
  echo ""
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

# Register with Claude Desktop (if installed)
CLAUDE_DESKTOP_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
if [ -d "/Applications/Claude.app" ] || [ -f "$CLAUDE_DESKTOP_CONFIG" ]; then
  echo "Registering tv-mcp with Claude Desktop..."
  mkdir -p "$(dirname "$CLAUDE_DESKTOP_CONFIG")"
  [ -f "$CLAUDE_DESKTOP_CONFIG" ] || echo '{}' > "$CLAUDE_DESKTOP_CONFIG"

  python3 - "$CLAUDE_DESKTOP_CONFIG" "$DEST" <<'PY'
import json, sys
path, dest = sys.argv[1], sys.argv[2]
with open(path) as f:
    try: cfg = json.load(f)
    except Exception: cfg = {}
cfg.setdefault("mcpServers", {})["tv-mcp"] = {"command": dest}
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
PY
  echo "   Updated: $CLAUDE_DESKTOP_CONFIG"
  echo "   ⚠️  Restart Claude Desktop for changes to take effect."
else
  echo "Claude Desktop not detected — skipping Desktop registration."
fi
echo ""

# Register with Claude Code CLI (if installed)
if command -v claude >/dev/null 2>&1; then
  CURRENT=$(claude mcp list 2>/dev/null | grep -E '^tv-mcp:' || true)
  if echo "$CURRENT" | grep -qF "$DEST"; then
    echo "Claude Code CLI already points at $DEST — no changes needed."
  else
    if [ -n "$CURRENT" ]; then
      claude mcp remove tv-mcp >/dev/null 2>&1 || true
    fi
    claude mcp add tv-mcp "$DEST"
    echo "Registered tv-mcp with Claude Code CLI."
  fi
fi

echo ""
echo "✅ Done."
