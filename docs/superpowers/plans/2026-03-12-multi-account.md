# Multi-Account Support Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-account support to the imap-smtp-email skill using variable prefixes in a single `.env` file, and move config to `~/.config/imap-smtp-email/`.

**Architecture:** A new `scripts/config.js` module handles `.env` discovery, `--account` flag parsing, and prefix-based config resolution. Both `imap.js` and `smtp.js` import this module instead of reading `process.env` directly. `setup.sh` gains a multi-account flow writing to `~/.config/imap-smtp-email/.env`.

**Tech Stack:** Node.js, dotenv, bash

**Spec:** `docs/superpowers/specs/2026-03-12-multi-account-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/config.js` | Create | .env discovery, `--account` argv parsing/stripping, prefix-based config building |
| `scripts/imap.js` | Modify | Replace `process.env` reads with `config.*`, use `config.allowedWriteDirs` |
| `scripts/smtp.js` | Modify | Replace `process.env` reads with `config.*`, fix `testConnection()` |
| `setup.sh` | Modify | Multi-account flow, write to `~/.config/imap-smtp-email/.env` |
| `SKILL.md` | Modify | Update metadata, add multi-account docs, add `--account` to examples |

---

## Chunk 1: Create `scripts/config.js`

### Task 1: Create `scripts/config.js`

**Files:**
- Create: `imap-smtp-email/scripts/config.js`

- [ ] **Step 1: Create `scripts/config.js`**

```js
#!/usr/bin/env node

const path = require('path');
const os = require('os');
const fs = require('fs');
const dotenv = require('dotenv');

// Config file locations
const PRIMARY_ENV_PATH = path.join(os.homedir(), '.config', 'imap-smtp-email', '.env');
const FALLBACK_ENV_PATH = path.resolve(__dirname, '../.env');

// Find the .env file: primary location first, then fallback
function findEnvPath() {
  if (fs.existsSync(PRIMARY_ENV_PATH)) return PRIMARY_ENV_PATH;
  if (fs.existsSync(FALLBACK_ENV_PATH)) return FALLBACK_ENV_PATH;
  return null;
}

// Parse and strip --account <name> from process.argv
// After this, process.argv[2] is always the command
function parseAccountFromArgv(argv) {
  const args = argv.slice(2);
  const idx = args.indexOf('--account');
  if (idx !== -1 && idx + 1 < args.length) {
    const name = args[idx + 1];
    args.splice(idx, 2);
    return { accountName: name, remainingArgs: args };
  }
  return { accountName: null, remainingArgs: args };
}

// Build config object from environment variables
// prefix: uppercase account name (e.g., 'WORK') or null for default
function buildConfig(env, prefix) {
  const p = prefix ? `${prefix}_` : '';

  // Account existence check for named accounts
  if (prefix && !env[`${p}IMAP_HOST`]) {
    console.error(`Error: Account "${prefix.toLowerCase()}" not found in config. Check ~/.config/imap-smtp-email/.env`);
    process.exit(1);
  }

  return {
    imap: {
      host: env[`${p}IMAP_HOST`] || '127.0.0.1',
      port: parseInt(env[`${p}IMAP_PORT`]) || 1143,
      user: env[`${p}IMAP_USER`],
      pass: env[`${p}IMAP_PASS`],
      tls: env[`${p}IMAP_TLS`] === 'true',
      rejectUnauthorized: env[`${p}IMAP_REJECT_UNAUTHORIZED`] !== 'false',
      mailbox: env[`${p}IMAP_MAILBOX`] || 'INBOX',
    },
    smtp: {
      host: env[`${p}SMTP_HOST`],
      port: parseInt(env[`${p}SMTP_PORT`]) || 587,
      user: env[`${p}SMTP_USER`],
      pass: env[`${p}SMTP_PASS`],
      secure: env[`${p}SMTP_SECURE`] === 'true',
      from: env[`${p}SMTP_FROM`] || env[`${p}SMTP_USER`],
      rejectUnauthorized: env[`${p}SMTP_REJECT_UNAUTHORIZED`] !== 'false',
    },
    allowedReadDirs: (env.ALLOWED_READ_DIRS || '').split(',').map(d => d.trim()).filter(Boolean),
    allowedWriteDirs: (env.ALLOWED_WRITE_DIRS || '').split(',').map(d => d.trim()).filter(Boolean),
  };
}

// --- Module initialization ---
const envPath = findEnvPath();
if (envPath) {
  dotenv.config({ path: envPath });
}

const { accountName, remainingArgs } = parseAccountFromArgv(process.argv);
const prefix = accountName ? accountName.toUpperCase() : null;

// Strip --account from process.argv so callers see command at argv[2]
process.argv = [process.argv[0], process.argv[1], ...remainingArgs];

const config = buildConfig(process.env, prefix);

module.exports = config;
```

