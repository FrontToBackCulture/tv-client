# Installs the standalone tv-mcp binary to $HOME\.tv-mcp\bin\tv-mcp.exe.
# tv-mcp is a public repo, so no authentication is required.
#
# Usage (PowerShell):
#   .\install-tv-mcp.ps1
#
# If blocked by execution policy, run once:
#   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

$ErrorActionPreference = "Stop"

$Repo = "FrontToBackCulture/tv-mcp"
$Asset = "tv-mcp-x86_64-pc-windows-msvc.exe"
$DestDir = Join-Path $HOME ".tv-mcp\bin"
$Dest = Join-Path $DestDir "tv-mcp.exe"

Write-Host "=== tv-mcp installer (Windows) ===" -ForegroundColor Cyan

# Stop running tv-mcp processes
$running = Get-Process -Name "tv-mcp" -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "Stopping running tv-mcp processes..."
    $running | Stop-Process -Force
    Start-Sleep -Seconds 1
}

# Ensure dest dir
New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

$Url = "https://github.com/$Repo/releases/latest/download/$Asset"
Write-Host "Downloading $Url..."
Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing

# Print version
$version = & $Dest --version 2>$null
if (-not $version) { $version = "unknown" }

Write-Host ""
Write-Host "Installed: $Dest" -ForegroundColor Green
Write-Host "   Version:   $version"
Write-Host ""

# Register with Claude Desktop (if installed)
$DesktopConfig = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
$DesktopInstalled = (Test-Path $DesktopConfig) -or `
                    (Test-Path (Join-Path $env:LOCALAPPDATA "AnthropicClaude")) -or `
                    (Test-Path (Join-Path $env:LOCALAPPDATA "Programs\claude-desktop"))

if ($DesktopInstalled) {
    Write-Host "Registering tv-mcp with Claude Desktop..."
    $configDir = Split-Path $DesktopConfig
    New-Item -ItemType Directory -Force -Path $configDir | Out-Null

    if (Test-Path $DesktopConfig) {
        $cfg = Get-Content $DesktopConfig -Raw | ConvertFrom-Json
    } else {
        $cfg = New-Object PSObject
    }

    if (-not $cfg.PSObject.Properties['mcpServers']) {
        $cfg | Add-Member -NotePropertyName mcpServers -NotePropertyValue (New-Object PSObject)
    }

    $entry = [PSCustomObject]@{ command = $Dest }
    if ($cfg.mcpServers.PSObject.Properties['tv-mcp']) {
        $cfg.mcpServers.'tv-mcp' = $entry
    } else {
        $cfg.mcpServers | Add-Member -NotePropertyName 'tv-mcp' -NotePropertyValue $entry
    }

    $cfg | ConvertTo-Json -Depth 10 | Set-Content $DesktopConfig -Encoding UTF8
    Write-Host "   Updated: $DesktopConfig"
    Write-Host "   WARNING: Restart Claude Desktop for changes to take effect." -ForegroundColor Yellow
} else {
    Write-Host "Claude Desktop not detected - skipping Desktop registration."
}
Write-Host ""

# Register with Claude Code CLI (if installed)
if (Get-Command claude -ErrorAction SilentlyContinue) {
    $current = (claude mcp list 2>$null | Select-String -Pattern '^tv-mcp:' | Select-Object -First 1).Line
    if ($current -and $current.Contains($Dest)) {
        Write-Host "Claude Code CLI already points at $Dest - no changes needed."
    } else {
        if ($current) {
            claude mcp remove tv-mcp 2>$null | Out-Null
        }
        claude mcp add tv-mcp $Dest
        Write-Host "Registered tv-mcp with Claude Code CLI."
    }
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
