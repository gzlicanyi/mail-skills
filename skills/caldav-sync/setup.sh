#!/bin/bash

# CalDAV Sync Skill Setup Helper

CONFIG_DIR="$HOME/.config/caldav-sync"
CONFIG_FILE="$CONFIG_DIR/.env"

echo "================================"
echo "  CalDAV Sync Skill Setup"
echo "================================"
echo ""

# Install Node.js dependencies
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ ! -d "$SKILL_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  (cd "$SKILL_DIR" && npm install --production)
  echo ""
fi

# Determine setup mode
SETUP_MODE="default"
ACCOUNT_PREFIX=""
ACCOUNT_NAME=""

if [ -f "$CONFIG_FILE" ]; then
  echo "Existing configuration found at $CONFIG_FILE"
  echo ""
  echo "What would you like to do?"
  echo "  1) Reconfigure default account"
  echo "  2) Add a new account"
  echo ""
  read -p "Enter choice (1-2): " SETUP_CHOICE

  case $SETUP_CHOICE in
    1)
      SETUP_MODE="reconfigure"
      ;;
    2)
      SETUP_MODE="add"
      while true; do
        read -p "Account name (letters/digits only, e.g. work): " ACCOUNT_NAME
        if [[ "$ACCOUNT_NAME" =~ ^[a-zA-Z0-9]+$ ]]; then
          ACCOUNT_PREFIX="$(echo "$ACCOUNT_NAME" | tr '[:lower:]' '[:upper:]')_"
          if grep -q "^${ACCOUNT_PREFIX}CALDAV_SERVER_URL=" "$CONFIG_FILE" 2>/dev/null; then
            read -p "Account \"$ACCOUNT_NAME\" already exists. Overwrite? (y/n): " OVERWRITE
            if [ "$OVERWRITE" != "y" ]; then
              echo "Aborted."
              exit 0
            fi
            SETUP_MODE="overwrite"
          fi
          break
        else
          echo "Invalid name. Use only letters and digits."
        fi
      done
      ;;
    *)
      echo "Invalid choice"
      exit 1
      ;;
  esac
fi

echo ""
echo "This script will help you configure CalDAV credentials."
echo ""

# Prompt for provider
echo "Select your CalDAV provider:"
echo "  1) Google Calendar"
echo "  2) iCloud"
echo "  3) Nextcloud"
echo "  4) Fastmail"
echo "  5) NetEase Personal (163.com/126.com/yeah.net)"
echo "  6) NetEase Enterprise (North)"
echo "  7) NetEase Enterprise (East)"
echo "  8) Custom"
echo ""
read -p "Enter choice (1-8): " PROVIDER_CHOICE

case $PROVIDER_CHOICE in
  1)
    CALDAV_SERVER_URL="https://calendar.google.com/calendar/dav/"
    echo ""
    echo "!! Google requires an App Password."
    echo "   1. Go to: https://myaccount.google.com/apppasswords"
    echo "   2. Generate an App Password (requires 2-Step Verification enabled)"
    echo "   3. Use the generated 16-character password below"
    echo ""
    ;;
  2)
    CALDAV_SERVER_URL="https://caldav.icloud.com/"
    echo ""
    echo "!! iCloud requires an App-Specific Password."
    echo "   Go to: https://appleid.apple.com > Sign-In and Security > App-Specific Passwords"
    echo ""
    ;;
  3)
    read -p "Nextcloud host (e.g. https://cloud.example.com): " NC_HOST
    read -p "Username: " NC_USER
    CALDAV_SERVER_URL="${NC_HOST}/remote.php/dav/calendars/${NC_USER}/"
    ;;
  4)
    CALDAV_SERVER_URL="https://caldav.fastmail.com/dav/"
    ;;
  5)
    CALDAV_SERVER_URL="https://caldav.163.com/"
    echo ""
    echo "!! NetEase requires an authorization code (授权码), not your account password."
    echo "   Enable CalDAV in web settings: Settings > Account > CalDAV"
    echo ""
    ;;
  6)
    CALDAV_SERVER_URL="https://caldav.qiye.163.com/"
    ;;
  7)
    CALDAV_SERVER_URL="https://caldavhz.qiye.163.com/"
    ;;
  8)
    read -p "CalDAV Server URL: " CALDAV_SERVER_URL
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

