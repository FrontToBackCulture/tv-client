# Installs the standalone tv-mcp binary to $HOME\.tv-mcp\bin\tv-mcp.exe.
# Requires the GitHub CLI (`gh`) authenticated against FrontToBackCulture
# because the tv-mcp repo is private.
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

# Check for gh CLI
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: GitHub CLI (gh) is not installed." -ForegroundColor Red
    Write-Host "Install it from https://cli.github.com/ then run: gh auth login"
    exit 1
}

# Check gh auth
$ghStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: gh is not authenticated. Run: gh auth login" -ForegroundColor Red
    exit 1
}

# Stop running tv-mcp processes
$running = Get-Process -Name "tv-mcp" -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "Stopping running tv-mcp processes..."
    $running | Stop-Process -Force
    Start-Sleep -Seconds 1
}

# Ensure dest dir
New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

Write-Host "Downloading latest $Asset from $Repo..."
$TmpDir = New-Item -ItemType Directory -Path (Join-Path $env:TEMP "tv-mcp-install-$(Get-Random)")
try {
    gh release download --repo $Repo --pattern $Asset --dir $TmpDir.FullName
    if ($LASTEXITCODE -ne 0) {
        throw "gh release download failed (exit $LASTEXITCODE)"
    }

    $downloaded = Join-Path $TmpDir.FullName $Asset
    Move-Item -Force $downloaded $Dest
} finally {
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
}

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
