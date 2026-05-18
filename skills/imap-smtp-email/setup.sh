#!/bin/bash

# IMAP/SMTP Email Skill Setup Helper
# Writes to shared config: ~/.config/mail-skills/.env

LEGACY_CONFIG_DIR="$HOME/.config/imap-smtp-email"
LEGACY_CONFIG_FILE="$LEGACY_CONFIG_DIR/.env"
SHARED_CONFIG_DIR="$HOME/.config/mail-skills"
SHARED_CONFIG_FILE="$SHARED_CONFIG_DIR/.env"

echo "================================"
echo "  IMAP/SMTP Email Skill Setup"
echo "================================"
echo ""

# Install Node.js dependencies
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ ! -d "$SKILL_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  (cd "$SKILL_DIR" && npm install --production)
  echo ""
fi

# Migration: offer to migrate from legacy config
MIGRATE=false
if [ -f "$LEGACY_CONFIG_FILE" ]; then
  echo "Existing configuration found at $LEGACY_CONFIG_FILE"
  echo ""
  echo "Migrate to shared config? This allows sharing account configuration"
  echo "with caldav-sync skill, so you don't need to configure the same account twice."
  echo ""
  echo "  1) Keep current config (no change)"
  echo "  2) Migrate to shared config"
  echo ""
  read -p "Enter choice (1-2): " MIGRATE_CHOICE
  echo ""

  case $MIGRATE_CHOICE in
    2)
      MIGRATE=true
      ;;
    *)
      echo "Keeping current config. You can run setup.sh again later to migrate."
      echo ""
      ;;
  esac
fi

