# Multi-Account Support Design

**Date:** 2026-03-12
**Skill:** imap-smtp-email
**Status:** Approved

## Background

The current `imap-smtp-email` skill supports only a single email account configured via environment variables in a `.env` file stored inside the skill directory. This design adds multi-account support for personal use cases (e.g., personal Gmail + work email), and also moves the config file to a stable user directory to prevent data loss on skill updates.

## Goals

- Support multiple named email accounts in a single `.env` file
- Allow Claude to select an account via `--account <name>` flag
- Default to the unprefixed account when no flag is given
- Move config to `~/.config/imap-smtp-email/.env` (outside skill directory, survives updates)
- Zero migration cost for existing single-account users

## Non-Goals

- Multi-user / multi-deployment scenarios
- Changeable default account (default is always the unprefixed variables)
- OAuth2 or external password manager integration

---

## Config Format

### File Location

```
~/.config/imap-smtp-email/.env   ← primary (persistent, survives skill updates)
<skill-dir>/.env                 ← fallback (backward compat for existing users)
```

### File Structure

```bash
# ── Default account (no prefix) ──────────────────────────────
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=personal@gmail.com
IMAP_PASS=app-password
IMAP_TLS=true
IMAP_REJECT_UNAUTHORIZED=true
IMAP_MAILBOX=INBOX

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=personal@gmail.com
SMTP_PASS=app-password
SMTP_FROM=personal@gmail.com
SMTP_REJECT_UNAUTHORIZED=true

# ── Additional account: work (prefix = WORK_) ─────────────────
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

# ── Shared settings (no prefix, applies to all accounts) ──────
ALLOWED_READ_DIRS=~/Downloads,~/Documents
ALLOWED_WRITE_DIRS=~/Downloads
```

### Conventions

- Account name: letters and digits only (e.g., `work`, `163`, `personal2`)
- Prefix: account name uppercased + underscore (e.g., `work` → `WORK_`)
- Unprefixed variables = default account (no configuration needed to select it)
- `ALLOWED_READ_DIRS` and `ALLOWED_WRITE_DIRS` are always unprefixed and apply globally

---

## Components

### New: `scripts/config.js`

Shared config loader used by both `imap.js` and `smtp.js`. Tracked in git.

**Responsibilities:**
1. Locate `.env`: check `~/.config/imap-smtp-email/.env` first, fall back to `<skill-dir>/.env`
2. Parse `--account <name>` from `process.argv`
3. Build config object: if account name given, read `NAME_IMAP_*` / `NAME_SMTP_*` vars; otherwise read unprefixed vars
4. Always read `ALLOWED_READ_DIRS` / `ALLOWED_WRITE_DIRS` without prefix
5. Export a single config object

**Exported shape:**
```js
{
  imap: { host, port, user, pass, tls, rejectUnauthorized, mailbox },
  smtp: { host, port, user, pass, secure, from, rejectUnauthorized },
  allowedReadDirs: string[],
  allowedWriteDirs: string[]
}
```

**Error handling:**
- If `--account work` is given but `WORK_IMAP_HOST` is not set → exit with clear error message: `Account "work" not found in config. Check ~/.config/imap-smtp-email/.env`

### Modified: `scripts/imap.js`

- Remove direct `process.env` reads for connection settings
- Import config from `./config`
- Pass `--account` parsing to `config.js` (strip it from args before command parsing)
- No change to command interface or business logic

### Modified: `scripts/smtp.js`

- Same changes as `imap.js`

### Modified: `setup.sh`

**New flow:**

```
1. Detect if ~/.config/imap-smtp-email/.env already exists
   - If yes: ask "Configure default account (overwrite) or add new account?"
   - If no: proceed to configure default account

2. If adding new account:
   - Prompt: "Account name (letters/digits only, e.g. work):"
   - Validate: reject if empty or contains invalid characters
   - Use NAME_ prefix when writing variables

3. Provider selection + credential prompts (unchanged)

4. Write to ~/.config/imap-smtp-email/.env
   - Default account: overwrite unprefixed vars
   - New account: append NAME_-prefixed vars
   - Shared settings (ALLOWED_READ_DIRS etc): only written when configuring default account

5. chmod 600 ~/.config/imap-smtp-email/.env

6. Test connection using --account flag if applicable
```

### Modified: `SKILL.md`

- Add `--account <name>` to all command examples
- Add "Multi-Account" section explaining:
  - Config file location
  - How to add accounts via `setup.sh`
  - Account name rules
  - Default account convention

---

## Git Tracking

| File | Status |
|------|--------|
| `scripts/config.js` | Tracked (new source file) |
| `scripts/imap.js` | Tracked (modified) |
| `scripts/smtp.js` | Tracked (modified) |
| `setup.sh` | Tracked (modified) |
| `SKILL.md` | Tracked (modified) |
| `~/.config/imap-smtp-email/.env` | Outside repo, not tracked |
| `<skill-dir>/.env` | Already gitignored |

---

## Usage Examples

```bash
# Default account
node scripts/imap.js check
node scripts/smtp.js send --to foo@bar.com --subject Hi --body Hello

# Named account
node scripts/imap.js --account work check
node scripts/imap.js --account work fetch 42
node scripts/smtp.js --account 163 send --to foo@bar.com --subject Hi --body Hello
```

---

## Migration for Existing Users

1. Run `setup.sh` — it detects no existing config at `~/.config/imap-smtp-email/.env`
2. Guides through default account setup (same flow as today)
3. Writes to `~/.config/imap-smtp-email/.env`
4. Old `<skill-dir>/.env` continues to work as fallback if user skips migration
