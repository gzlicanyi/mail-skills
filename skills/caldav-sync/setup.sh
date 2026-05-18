#!/bin/bash

# CalDAV Sync Skill Setup Helper
# Writes to shared config: ~/.config/mail-skills/.env

CONFIG_DIR="$HOME/.config/mail-skills"
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
          if grep -q "^${ACCOUNT_PREFIX}PROVIDER=" "$CONFIG_FILE" 2>/dev/null; then
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
echo "Select your provider:"
echo "  1) 163.com"
echo "  2) vip.163.com"
echo "  3) 126.com"
echo "  4) vip.126.com"
echo "  5) 188.com"
echo "  6) vip.188.com"
echo "  7) yeah.net"
echo "  8) Gmail"
echo "  9) Outlook (IMAP/SMTP only, no CalDAV)"
echo " 10) iCloud"
echo " 11) Fastmail"
echo " 12) QQ Mail (IMAP/SMTP only, no CalDAV)"
echo " 13) exmail.qq.com (IMAP/SMTP only, no CalDAV)"
echo " 14) NetEase Enterprise (North)"
echo " 15) NetEase Enterprise (East)"
echo " 16) Custom"
echo ""
read -p "Enter choice (1-16): " PROVIDER_CHOICE

case $PROVIDER_CHOICE in
  1)  PROVIDER="163" ;;
  2)  PROVIDER="vip.163" ;;
  3)  PROVIDER="126" ;;
  4)  PROVIDER="vip.126" ;;
  5)  PROVIDER="188" ;;
  6)  PROVIDER="vip.188" ;;
  7)  PROVIDER="yeah" ;;
  8)
    PROVIDER="gmail"
    echo ""
    echo "!! Google requires an App Password."
    echo "   1. Go to: https://myaccount.google.com/apppasswords"
    echo "   2. Generate an App Password (requires 2-Step Verification enabled)"
    echo "   3. Use the generated 16-character password below"
    echo ""
    ;;
  9)
    echo "Error: Outlook does not support CalDAV. Use imap-smtp-email skill instead."
    exit 1
    ;;
  10)
    PROVIDER="icloud"
    echo ""
    echo "!! iCloud requires an App-Specific Password."
    echo "   Go to: https://appleid.apple.com > Sign-In and Security > App-Specific Passwords"
    echo ""
    ;;
  11) PROVIDER="fastmail" ;;
  12)
    echo "Error: QQ Mail does not support CalDAV. Use imap-smtp-email skill instead."
    exit 1
    ;;
  13)
    echo "Error: exmail.qq.com does not support CalDAV. Use imap-smtp-email skill instead."
    exit 1
    ;;
  14) PROVIDER="netease-enterprise-north" ;;
  15) PROVIDER="netease-enterprise-east" ;;
  16) PROVIDER="custom" ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

# Custom provider: ask for server URL
CALDAV_SERVER_URL=""
if [ "$PROVIDER" = "custom" ]; then
  read -p "CalDAV Server URL: " CALDAV_SERVER_URL
fi

echo ""
read -p "Username (usually your email): " USERNAME
read -s -p "Password / App Password / Authorization Code: " PASSWORD
echo ""
read -p "Default calendar name (leave empty for first calendar): " DEFAULT_CALENDAR

# For NetEase providers, show hint about authorization code
case $PROVIDER in
  163|vip.163|126|vip.126|188|vip.188|yeah)
    echo ""
    echo "Note: NetEase requires an authorization code (授权码), not your account password."
    echo "  Enable CalDAV in web settings: Settings > Account > CalDAV"
    ;;
esac

# Create config directory
mkdir -p -m 700 "$CONFIG_DIR"

# Build account variables block
ACCOUNT_VARS="# ${ACCOUNT_NAME:-Default} account
${ACCOUNT_PREFIX}PROVIDER=$PROVIDER
${ACCOUNT_PREFIX}USERNAME=$USERNAME
${ACCOUNT_PREFIX}PASSWORD=$PASSWORD"

if [ -n "$DEFAULT_CALENDAR" ]; then
  ACCOUNT_VARS="$ACCOUNT_VARS
${ACCOUNT_PREFIX}CALDAV_DEFAULT_CALENDAR=$DEFAULT_CALENDAR"
fi

if [ "$PROVIDER" = "custom" ] && [ -n "$CALDAV_SERVER_URL" ]; then
  ACCOUNT_VARS="$ACCOUNT_VARS
${ACCOUNT_PREFIX}CALDAV_SERVER_URL=$CALDAV_SERVER_URL"
fi

case $SETUP_MODE in
  "default")
    cat > "$CONFIG_FILE" << EOF
$ACCOUNT_VARS
EOF
    ;;
  "reconfigure")
    TEMP_FILE=$(mktemp)
    grep -E '^[A-Z0-9]+_(PROVIDER|USERNAME|PASSWORD|CALDAV_)' "$CONFIG_FILE" > "$TEMP_FILE.named" 2>/dev/null || true

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
    grep -v "^${ACCOUNT_PREFIX}" "$CONFIG_FILE" | grep -vi "^# ${ACCOUNT_NAME} account" > "$TEMP_FILE" 2>/dev/null || true
    content=$(cat "$TEMP_FILE") && printf '%s\n' "$content" > "$TEMP_FILE"
    echo "" >> "$TEMP_FILE"
    echo "$ACCOUNT_VARS" >> "$TEMP_FILE"
    mv "$TEMP_FILE" "$CONFIG_FILE"
    ;;
esac

echo ""
echo "Configuration saved to $CONFIG_FILE"
chmod 600 "$CONFIG_FILE"
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