- [ ] **Step 2: Verify config.js loads correctly**

Create a temporary test `.env` at `~/.config/imap-smtp-email/.env` (if not present, use existing `<skill-dir>/.env`). Run:

```bash
cd imap-smtp-email && node -e "const c = require('./scripts/config'); console.log(JSON.stringify(c, null, 2))"
```

Expected: prints the config object with `imap`, `smtp`, `allowedReadDirs`, `allowedWriteDirs` fields populated from the `.env`.

- [ ] **Step 3: Commit**

```bash
git add imap-smtp-email/scripts/config.js
git commit -m "feat: 添加多账号配置加载模块 config.js"
```

---

## Chunk 2: Update `scripts/imap.js`

### Task 2: Migrate `imap.js` to use `config.js`

**Files:**
- Modify: `imap-smtp-email/scripts/imap.js`

- [ ] **Step 1: Replace dotenv with config import**

Line 14 — replace:
```js
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
```
with:
```js
const config = require('./config');
```

- [ ] **Step 2: Update `validateWritePath` to use config**

Replace lines 16-37 (the entire `validateWritePath` function) with:
```js
function validateWritePath(dirPath) {
  if (!config.allowedWriteDirs.length) {
    throw new Error('ALLOWED_WRITE_DIRS not set in .env. Attachment download is disabled.');
  }

  const resolved = path.resolve(dirPath.replace(/^~/, os.homedir()));

  const allowedDirs = config.allowedWriteDirs.map(d =>
    path.resolve(d.replace(/^~/, os.homedir()))
  );

  const allowed = allowedDirs.some(dir =>
    resolved === dir || resolved.startsWith(dir + path.sep)
  );

  if (!allowed) {
    throw new Error(`Access denied: '${dirPath}' is outside allowed write directories`);
  }

  return resolved;
}
```

- [ ] **Step 3: Update `DEFAULT_MAILBOX`**

Line 51 — replace:
```js
const DEFAULT_MAILBOX = process.env.IMAP_MAILBOX || 'INBOX';
```
with:
```js
const DEFAULT_MAILBOX = config.imap.mailbox;
```

- [ ] **Step 4: Update `createImapConfig`**

Replace lines 76-89 (the entire `createImapConfig` function) with:
```js
function createImapConfig() {
  return {
    user: config.imap.user,
    password: config.imap.pass,
    host: config.imap.host,
    port: config.imap.port,
    tls: config.imap.tls,
    tlsOptions: {
      rejectUnauthorized: config.imap.rejectUnauthorized,
    },
    connTimeout: 10000,
    authTimeout: 10000,
  };
}
```

- [ ] **Step 5: Fix variable shadowing and error message in `connect()`**

Lines 92-97 — the local variable `const config = createImapConfig()` shadows the module-level `config` import. Rename it and update the error message. Replace:
```js
async function connect() {
  const config = createImapConfig();

  if (!config.user || !config.password) {
    throw new Error('Missing IMAP_USER or IMAP_PASS environment variables');
  }
```
with:
```js
async function connect() {
  const imapConfig = createImapConfig();

  if (!imapConfig.user || !imapConfig.password) {
    throw new Error('Missing IMAP user or password. Check your config at ~/.config/imap-smtp-email/.env');
  }
```

