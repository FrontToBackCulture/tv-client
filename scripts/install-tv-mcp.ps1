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

# Register with Claude Code if available
if (Get-Command claude -ErrorAction SilentlyContinue) {
    $current = (claude mcp list 2>$null | Select-String -Pattern '^tv-mcp:' | Select-Object -First 1).Line
    if ($current -and $current.Contains($Dest)) {
        Write-Host "Claude Code already points at $Dest - no changes needed."
    } else {
        if ($current) {
            Write-Host "Claude Code currently has: $current"
            Write-Host "Updating to point at $Dest..."
            claude mcp remove tv-mcp 2>$null | Out-Null
        } else {
            Write-Host "Registering tv-mcp with Claude Code..."
        }
        claude mcp add tv-mcp $Dest
        Write-Host ""
        claude mcp list | Select-String -Pattern '^tv-mcp:'
    }
} else {
    Write-Host "Claude Code (claude) not found on PATH - skipping registration."
    Write-Host "To register manually later: claude mcp add tv-mcp `"$Dest`""
}

Write-Host ""
Write-Host "Done. Run ``claude mcp list`` any time to verify." -ForegroundColor Green