# --- Migration logic ---
if [ "$MIGRATE" = true ]; then
  # Source the legacy .env to get variables
  set -a
  source "$LEGACY_CONFIG_FILE" 2>/dev/null
  set +a

  # Detect provider from IMAP_HOST
  PROVIDER=$(node -e "
    const { detectProvider } = require('$SKILL_DIR/scripts/providers');
    const provider = detectProvider(process.env.IMAP_HOST || '');
    console.log(provider || 'custom');
  ")

  mkdir -p -m 700 "$SHARED_CONFIG_DIR"

  if [ "$PROVIDER" = "custom" ]; then
    cat > "$SHARED_CONFIG_FILE" << EOF
PROVIDER=custom
USERNAME=${IMAP_USER:-}
PASSWORD=${IMAP_PASS:-}
IMAP_HOST=${IMAP_HOST:-}
IMAP_PORT=${IMAP_PORT:-993}
IMAP_TLS=${IMAP_TLS:-true}
SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_SECURE=${SMTP_SECURE:-false}
IMAP_REJECT_UNAUTHORIZED=${IMAP_REJECT_UNAUTHORIZED:-true}
SMTP_REJECT_UNAUTHORIZED=${SMTP_REJECT_UNAUTHORIZED:-true}
ALLOWED_READ_DIRS=${ALLOWED_READ_DIRS:-$HOME/Downloads,$HOME/Documents}
ALLOWED_WRITE_DIRS=${ALLOWED_WRITE_DIRS:-$HOME/Downloads}
EOF
  else
    cat > "$SHARED_CONFIG_FILE" << EOF
PROVIDER=$PROVIDER
USERNAME=${IMAP_USER:-}
PASSWORD=${IMAP_PASS:-}
ALLOWED_READ_DIRS=${ALLOWED_READ_DIRS:-$HOME/Downloads,$HOME/Documents}
ALLOWED_WRITE_DIRS=${ALLOWED_WRITE_DIRS:-$HOME/Downloads}
EOF
  fi

  chmod 600 "$SHARED_CONFIG_FILE"

  # Migrate named accounts from legacy config
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue

    if [[ "$key" =~ ^([A-Z0-9]+)_IMAP_HOST$ ]]; then
      NP="${BASH_REMATCH[1]}"
      NPROVIDER=$(node -e "
        const { detectProvider } = require('$SKILL_DIR/scripts/providers');
        const provider = detectProvider('$value');
        console.log(provider || 'custom');
      ")
      NPUSER=$(eval echo "\$${NP}_IMAP_USER")
      NPPASS=$(eval echo "\$${NP}_IMAP_PASS")

      if [ "$NPROVIDER" = "custom" ]; then
        NPHOST="$value"
        NPPORT=$(eval echo "\$${NP}_IMAP_PORT")
        NPTLS=$(eval echo "\$${NP}_IMAP_TLS")
        NPSMTP=$(eval echo "\$${NP}_SMTP_HOST")
        NPSMTPPORT=$(eval echo "\$${NP}_SMTP_PORT")
        NPSMTPSEC=$(eval echo "\$${NP}_SMTP_SECURE")
        echo "" >> "$SHARED_CONFIG_FILE"
        echo "# ${NP,,} account" >> "$SHARED_CONFIG_FILE"
        echo "${NP}_PROVIDER=custom" >> "$SHARED_CONFIG_FILE"
        echo "${NP}_USERNAME=${NPUSER}" >> "$SHARED_CONFIG_FILE"
        echo "${NP}_PASSWORD=${NPPASS}" >> "$SHARED_CONFIG_FILE"
        echo "${NP}_IMAP_HOST=${NPHOST}" >> "$SHARED_CONFIG_FILE"
        echo "${NP}_IMAP_PORT=${NPPORT:-993}" >> "$SHARED_CONFIG_FILE"
        echo "${NP}_IMAP_TLS=${NPTLS:-true}" >> "$SHARED_CONFIG_FILE"
        echo "${NP}_SMTP_HOST=${NPSMTP}" >> "$SHARED_CONFIG_FILE"
        echo "${NP}_SMTP_PORT=${NPSMTPPORT:-587}" >> "$SHARED_CONFIG_FILE"
        echo "${NP}_SMTP_SECURE=${NPSMTPSEC:-false}" >> "$SHARED_CONFIG_FILE"
      else
        echo "" >> "$SHARED_CONFIG_FILE"
        echo "# ${NP,,} account" >> "$SHARED_CONFIG_FILE"
        echo "${NP}_PROVIDER=$NPROVIDER" >> "$SHARED_CONFIG_FILE"
        echo "${NP}_USERNAME=${NPUSER}" >> "$SHARED_CONFIG_FILE"
        echo "${NP}_PASSWORD=${NPPASS}" >> "$SHARED_CONFIG_FILE"
      fi
    fi
  done < "$LEGACY_CONFIG_FILE"

  # Backup legacy config
  cp "$LEGACY_CONFIG_FILE" "${LEGACY_CONFIG_FILE}.bak"
  echo "Legacy config backed up to ${LEGACY_CONFIG_FILE}.bak"
  echo ""

  # Test connection
  echo "Testing connections..."
  echo ""

  echo "Testing IMAP..."
  if node "$SKILL_DIR/scripts/imap.js" list-mailboxes >/dev/null 2>&1; then
      echo "IMAP connection successful!"
  else
      echo "IMAP connection test failed"
  fi

  echo ""
  echo "Testing SMTP..."
  if node "$SKILL_DIR/scripts/smtp.js" test >/dev/null 2>&1; then
      echo "SMTP connection successful!"
  else
      echo "SMTP connection test failed"
  fi

  echo ""
  echo "Migration complete! Config saved to $SHARED_CONFIG_FILE"
  echo "Note: Legacy config at $LEGACY_CONFIG_FILE is backed up and still works."
  exit 0
fi

# --- Normal setup flow ---
CONFIG_FILE="$SHARED_CONFIG_FILE"

SETUP_MODE="default"
ACCOUNT_PREFIX=""
ACCOUNT_NAME=""

if [ -f "$CONFIG_FILE" ]; then
  echo "Existing shared configuration found at $CONFIG_FILE"
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
echo "This script will help you configure email credentials."
echo ""

# Prompt for provider
echo "Select your email provider:"
echo "  1) 163.com"
echo "  2) vip.163.com"
echo "  3) 126.com"
echo "  4) vip.126.com"
echo "  5) 188.com"
echo "  6) vip.188.com"
echo "  7) yeah.net"
echo "  8) Gmail"
echo "  9) Outlook"
echo " 10) QQ Mail"
echo " 11) exmail.qq.com"
echo " 12) iCloud"
echo " 13) Fastmail"
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
    echo "!! Gmail requires an App Password."
    echo "   1. Go to: https://myaccount.google.com/apppasswords"
    echo "   2. Generate an App Password (requires 2-Step Verification enabled)"
    echo "   3. Use the generated 16-character password below"
    echo ""
    ;;
  9)  PROVIDER="outlook" ;;
  10) PROVIDER="qq" ;;
  11) PROVIDER="exmail.qq" ;;
  12) PROVIDER="icloud" ;;
  13) PROVIDER="fastmail" ;;
  14) PROVIDER="netease-enterprise-north" ;;
  15) PROVIDER="netease-enterprise-east" ;;
  16) PROVIDER="custom" ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

# Custom provider: ask for server details
IMAP_HOST=""
IMAP_PORT=""
SMTP_HOST=""
SMTP_PORT=""
IMAP_TLS=""
SMTP_SECURE=""

if [ "$PROVIDER" = "custom" ]; then
  read -p "IMAP Host: " IMAP_HOST
  read -p "IMAP Port [993]: " IMAP_PORT
  IMAP_PORT=${IMAP_PORT:-993}
  read -p "SMTP Host: " SMTP_HOST
  read -p "SMTP Port [587]: " SMTP_PORT
  SMTP_PORT=${SMTP_PORT:-587}
  read -p "Use TLS for IMAP? (true/false) [true]: " IMAP_TLS
  IMAP_TLS=${IMAP_TLS:-true}
  read -p "Use SSL for SMTP? (true/false) [false]: " SMTP_SECURE
  SMTP_SECURE=${SMTP_SECURE:-false}
fi