Also update line 100 inside the same function — replace:
```js
    const imap = new Imap(config);
```
with:
```js
    const imap = new Imap(imapConfig);
```

- [ ] **Step 6: Verify imap.js still works**

Run (with a valid `.env`):
```bash
cd imap-smtp-email && node scripts/imap.js list-mailboxes
```

Expected: same output as before (list of mailboxes).

- [ ] **Step 7: Commit**

```bash
git add imap-smtp-email/scripts/imap.js
git commit -m "refactor: imap.js 改用 config.js 加载配置"
```

---

## Chunk 3: Update `scripts/smtp.js`

### Task 3: Migrate `smtp.js` to use `config.js`

**Files:**
- Modify: `imap-smtp-email/scripts/smtp.js`

- [ ] **Step 1: Replace dotenv with config import**

Line 13 — replace:
```js
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
```
with:
```js
const config = require('./config');
```

- [ ] **Step 2: Update `validateReadPath` to use config**

Replace lines 15-41 (the entire `validateReadPath` function) with:
```js
function validateReadPath(inputPath) {
  let realPath;
  try {
    realPath = fs.realpathSync(inputPath);
  } catch {
    realPath = path.resolve(inputPath);
  }

  if (!config.allowedReadDirs.length) {
    throw new Error('ALLOWED_READ_DIRS not set in .env. File read operations are disabled.');
  }

  const allowedDirs = config.allowedReadDirs.map(d =>
    path.resolve(d.replace(/^~/, os.homedir()))
  );

  const allowed = allowedDirs.some(dir =>
    realPath === dir || realPath.startsWith(dir + path.sep)
  );

  if (!allowed) {
    throw new Error(`Access denied: '${inputPath}' is outside allowed read directories`);
  }

  return realPath;
}
```

- [ ] **Step 3: Update `createTransporter`**

Replace lines 66-85 (the entire `createTransporter` function) with:
```js
function createTransporter() {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    throw new Error('Missing SMTP configuration. Check your config at ~/.config/imap-smtp-email/.env');
  }

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
    tls: {
      rejectUnauthorized: config.smtp.rejectUnauthorized,
    },
  });
}
```

- [ ] **Step 4: Update `sendEmail` from field**

Line 100 — replace:
```js
    from: options.from || process.env.SMTP_FROM || process.env.SMTP_USER,
```
with:
```js
    from: options.from || config.smtp.from,
```

- [ ] **Step 5: Update `testConnection`**

Replace lines 149-170 (the entire `testConnection` function) with:
```js
async function testConnection() {
  const transporter = createTransporter();

  try {
    await transporter.verify();
    const info = await transporter.sendMail({
      from: config.smtp.from || config.smtp.user,
      to: config.smtp.user,
      subject: 'SMTP Connection Test',
      text: 'This is a test email from the IMAP/SMTP email skill.',
      html: '<p>This is a <strong>test email</strong> from the IMAP/SMTP email skill.</p>',
    });

    return {
      success: true,
      message: 'SMTP connection successful',
      messageId: info.messageId,
    };
  } catch (err) {
    throw new Error(`SMTP test failed: ${err.message}`);
  }
}
```

- [ ] **Step 6: Verify smtp.js still works**

Run (with a valid `.env`):
```bash
cd imap-smtp-email && node scripts/smtp.js test
```

Expected: same output as before (sends test email).

- [ ] **Step 7: Commit**

```bash
git add imap-smtp-email/scripts/smtp.js
git commit -m "refactor: smtp.js 改用 config.js 加载配置"
```

---

## Chunk 4: Update `setup.sh`

### Task 4: Add multi-account flow to `setup.sh`

**Files:**
- Modify: `imap-smtp-email/setup.sh`

- [ ] **Step 1: Rewrite `setup.sh` with multi-account support**

