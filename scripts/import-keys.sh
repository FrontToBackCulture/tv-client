#!/bin/bash
# Import API keys from SkyNet .env into macOS Keychain
# Run once to set up tv-desktop with your existing keys

SERVICE="tv-desktop"
SKYNET_ENV="/Users/melvinwang/Code/SkyNet/.skynet.env"

echo "Importing API keys into macOS Keychain..."
echo ""

# Function to add key to keychain
add_key() {
    local key_name="$1"
    local value="$2"

    if [ -z "$value" ]; then
        echo "  ⏭️  $key_name - skipped (empty)"
        return
    fi

    # Delete existing key first (to allow update)
    security delete-generic-password -s "$SERVICE" -a "$key_name" >/dev/null 2>&1

    # Add to keychain
    security add-generic-password -s "$SERVICE" -a "$key_name" -w "$value"
    echo "  ✅ $key_name - imported"
}

# Source the main env file
if [ -f "$SKYNET_ENV" ]; then
    echo "Loading from $SKYNET_ENV"
    echo ""
    source "$SKYNET_ENV"
else
    echo "Error: $SKYNET_ENV not found"
    exit 1
fi

# Import keys
add_key "gamma_api_key" "$GAMMA_API_KEY"
add_key "gemini_api_key" "$GEMINI_API_KEY"
add_key "github_client_id" "$GITHUB_CLIENT_ID"
add_key "github_client_secret" "$GITHUB_CLIENT_SECRET"
add_key "supabase_url" "$NEXT_PUBLIC_SUPABASE_URL"
add_key "supabase_anon_key" "$NEXT_PUBLIC_SUPABASE_ANON_KEY"

echo ""
echo "Done! Keys are now stored in macOS Keychain."
echo ""
echo "Verify with:"
echo "  security find-generic-password -s tv-desktop -a gamma_api_key -w"
