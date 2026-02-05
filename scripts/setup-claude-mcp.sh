#!/bin/bash
# Setup script for tv-mcp in Claude Desktop (macOS)
# Run this after installing tv-client

set -e

echo "=== tv-mcp Setup for Claude Desktop (macOS) ==="
echo ""

# Determine tv-mcp binary location
# Check common locations
if [ -f "/Applications/tv-client.app/Contents/MacOS/tv-mcp" ]; then
    TV_MCP_PATH="/Applications/tv-client.app/Contents/MacOS/tv-mcp"
elif [ -f "$HOME/Applications/tv-client.app/Contents/MacOS/tv-mcp" ]; then
    TV_MCP_PATH="$HOME/Applications/tv-client.app/Contents/MacOS/tv-mcp"
elif [ -f "$(dirname "$0")/../src-tauri/target/release/tv-mcp" ]; then
    # Development mode
    TV_MCP_PATH="$(cd "$(dirname "$0")/../src-tauri/target/release" && pwd)/tv-mcp"
else
    echo "Error: Could not find tv-mcp binary."
    echo "Please enter the full path to tv-mcp:"
    read -r TV_MCP_PATH
    if [ ! -f "$TV_MCP_PATH" ]; then
        echo "Error: File not found at $TV_MCP_PATH"
        exit 1
    fi
fi

echo "Found tv-mcp at: $TV_MCP_PATH"

# Claude Desktop config location
CONFIG_DIR="$HOME/Library/Application Support/Claude"
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

# Create config directory if it doesn't exist
mkdir -p "$CONFIG_DIR"

# Check if config file exists
if [ -f "$CONFIG_FILE" ]; then
    echo "Found existing Claude Desktop config"

    # Check if tv-mcp is already configured
    if grep -q '"tv-mcp"' "$CONFIG_FILE"; then
        echo "tv-mcp is already configured in Claude Desktop"
        echo "Current config:"
        cat "$CONFIG_FILE"
        echo ""
        read -p "Do you want to update the configuration? (y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Setup cancelled."
            exit 0
        fi
    fi

    # Backup existing config
    cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
    echo "Backed up existing config to $CONFIG_FILE.backup"

    # Use Python to merge the config (handles JSON properly)
    python3 << EOF
import json
import sys

config_file = "$CONFIG_FILE"
tv_mcp_path = "$TV_MCP_PATH"

try:
    with open(config_file, 'r') as f:
        config = json.load(f)
except:
    config = {}

if 'mcpServers' not in config:
    config['mcpServers'] = {}

config['mcpServers']['tv-mcp'] = {
    'command': tv_mcp_path
}

with open(config_file, 'w') as f:
    json.dump(config, f, indent=2)

print("Configuration updated successfully!")
EOF

else
    # Create new config
    cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "tv-mcp": {
      "command": "$TV_MCP_PATH"
    }
  }
}
EOF
    echo "Created new Claude Desktop config"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Configuration saved to: $CONFIG_FILE"
echo ""
cat "$CONFIG_FILE"
echo ""
echo "Please restart Claude Desktop for changes to take effect."
echo ""