Replace the entire file with the following. Key changes from original:
- Config writes to `~/.config/imap-smtp-email/.env` instead of local `.env`
- Detects existing config and offers "reconfigure default" or "add new account"
- Named accounts use `NAME_` prefix on all variables
- Shared settings only prompted on default account setup
- Test commands use `--account` flag when applicable

```bash
#!/bin/bash

# IMAP/SMTP Email Skill Setup Helper

CONFIG_DIR="$HOME/.config/imap-smtp-email"
CONFIG_FILE="$CONFIG_DIR/.env"

echo "================================"
echo "  IMAP/SMTP Email Skill Setup"
echo "================================"
echo ""

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

# Prompt for email provider
echo "Select your email provider:"
echo "  1) Gmail"
echo "  2) Outlook"
echo "  3) 163.com"
echo "  4) vip.163.com"
echo "  5) 126.com"
echo "  6) vip.126.com"
echo "  7) 188.com"
echo "  8) vip.188.com"
echo "  9) yeah.net"
echo " 10) QQ Mail"
echo " 11) Custom"
echo ""
read -p "Enter choice (1-11): " PROVIDER_CHOICE

case $PROVIDER_CHOICE in
  1)
    IMAP_HOST="imap.gmail.com"
    IMAP_PORT="993"
    SMTP_HOST="smtp.gmail.com"
    SMTP_PORT="587"
    SMTP_SECURE="false"
    IMAP_TLS="true"
    echo ""
    echo "⚠️  Gmail requires an App Password — your regular Google password will NOT work."
    echo "   1. Go to: https://myaccount.google.com/apppasswords"
    echo "   2. Generate an App Password (requires 2-Step Verification enabled)"
    echo "   3. Use the generated 16-character password below"
    echo ""
    ;;
  2)
    IMAP_HOST="outlook.office365.com"
    IMAP_PORT="993"
    SMTP_HOST="smtp.office365.com"
    SMTP_PORT="587"
    SMTP_SECURE="false"
    IMAP_TLS="true"
    ;;
  3)
    IMAP_HOST="imap.163.com"
    IMAP_PORT="993"
    SMTP_HOST="smtp.163.com"
    SMTP_PORT="465"
    SMTP_SECURE="true"
    IMAP_TLS="true"
    ;;
  4)
    IMAP_HOST="imap.vip.163.com"
    IMAP_PORT="993"
    SMTP_HOST="smtp.vip.163.com"
    SMTP_PORT="465"
    SMTP_SECURE="true"
    IMAP_TLS="true"
    ;;
  5)
    IMAP_HOST="imap.126.com"
    IMAP_PORT="993"
    SMTP_HOST="smtp.126.com"
    SMTP_PORT="465"
    SMTP_SECURE="true"
    IMAP_TLS="true"
    ;;
  6)
    IMAP_HOST="imap.vip.126.com"
    IMAP_PORT="993"
    SMTP_HOST="smtp.vip.126.com"
    SMTP_PORT="465"
    SMTP_SECURE="true"
    IMAP_TLS="true"
    ;;
  7)
    IMAP_HOST="imap.188.com"
    IMAP_PORT="993"
    SMTP_HOST="smtp.188.com"
    SMTP_PORT="465"
    SMTP_SECURE="true"
    IMAP_TLS="true"
    ;;
  8)
    IMAP_HOST="imap.vip.188.com"
    IMAP_PORT="993"
    SMTP_HOST="smtp.vip.188.com"
    SMTP_PORT="465"
    SMTP_SECURE="true"
    IMAP_TLS="true"
    ;;
  9)
    IMAP_HOST="imap.yeah.net"
    IMAP_PORT="993"
    SMTP_HOST="smtp.yeah.net"
    SMTP_PORT="465"
    SMTP_SECURE="true"
    IMAP_TLS="true"
    ;;
  10)
    IMAP_HOST="imap.qq.com"
    IMAP_PORT="993"
    SMTP_HOST="smtp.qq.com"
    SMTP_PORT="587"
    SMTP_SECURE="false"
    IMAP_TLS="true"
    ;;
  11)
    read -p "IMAP Host: " IMAP_HOST
    read -p "IMAP Port: " IMAP_PORT
    read -p "SMTP Host: " SMTP_HOST
    read -p "SMTP Port: " SMTP_PORT
    read -p "Use TLS for IMAP? (true/false): " IMAP_TLS
    read -p "Use SSL for SMTP? (true/false): " SMTP_SECURE
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

echo ""
read -p "Email address: " EMAIL
read -s -p "Password / App Password / Authorization Code: " PASSWORD
echo ""
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
elif [ "$SETUP_MODE" = "add" ] && [ ! -f "$CONFIG_FILE" ]; then
  # Edge case: adding named account but no config file exists yet
  ASK_SHARED=true
fi

if [ "$ASK_SHARED" = true ]; then
  read -p "Allowed directories for reading files (comma-separated, e.g. ~/Downloads,~/Documents): " ALLOWED_READ_DIRS
  read -p "Allowed directories for saving attachments (comma-separated, e.g. ~/Downloads): " ALLOWED_WRITE_DIRS
fi

# Create config directory
mkdir -p "$CONFIG_DIR"

# Build account variables block
ACCOUNT_VARS="# ${ACCOUNT_NAME:-Default} account
${ACCOUNT_PREFIX}IMAP_HOST=$IMAP_HOST
${ACCOUNT_PREFIX}IMAP_PORT=$IMAP_PORT
${ACCOUNT_PREFIX}IMAP_USER=$EMAIL
${ACCOUNT_PREFIX}IMAP_PASS=$PASSWORD
${ACCOUNT_PREFIX}IMAP_TLS=$IMAP_TLS
${ACCOUNT_PREFIX}IMAP_REJECT_UNAUTHORIZED=$REJECT_UNAUTHORIZED
${ACCOUNT_PREFIX}IMAP_MAILBOX=INBOX
${ACCOUNT_PREFIX}SMTP_HOST=$SMTP_HOST
${ACCOUNT_PREFIX}SMTP_PORT=$SMTP_PORT
${ACCOUNT_PREFIX}SMTP_SECURE=$SMTP_SECURE
${ACCOUNT_PREFIX}SMTP_USER=$EMAIL
${ACCOUNT_PREFIX}SMTP_PASS=$PASSWORD
${ACCOUNT_PREFIX}SMTP_FROM=$EMAIL
${ACCOUNT_PREFIX}SMTP_REJECT_UNAUTHORIZED=$REJECT_UNAUTHORIZED"

case $SETUP_MODE in
  "default")
    # First-time setup: write entire file
    cat > "$CONFIG_FILE" << EOF
$ACCOUNT_VARS

# File access whitelist (security)
ALLOWED_READ_DIRS=${ALLOWED_READ_DIRS:-$HOME/Downloads,$HOME/Documents}
ALLOWED_WRITE_DIRS=${ALLOWED_WRITE_DIRS:-$HOME/Downloads}
EOF
    ;;
  "reconfigure")
    # Keep only named-account lines (pattern: NAME_IMAP_* or NAME_SMTP_*)
    TEMP_FILE=$(mktemp)
    grep -E '^[A-Z0-9]+_(IMAP_|SMTP_)' "$CONFIG_FILE" > "$TEMP_FILE.named" 2>/dev/null || true

    cat > "$TEMP_FILE" << EOF
$ACCOUNT_VARS

# File access whitelist (security)
ALLOWED_READ_DIRS=${ALLOWED_READ_DIRS:-$HOME/Downloads,$HOME/Documents}
ALLOWED_WRITE_DIRS=${ALLOWED_WRITE_DIRS:-$HOME/Downloads}
EOF

    # Append retained named-account lines if any
    if [ -s "$TEMP_FILE.named" ]; then
      echo "" >> "$TEMP_FILE"
      echo "# Named accounts" >> "$TEMP_FILE"
      cat "$TEMP_FILE.named" >> "$TEMP_FILE"
    fi
    mv "$TEMP_FILE" "$CONFIG_FILE"
    rm -f "$TEMP_FILE.named"
    ;;
  "add")
    # Append named account to existing file
    echo "" >> "$CONFIG_FILE"
    echo "$ACCOUNT_VARS" >> "$CONFIG_FILE"
    # If shared settings were needed (edge case: no prior config)
    if [ "$ASK_SHARED" = true ]; then
      cat >> "$CONFIG_FILE" << EOF

# File access whitelist (security)
ALLOWED_READ_DIRS=${ALLOWED_READ_DIRS:-$HOME/Downloads,$HOME/Documents}
ALLOWED_WRITE_DIRS=${ALLOWED_WRITE_DIRS:-$HOME/Downloads}
EOF
    fi
    ;;
esac

echo ""
echo "✅ Configuration saved to $CONFIG_FILE"
chmod 600 "$CONFIG_FILE"
echo "✅ Set file permissions to 600 (owner read/write only)"
echo ""
echo "Testing connections..."
echo ""

# Build test command with account flag if applicable
ACCOUNT_FLAG=""
if [ -n "$ACCOUNT_NAME" ]; then
  ACCOUNT_FLAG="--account $ACCOUNT_NAME"
fi

# Test IMAP connection
echo "Testing IMAP..."
if node scripts/imap.js $ACCOUNT_FLAG list-mailboxes >/dev/null 2>&1; then
    echo "✅ IMAP connection successful!"
else
    echo "❌ IMAP connection test failed"
    echo "   Please check your credentials and settings"
fi

# Test SMTP connection
echo ""
echo "Testing SMTP..."
echo "  (This will send a test email to your own address: $EMAIL)"
if node scripts/smtp.js $ACCOUNT_FLAG test >/dev/null 2>&1; then
    echo "✅ SMTP connection successful!"
else
    echo "❌ SMTP connection test failed"
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
```

