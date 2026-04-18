# tv-client + tv-mcp Install Guide

As of tv-client v0.10.30, `tv-mcp` is no longer bundled inside the tv-client app. You install the two separately:

- **tv-client** — the desktop app (UI)
- **tv-mcp** — a standalone binary that Claude Code / Claude Desktop call to access ThinkVAL tools

Both read settings from `~/.tv-mcp/settings.json` (shared) and `~/.tv-client/` (tv-client-only files). On Windows the equivalents are `%USERPROFILE%\.tv-mcp\settings.json` and `%USERPROFILE%\.tv-client\`.

---

## macOS

### 1. Install tv-client

1. Go to https://github.com/FrontToBackCulture/tv-client/releases/latest
2. Download `TV.Client_<version>_arm64.dmg` (Apple Silicon)
3. Open the DMG, drag **TV Client** to **Applications**
4. First launch: if Gatekeeper blocks it, right-click the app → **Open** → confirm

On first launch, the app auto-migrates any existing `~/.tv-desktop/` data into `~/.tv-mcp/` and `~/.tv-client/`.

### 2. Install tv-mcp (and register with Claude Code)

Run the installer script — it downloads the latest tv-mcp release, places it at `~/.tv-mcp/bin/tv-mcp`, and updates your Claude Code MCP config in one shot:

```bash
/path/to/tv-client/scripts/install-tv-mcp.sh
```

Prerequisite: the [GitHub CLI](https://cli.github.com/) (`gh`) must be installed and authenticated (`gh auth login`) — the tv-mcp repo is private, so `gh` is how the script authenticates the download.

Manual alternative:

```bash
mkdir -p ~/.tv-mcp/bin
# download tv-mcp-aarch64-apple-darwin from https://github.com/FrontToBackCulture/tv-mcp/releases/latest
mv ~/Downloads/tv-mcp-aarch64-apple-darwin ~/.tv-mcp/bin/tv-mcp
chmod +x ~/.tv-mcp/bin/tv-mcp
xattr -d com.apple.quarantine ~/.tv-mcp/bin/tv-mcp 2>/dev/null || true
~/.tv-mcp/bin/tv-mcp --version

claude mcp remove tv-mcp 2>/dev/null || true
claude mcp add tv-mcp "$HOME/.tv-mcp/bin/tv-mcp"
claude mcp list
```

Expected line in `claude mcp list`:
```
tv-mcp: /Users/<you>/.tv-mcp/bin/tv-mcp  - ✓ Connected
```

### 3. (Optional) Register with Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tv-mcp": {
      "command": "/Users/<you>/.tv-mcp/bin/tv-mcp"
    }
  }
}
```

Restart Claude Desktop.

### 4. Verify

```bash
~/.tv-mcp/bin/tv-mcp --version

# No old bundled binary inside the app
find "/Applications/TV Client.app" -name "tv-mcp*" 2>/dev/null   # should be empty

# Launch TV Client, then check spawned processes
pgrep -lf tv-mcp
# Every path should start with /Users/<you>/.tv-mcp/bin/tv-mcp
# NOT /Applications/TV Client.app/Contents/... and NOT ~/.tv-desktop/bin/...
```

In Claude Code, run `/mcp` — `tv-mcp` should show as connected. Try "list crm companies" to confirm.

### Cleanup (macOS)

After verifying:
```bash
rm -rf ~/.tv-desktop
```

---

## Windows

### 1. Install tv-client

1. Go to https://github.com/FrontToBackCulture/tv-client/releases/latest
2. Download `TV.Client_<version>_x64-setup.exe`
3. Run the installer. SmartScreen may warn — click **More info → Run anyway**
4. Launch TV Client from the Start Menu

### 2. Install tv-mcp (and register with Claude Code)

Open PowerShell and run:

```powershell
cd C:\path\to\tv-client\scripts
.\install-tv-mcp.ps1
```

If blocked by execution policy, run this once (current user only, safe):
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Prerequisite: the [GitHub CLI](https://cli.github.com/) (`gh`) must be installed and authenticated (`gh auth login`).

Manual alternative:

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\.tv-mcp\bin"
# download tv-mcp-x86_64-pc-windows-msvc.exe from https://github.com/FrontToBackCulture/tv-mcp/releases/latest
Move-Item "$HOME\Downloads\tv-mcp-x86_64-pc-windows-msvc.exe" "$HOME\.tv-mcp\bin\tv-mcp.exe"
& "$HOME\.tv-mcp\bin\tv-mcp.exe" --version

claude mcp remove tv-mcp 2>$null
claude mcp add tv-mcp "$HOME\.tv-mcp\bin\tv-mcp.exe"
claude mcp list
```

Expected line:
```
tv-mcp: C:\Users\<you>\.tv-mcp\bin\tv-mcp.exe  - ✓ Connected
```

### 3. (Optional) Register with Claude Desktop

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tv-mcp": {
      "command": "C:\\Users\\<you>\\.tv-mcp\\bin\\tv-mcp.exe"
    }
  }
}
```

Restart Claude Desktop.

### 4. Verify

```powershell
& "$HOME\.tv-mcp\bin\tv-mcp.exe" --version

# No old bundled binary inside the install dir
Get-ChildItem -Recurse "$env:LOCALAPPDATA\tv-client","$env:ProgramFiles\tv-client" -Filter tv-mcp.exe -ErrorAction SilentlyContinue
# should return nothing

# Launch TV Client, then check running tv-mcp processes
Get-Process tv-mcp | Select-Object Path
# Every Path should be C:\Users\<you>\.tv-mcp\bin\tv-mcp.exe
```

In Claude Code, run `/mcp` — `tv-mcp` should show as connected.

---

## Updating

When a new release ships:

**tv-client:** download the new installer and re-run (macOS: drag-to-Applications overwrites; Windows: installer updates in place).

**tv-mcp:** re-run `scripts/install-tv-mcp.sh` (macOS) or `scripts/install-tv-mcp.ps1` (Windows). The script stops any running tv-mcp processes, downloads the latest release, and overwrites the binary. Claude Code auto-restarts tv-mcp on the next tool call.

---

## Troubleshooting

**`claude mcp list` shows tv-mcp at the wrong path** — Run `claude mcp remove tv-mcp` then `claude mcp add` with the correct `~/.tv-mcp/bin/tv-mcp` (or Windows equivalent).

**macOS: "App is damaged" on first launch** — Unsigned build. Run `xattr -cr "/Applications/TV Client.app"` then try again.

**Windows: PowerShell execution policy blocks the script** — Run once: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`.

**`gh release download` 404 / not authorized** — The tv-mcp repo is private. Run `gh auth login` and ensure your GitHub account has access to `FrontToBackCulture/tv-mcp`.

**tv-mcp connects but tools fail** — Check `~/.tv-mcp/settings.json` (macOS) or `%USERPROFILE%\.tv-mcp\settings.json` (Windows) has valid Supabase credentials. If missing, launch tv-client first — it writes this file on login.