echo ""
read -p "Email address: " EMAIL
read -s -p "Password / App Password / Authorization Code: " PASSWORD
echo ""

# NetEase hint
case $PROVIDER in
  163|vip.163|126|vip.126|188|vip.188|yeah|netease-enterprise-north|netease-enterprise-east)
    echo ""
    echo "Note: NetEase requires an authorization code (授权码), not your account password."
    ;;
esac

read -p "Accept self-signed certificates? (y/n): " ACCEPT_CERT
if [ "$ACCEPT_CERT" = "y" ]; then
  REJECT_UNAUTHORIZED="false"
else
  REJECT_UNAUTHORIZED="true"
fi

# Only ask for shared settings on first-time or reconfigure
ASK_SHARED=false
if [ "$SETUP_MODE" = "default" ] || [ "$SETUP_MODE" = "reconfigure" ]; then
  ASK_SHARED=true
fi

if [ "$ASK_SHARED" = true ]; then
  read -p "Allowed directories for reading files (comma-separated, e.g. ~/Downloads,~/Documents): " ALLOWED_READ_DIRS
  read -p "Allowed directories for saving attachments (comma-separated, e.g. ~/Downloads): " ALLOWED_WRITE_DIRS
fi

# Create config directory
mkdir -p -m 700 "$SHARED_CONFIG_DIR"

# Build account variables block
ACCOUNT_VARS="# ${ACCOUNT_NAME:-Default} account
${ACCOUNT_PREFIX}PROVIDER=$PROVIDER
${ACCOUNT_PREFIX}USERNAME=$EMAIL
${ACCOUNT_PREFIX}PASSWORD=$PASSWORD"

# Custom provider fields
if [ "$PROVIDER" = "custom" ]; then
  ACCOUNT_VARS="$ACCOUNT_VARS
${ACCOUNT_PREFIX}IMAP_HOST=$IMAP_HOST
${ACCOUNT_PREFIX}IMAP_PORT=$IMAP_PORT
${ACCOUNT_PREFIX}IMAP_TLS=$IMAP_TLS
${ACCOUNT_PREFIX}SMTP_HOST=$SMTP_HOST
${ACCOUNT_PREFIX}SMTP_PORT=$SMTP_PORT
${ACCOUNT_PREFIX}SMTP_SECURE=$SMTP_SECURE"
fi

if [ "$REJECT_UNAUTHORIZED" = "false" ]; then
  ACCOUNT_VARS="$ACCOUNT_VARS
${ACCOUNT_PREFIX}IMAP_REJECT_UNAUTHORIZED=false
${ACCOUNT_PREFIX}SMTP_REJECT_UNAUTHORIZED=false"
fi

case $SETUP_MODE in
  "default")
    cat > "$CONFIG_FILE" << EOF
$ACCOUNT_VARS

# File access whitelist (security)
ALLOWED_READ_DIRS=${ALLOWED_READ_DIRS:-$HOME/Downloads,$HOME/Documents}
ALLOWED_WRITE_DIRS=${ALLOWED_WRITE_DIRS:-$HOME/Downloads}
EOF
    ;;
  "reconfigure")
    TEMP_FILE=$(mktemp)
    grep -E '^[A-Z0-9]+_(PROVIDER|USERNAME|PASSWORD|IMAP_|SMTP_)' "$CONFIG_FILE" > "$TEMP_FILE.named" 2>/dev/null || true

    cat > "$TEMP_FILE" << EOF
$ACCOUNT_VARS

# File access whitelist (security)
ALLOWED_READ_DIRS=${ALLOWED_READ_DIRS:-$HOME/Downloads,$HOME/Documents}
ALLOWED_WRITE_DIRS=${ALLOWED_WRITE_DIRS:-$HOME/Downloads}
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

echo "Testing connections..."
echo ""

ACCOUNT_FLAG=""
if [ -n "$ACCOUNT_NAME" ]; then
  ACCOUNT_FLAG="--account $ACCOUNT_NAME"
fi

echo "Testing IMAP..."
if node scripts/imap.js $ACCOUNT_FLAG list-mailboxes >/dev/null 2>&1; then
    echo "IMAP connection successful!"
else
    echo "IMAP connection test failed"
    echo "   Please check your credentials and settings"
fi

echo ""
echo "Testing SMTP..."
echo "  (This will send a test email to your own address: $EMAIL)"
if node scripts/smtp.js $ACCOUNT_FLAG test >/dev/null 2>&1; then
    echo "SMTP connection successful!"
else
    echo "SMTP connection test failed"
    echo "   Please check your credentials and settings"
fi

echo ""
echo "Setup complete! Try:"
if [ -n "$ACCOUNT_NAME" ]; then
  echo "  node scripts/imap.js --account $ACCOUNT_NAME check"
  echo "  node scripts/smtp.js --account $ACCOUNT_NAME send --to recipient@example.com --subject Test --body 'Hello World'"
else
  echo "  node scripts/imap.js check"
  echo "  node scripts/smtp.js send --to recipient@example.com --subject Test --body 'Hello World'"
fi