- [ ] **Step 2: Commit**

```bash
git add imap-smtp-email/setup.sh
git commit -m "feat: setup.sh 支持多账号配置流程"
```

---

## Chunk 5: Update `SKILL.md`

### Task 5: Update skill documentation

**Files:**
- Modify: `imap-smtp-email/SKILL.md`

- [ ] **Step 1: Update YAML metadata**

Replace the frontmatter (lines 1-19) with:
```yaml
---
name: imap-smtp-email
description: Read and send email via IMAP/SMTP. Check for new/unread messages, fetch content, search mailboxes, mark as read/unread, and send emails with attachments. Supports multiple accounts. Works with any IMAP/SMTP server including Gmail, Outlook, 163.com, vip.163.com, 126.com, vip.126.com, 188.com, and vip.188.com.
metadata:
  openclaw:
    emoji: "📧"
    requires:
      bins:
        - node
        - npm
---
```

Note: `requires.env` and `primaryEnv` are removed because config is now file-based at `~/.config/imap-smtp-email/.env`.

- [ ] **Step 2: Update Configuration section**

Replace the Configuration section (lines 26-47, from `## Configuration` to the end of the env code block) with:
```markdown
## Configuration

Run the setup script to configure your email account:

```bash
bash setup.sh
```

Configuration is stored at `~/.config/imap-smtp-email/.env` (survives skill updates).

### Config file format

```bash
# Default account (no prefix)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your@email.com
IMAP_PASS=your_password
IMAP_TLS=true
IMAP_REJECT_UNAUTHORIZED=true
IMAP_MAILBOX=INBOX

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASS=your_password
SMTP_FROM=your@gmail.com
SMTP_REJECT_UNAUTHORIZED=true

