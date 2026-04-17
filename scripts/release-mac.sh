#!/bin/bash
# tv-client Mac release (signed + notarized)
# Usage: ./scripts/release-mac.sh v0.10.31 "Release notes here"
#
# Creates the GitHub release with the Mac .dmg installer attached.
# Run release-win.ps1 inside Parallels afterwards to add the Windows installer.
#
# Required env vars for signing + notarization:
#   APPLE_SIGNING_IDENTITY        e.g. "Developer ID Application: Melvin Wang (32SQ2PSMW4)"
#   APPLE_ID                      your Apple ID email
#   APPLE_PASSWORD                app-specific password (appleid.apple.com → Sign-In and Security)
#   APPLE_TEAM_ID                 e.g. 32SQ2PSMW4
# Optional (for Tauri auto-updater signatures):
#   TAURI_SIGNING_PRIVATE_KEY
#   TAURI_SIGNING_PRIVATE_KEY_PASSWORD
#
# Set these in ~/.zshrc or load from a local .env.release file.

set -e

VERSION="${1:?Usage: $0 vX.Y.Z \"release notes\"}"
NOTES="${2:-}"
VERSION_NUM="${VERSION#v}"

cd "$(dirname "$0")/.."

# Load .env.release if present (gitignored, stores signing creds)
if [ -f ".env.release" ]; then
  set -a
  # shellcheck disable=SC1091
  . .env.release
  set +a
fi

# Verify versions match across all 3 files
PKG_VERSION=$(node -p "require('./package.json').version")
CARGO_VERSION=$(grep '^version = ' src-tauri/Cargo.toml | head -1 | cut -d'"' -f2)
TAURI_VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")

if [ "$VERSION_NUM" != "$PKG_VERSION" ] || [ "$VERSION_NUM" != "$CARGO_VERSION" ] || [ "$VERSION_NUM" != "$TAURI_VERSION" ]; then
  echo "ERROR: Version mismatch."
  echo "  Arg:             $VERSION_NUM"
  echo "  package.json:    $PKG_VERSION"
  echo "  Cargo.toml:      $CARGO_VERSION"
  echo "  tauri.conf.json: $TAURI_VERSION"
  echo "Bump all three to $VERSION_NUM, commit, push, then rerun."
  exit 1
fi

# Ensure clean working tree
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: Working tree dirty. Commit or stash first."
  exit 1
fi

# Verify signing env vars
if [ -z "$APPLE_SIGNING_IDENTITY" ]; then
  echo "ERROR: APPLE_SIGNING_IDENTITY not set."
  echo "Set it in ~/.zshrc or .env.release:"
  echo "  export APPLE_SIGNING_IDENTITY=\"Developer ID Application: Melvin Wang (32SQ2PSMW4)\""
  exit 1
fi

# Tag if not already tagged
if ! git rev-parse "$VERSION" >/dev/null 2>&1; then
  echo "Tagging $VERSION..."
  git tag "$VERSION"
  git push origin "$VERSION"
fi

# Build
echo "Installing npm deps..."
npm install

echo "Building + signing Mac installer (this takes ~5 min)..."
npm run tauri:build

# Find the DMG
DMG=$(ls -1 "src-tauri/target/release/bundle/dmg/"*.dmg 2>/dev/null | head -1)
if [ -z "$DMG" ]; then
  echo "ERROR: No .dmg found in src-tauri/target/release/bundle/dmg/"
  exit 1
fi

echo "Found: $DMG"

# Notarize if Apple creds are present
if [ -n "$APPLE_ID" ] && [ -n "$APPLE_PASSWORD" ] && [ -n "$APPLE_TEAM_ID" ]; then
  echo "Notarizing DMG (this takes 1-5 min)..."
  xcrun notarytool submit "$DMG" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait

  echo "Stapling notarization ticket..."
  xcrun stapler staple "$DMG"
else
  echo "⚠️  Skipping notarization (APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID not set)."
  echo "    Users will see Gatekeeper warnings. Set these to enable notarization."
fi

# Create release with Mac installer
echo "Creating GitHub release $VERSION..."
gh release create "$VERSION" "$DMG" \
  --title "TV Client ${VERSION_NUM}" \
  --notes "$NOTES"

echo ""
echo "✅ Mac release done (signed${APPLE_ID:+ + notarized})."
echo "Next: in Parallels VM, cd into tv-client, git pull, then:"
echo "    .\\scripts\\release-win.ps1 $VERSION"
