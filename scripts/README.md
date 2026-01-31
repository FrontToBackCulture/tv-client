# tv-mcp Setup for Claude Desktop

This guide explains how to connect tv-desktop's MCP tools to Claude Desktop.

## What This Does

After setup, Claude Desktop will have access to tv-desktop's tools:
- **Work** - Projects, tasks, milestones, initiatives
- **CRM** - Companies, contacts, deals, activities
- **Generation** - Gamma presentations, Nanobanana images
- **Intercom** - Help center publishing
- **Document Generation** - Order forms, proposals
- **VAL Sync** - Domain sync and status

## Quick Setup

### macOS

1. Install tv-desktop
2. Open Terminal
3. Run:
   ```bash
   /path/to/tv-desktop/scripts/setup-claude-mcp.sh
   ```
4. Restart Claude Desktop

### Windows

1. Install tv-desktop
2. Right-click `setup-claude-mcp.ps1` → "Run with PowerShell"

   Or open PowerShell and run:
   ```powershell
   .\setup-claude-mcp.ps1
   ```
3. Restart Claude Desktop

## Manual Setup

If the scripts don't work, you can configure manually:

### macOS

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tv-mcp": {
      "command": "/Applications/tv-desktop.app/Contents/MacOS/tv-mcp"
    }
  }
}
```

### Windows

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tv-mcp": {
      "command": "C:\\Program Files\\tv-desktop\\tv-mcp.exe"
    }
  }
}
```

Adjust the path based on where tv-desktop is installed.

## Verify Setup

After restarting Claude Desktop:
1. Open a new conversation
2. Ask Claude to "list work projects" or "list crm companies"
3. Claude should use the tv-mcp tools to respond

## Troubleshooting

### "Tool not found" errors
- Make sure tv-desktop is installed
- Verify the path in config points to the actual `tv-mcp` binary
- Restart Claude Desktop after config changes

### Config file doesn't exist
- Open Claude Desktop at least once to create the config directory
- Then run the setup script again

### Permission errors (macOS)
- Make sure the script is executable: `chmod +x setup-claude-mcp.sh`

### PowerShell execution policy (Windows)
- If blocked, run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
- Then try the script again

## Updating

If you update tv-desktop to a new version, you don't need to re-run setup unless the binary location changes.