# File access whitelist (security)
ALLOWED_READ_DIRS=~/Downloads,~/Documents
ALLOWED_WRITE_DIRS=~/Downloads
```

- [ ] **Step 3: Add Multi-Account section**

Insert after the Configuration section (before `## Common Email Servers`):

```markdown
## Multi-Account

You can configure additional email accounts in the same config file. Each account uses a name prefix (uppercase) on all variables.

### Adding an account

Run the setup script and choose "Add a new account":

```bash
bash setup.sh
```

Or manually add prefixed variables to `~/.config/imap-smtp-email/.env`:

```bash
# Work account (WORK_ prefix)
WORK_IMAP_HOST=imap.company.com
WORK_IMAP_PORT=993
WORK_IMAP_USER=me@company.com
WORK_IMAP_PASS=password
WORK_IMAP_TLS=true
WORK_IMAP_REJECT_UNAUTHORIZED=true
WORK_IMAP_MAILBOX=INBOX
WORK_SMTP_HOST=smtp.company.com
WORK_SMTP_PORT=587
WORK_SMTP_SECURE=false
WORK_SMTP_USER=me@company.com
WORK_SMTP_PASS=password
WORK_SMTP_FROM=me@company.com
WORK_SMTP_REJECT_UNAUTHORIZED=true
```

### Using a named account

Add `--account <name>` before the command:

```bash
node scripts/imap.js --account work check
node scripts/smtp.js --account work send --to foo@bar.com --subject Hi --body Hello
```

Without `--account`, the default (unprefixed) account is used.

### Account name rules

- Letters and digits only (e.g., `work`, `163`, `personal2`)
- Case-insensitive: `work` and `WORK` refer to the same account
- The prefix in `.env` is always uppercase (e.g., `WORK_IMAP_HOST`)
```

