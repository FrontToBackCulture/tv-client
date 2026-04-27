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

  # Vite build needs >2GB heap to process the bundle without crashing.
  # Matches the NODE_OPTIONS value used in the (now-removed) CI workflow.
  $env:NODE_OPTIONS = "--max-old-space-size=6144"

  # Always cross-compile to x86_64 so the installer arch matches AMD64 user
  # machines, regardless of host arch. This is important on Parallels Windows
  # running on Apple Silicon, which is ARM64 by default.
  Write-Host "Ensuring x86_64-pc-windows-msvc target is installed..."
  rustup target add x86_64-pc-windows-msvc | Out-Null

  # Clean any stale installers from a previous version's build so the search
  # below cannot pick up an old artifact (this is what caused 0.10.34 to ship
  # a 0.10.33-named installer the first time).
  $bundleDir = "src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis"
  if (Test-Path $bundleDir) {
    Get-ChildItem "$bundleDir\*-setup.exe" -ErrorAction SilentlyContinue | Remove-Item -Force
  }

  Write-Host "Building Windows installer (this takes ~10 min on first build)..."
  npm run tauri:build -- --target x86_64-pc-windows-msvc

  # Find the NSIS installer for THIS version specifically — guards against any
  # leftover wrong-version files in the bundle dir.
  $installer = Get-ChildItem "$bundleDir\*_${VersionNum}_x64-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $installer) {
    $present = (Get-ChildItem $bundleDir -ErrorAction SilentlyContinue | ForEach-Object { '  ' + $_.Name }) -join "`n"
    Write-Error "No NSIS installer for version $VersionNum found in $bundleDir.`nFiles present:`n$present"
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
