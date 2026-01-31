# Setup script for tv-mcp in Claude Desktop (Windows)
# Run this after installing tv-desktop
# Usage: Right-click and "Run with PowerShell" or run in terminal

Write-Host "=== tv-mcp Setup for Claude Desktop (Windows) ===" -ForegroundColor Cyan
Write-Host ""

# Determine tv-mcp binary location
$possiblePaths = @(
    "$env:LOCALAPPDATA\tv-desktop\tv-mcp.exe",
    "$env:ProgramFiles\tv-desktop\tv-mcp.exe",
    "${env:ProgramFiles(x86)}\tv-desktop\tv-mcp.exe",
    "$PSScriptRoot\..\src-tauri\target\release\tv-mcp.exe"
)

$tvMcpPath = $null
foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        $tvMcpPath = (Resolve-Path $path).Path
        break
    }
}

if (-not $tvMcpPath) {
    Write-Host "Could not find tv-mcp.exe automatically." -ForegroundColor Yellow
    $tvMcpPath = Read-Host "Please enter the full path to tv-mcp.exe"
    if (-not (Test-Path $tvMcpPath)) {
        Write-Host "Error: File not found at $tvMcpPath" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host "Found tv-mcp at: $tvMcpPath" -ForegroundColor Green

# Claude Desktop config location
$configDir = "$env:APPDATA\Claude"
$configFile = "$configDir\claude_desktop_config.json"

# Create config directory if it doesn't exist
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
    Write-Host "Created Claude config directory"
}

# Prepare the new config
$newMcpConfig = @{
    command = $tvMcpPath
}

if (Test-Path $configFile) {
    Write-Host "Found existing Claude Desktop config"

    # Read existing config
    $config = Get-Content $configFile -Raw | ConvertFrom-Json

    # Check if tv-mcp already exists
    if ($config.mcpServers.PSObject.Properties.Name -contains 'tv-mcp') {
        Write-Host "tv-mcp is already configured in Claude Desktop"
        Write-Host "Current config:"
        Get-Content $configFile
        Write-Host ""
        $response = Read-Host "Do you want to update the configuration? (y/n)"
        if ($response -ne 'y' -and $response -ne 'Y') {
            Write-Host "Setup cancelled."
            Read-Host "Press Enter to exit"
            exit 0
        }
    }

    # Backup existing config
    Copy-Item $configFile "$configFile.backup"
    Write-Host "Backed up existing config to $configFile.backup"

    # Add or update mcpServers
    if (-not $config.mcpServers) {
        $config | Add-Member -NotePropertyName mcpServers -NotePropertyValue @{} -Force
    }

    # Convert to hashtable for easier manipulation
    $mcpServers = @{}
    if ($config.mcpServers) {
        $config.mcpServers.PSObject.Properties | ForEach-Object {
            $mcpServers[$_.Name] = $_.Value
        }
    }
    $mcpServers['tv-mcp'] = $newMcpConfig

    # Create new config object
    $newConfig = @{
        mcpServers = $mcpServers
    }

    # Preserve other top-level properties
    $config.PSObject.Properties | ForEach-Object {
        if ($_.Name -ne 'mcpServers') {
            $newConfig[$_.Name] = $_.Value
        }
    }

    # Write updated config
    $newConfig | ConvertTo-Json -Depth 10 | Set-Content $configFile -Encoding UTF8

} else {
    # Create new config
    $config = @{
        mcpServers = @{
            'tv-mcp' = $newMcpConfig
        }
    }
    $config | ConvertTo-Json -Depth 10 | Set-Content $configFile -Encoding UTF8
    Write-Host "Created new Claude Desktop config"
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Configuration saved to: $configFile"
Write-Host ""
Get-Content $configFile
Write-Host ""
Write-Host "Please restart Claude Desktop for changes to take effect." -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter to exit"