- [ ] **Step 4: Add `--account` to all command examples**

Update each command's usage line in SKILL.md. Apply these edits:

**check** (line 80) — replace:
```
node scripts/imap.js check [--limit 10] [--mailbox INBOX] [--recent 2h]
```
with:
```
node scripts/imap.js [--account <name>] check [--limit 10] [--mailbox INBOX] [--recent 2h]
```

**fetch** (line 92) — replace:
```
node scripts/imap.js fetch <uid> [--mailbox INBOX]
```
with:
```
node scripts/imap.js [--account <name>] fetch <uid> [--mailbox INBOX]
```

**download** (line 99) — replace:
```
node scripts/imap.js download <uid> [--mailbox INBOX] [--dir <path>] [--file <filename>]
```
with:
```
node scripts/imap.js [--account <name>] download <uid> [--mailbox INBOX] [--dir <path>] [--file <filename>]
```

**search** (line 111) — replace:
```
node scripts/imap.js search [options]
```
with:
```
node scripts/imap.js [--account <name>] search [options]
```

**mark-read / mark-unread** (lines 129-130) — replace:
```
node scripts/imap.js mark-read <uid> [uid2 uid3...]
node scripts/imap.js mark-unread <uid> [uid2 uid3...]
```
with:
```
node scripts/imap.js [--account <name>] mark-read <uid> [uid2 uid3...]
node scripts/imap.js [--account <name>] mark-unread <uid> [uid2 uid3...]
```

**list-mailboxes** (line 137) — replace:
```
node scripts/imap.js list-mailboxes
```
with:
```
node scripts/imap.js [--account <name>] list-mailboxes
```

**send** (line 146) — replace:
```
node scripts/smtp.js send --to <email> --subject <text> [options]
```
with:
```
node scripts/smtp.js [--account <name>] send --to <email> --subject <text> [options]
```

**test** (line 182) — replace:
```
node scripts/smtp.js test
```
with:
```
node scripts/smtp.js [--account <name>] test
```

- [ ] **Step 5: Update Security Notes section**

Replace lines 191-195 (the Security Notes section) with:
```markdown
## Security Notes

- Configuration is stored at `~/.config/imap-smtp-email/.env` with `600` permissions (owner read/write only)
- **Gmail**: regular password is rejected — generate an App Password at https://myaccount.google.com/apppasswords
- For 163.com: use authorization code (授权码), not account password
```

- [ ] **Step 6: Commit**

```bash
git add imap-smtp-email/SKILL.md
git commit -m "docs: SKILL.md 添加多账号使用说明"
```
