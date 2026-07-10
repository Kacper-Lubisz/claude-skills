#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$SKILL_DIR/env"
SETTINGS_FILE="$HOME/.claude/settings.local.json"

# Get connection URL from argument or prompt
if [[ $# -ge 1 ]]; then
    URI="$1"
else
    read -rp "Redis connection URL: " URI
fi

if [[ -z "$URI" ]]; then
    echo "Error: No connection URL provided." >&2
    exit 1
fi

# Write env file
cat > "$ENV_FILE" <<EOF
REDIS_URI="$URI"
EOF

echo "Wrote connection URL to $ENV_FILE"

# Test connection
echo "Testing connection..."
if redis-cli -u "$URI" PING | grep -q PONG; then
    echo "Connection successful."
else
    echo "Error: Connection failed. Check your URL and try again." >&2
    exit 1
fi

# Add query.sh to settings.local.json allow list
ALLOW_ENTRY="Bash(~/.claude/skills/redis/scripts/query.sh:*)"

if [[ -f "$SETTINGS_FILE" ]]; then
    # Check if already present
    if grep -qF "$ALLOW_ENTRY" "$SETTINGS_FILE" 2>/dev/null; then
        echo "query.sh already in allow list."
    else
        # Use jq to add to the allow array
        if command -v jq &>/dev/null; then
            tmp=$(mktemp)
            jq --arg entry "$ALLOW_ENTRY" '.permissions.allow += [$entry]' "$SETTINGS_FILE" > "$tmp" && mv "$tmp" "$SETTINGS_FILE"
            echo "Added query.sh to allow list in $SETTINGS_FILE"
        else
            echo "Warning: jq not found. Please manually add the following to $SETTINGS_FILE permissions.allow:" >&2
            echo "  \"$ALLOW_ENTRY\"" >&2
        fi
    fi
else
    # Create settings file
    mkdir -p "$(dirname "$SETTINGS_FILE")"
    cat > "$SETTINGS_FILE" <<SETTINGSEOF
{
  "permissions": {
    "allow": [
      "$ALLOW_ENTRY"
    ]
  }
}
SETTINGSEOF
    echo "Created $SETTINGS_FILE with query.sh in allow list."
fi

echo ""
echo "Setup complete. You can now use:"
echo "  query.sh  — for read operations (auto-approved)"
echo "  exec.sh   — for write operations (requires confirmation)"