echo ""
read -p "Username (usually your email): " USERNAME
read -s -p "Password / App Password / Authorization Code: " PASSWORD
echo ""
read -p "Default calendar name (leave empty for first calendar): " DEFAULT_CALENDAR

# Create config directory
mkdir -p -m 700 "$CONFIG_DIR"

# Build account variables block
ACCOUNT_VARS="# ${ACCOUNT_NAME:-Default} account
${ACCOUNT_PREFIX}CALDAV_SERVER_URL=$CALDAV_SERVER_URL
${ACCOUNT_PREFIX}CALDAV_USERNAME=$USERNAME
${ACCOUNT_PREFIX}CALDAV_PASSWORD=$PASSWORD
${ACCOUNT_PREFIX}CALDAV_DEFAULT_CALENDAR=$DEFAULT_CALENDAR"

case $SETUP_MODE in
  "default")
    cat > "$CONFIG_FILE" << EOF
$ACCOUNT_VARS
EOF
    ;;
  "reconfigure")
    TEMP_FILE=$(mktemp)
    grep -E '^[A-Z0-9]+_CALDAV_' "$CONFIG_FILE" > "$TEMP_FILE.named" 2>/dev/null || true

    cat > "$TEMP_FILE" << EOF
$ACCOUNT_VARS
EOF

    if [ -s "$TEMP_FILE.named" ]; then
      echo "" >> "$TEMP_FILE"
      echo "# Named accounts" >> "$TEMP_FILE"
      cat "$TEMP_FILE.named" >> "$TEMP_FILE"
    fi
    mv "$TEMP_FILE" "$CONFIG_FILE"
    rm -f "$TEMP_FILE.named"
    ;;
  "add")
    echo "" >> "$CONFIG_FILE"
    echo "$ACCOUNT_VARS" >> "$CONFIG_FILE"
    ;;
  "overwrite")
    TEMP_FILE=$(mktemp)
    grep -v "^${ACCOUNT_PREFIX}CALDAV_" "$CONFIG_FILE" | grep -vi "^# ${ACCOUNT_NAME} account" > "$TEMP_FILE" 2>/dev/null || true
    content=$(cat "$TEMP_FILE") && printf '%s\n' "$content" > "$TEMP_FILE"
    echo "" >> "$TEMP_FILE"
    echo "$ACCOUNT_VARS" >> "$TEMP_FILE"
    mv "$TEMP_FILE" "$CONFIG_FILE"
    ;;
esac

echo ""
echo "Configuration saved to $CONFIG_FILE"
chmod 600 "$CONFIG_FILE"
echo "Set file permissions to 600 (owner read/write only)"
echo ""

echo "Testing connection..."
ACCOUNT_FLAG=""
if [ -n "$ACCOUNT_NAME" ]; then
  ACCOUNT_FLAG="--account $ACCOUNT_NAME"
fi

echo "Fetching calendars..."
if node "$SKILL_DIR/scripts/caldav.js" $ACCOUNT_FLAG list-calendars >/dev/null 2>&1; then
    echo "CalDAV connection successful!"
else
    echo "CalDAV connection test failed"
    echo "   Please check your credentials and settings"
fi

echo ""
echo "Setup complete! Try:"
if [ -n "$ACCOUNT_NAME" ]; then
  echo "  node scripts/caldav.js --account $ACCOUNT_NAME list-calendars"
  echo "  node scripts/caldav.js --account $ACCOUNT_NAME list-events --start 2026-01-01 --end 2026-12-31"
else
  echo "  node scripts/caldav.js list-calendars"
  echo "  node scripts/caldav.js list-events --start 2026-01-01 --end 2026-12-31"
fi
