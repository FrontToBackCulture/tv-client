# tv-client Windows release
# Usage: .\scripts\release-win.ps1 v0.10.31
#
# Uploads Windows installer to an EXISTING GitHub release.
# Run release-mac.sh on Mac first to create the release.

param(
  [Parameter(Mandatory=$true)][string]$Version
)

$ErrorActionPreference = "Stop"
$VersionNum = $Version -replace '^v',''

Push-Location (Join-Path $PSScriptRoot "..")

try {
  # Verify versions match
  $pkgVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
  $tauriVersion = (Get-Content src-tauri\tauri.conf.json -Raw | ConvertFrom-Json).version
  $cargoVersion = ((Get-Content src-tauri\Cargo.toml | Select-String '^version = ').ToString() -replace '.*"([^"]+)".*','$1')

  if (($VersionNum -ne $pkgVersion) -or ($VersionNum -ne $cargoVersion) -or ($VersionNum -ne $tauriVersion)) {
    Write-Host "ERROR: Version mismatch." -ForegroundColor Red
    Write-Host "  Arg:             $VersionNum"
    Write-Host "  package.json:    $pkgVersion"
    Write-Host "  Cargo.toml:      $cargoVersion"
    Write-Host "  tauri.conf.json: $tauriVersion"
    Write-Host "Run 'git pull' to sync, or bump versions on Mac and push first."
    exit 1
  }

  # Confirm release exists
  try {
    gh release view $Version --json tagName | Out-Null
  } catch {
    Write-Error "Release $Version does not exist. Run release-mac.sh on Mac first."
    exit 1
  }

  # Build
  Write-Host "Installing npm deps..."
  npm install

  Write-Host "Building Windows installer (this takes ~10 min on first build)..."
  npm run tauri:build

  # Find the NSIS installer
  $installer = Get-ChildItem "src-tauri\target\release\bundle\nsis\*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $installer) {
    Write-Error "No NSIS installer found in src-tauri\target\release\bundle\nsis\"
    exit 1
  }

  Write-Host "Found: $($installer.FullName)"

  # Upload
  Write-Host "Uploading installer to release $Version..."
  gh release upload $Version $installer.FullName --clobber

  Write-Host ""
  Write-Host "✅ Windows release done. Both Mac + Windows installers are on the release page." -ForegroundColor Green
} finally {
  Pop-Location
}
