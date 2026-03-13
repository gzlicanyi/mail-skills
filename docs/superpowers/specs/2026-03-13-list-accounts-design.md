# List Configured Email Accounts - Design Spec

**Date:** 2026-03-13
**Status:** Draft
**Author:** Claude

## Overview

Add a `list-accounts` command to display all configured email accounts in the imap-smtp-email skill. Currently, users must manually inspect the `~/.config/imap-smtp-email/.env` file to see what accounts are configured.

## Goals

- Provide a quick way to see all configured email accounts
- Show account status (complete/incomplete)
- Work through both `imap.js` and `smtp.js` entry points
- Maintain backward compatibility

## Non-Goals

- Modifying existing account configurations
- Deleting accounts
- Testing account connections (use existing `test` command)

## Architecture

### Current State

- Configuration stored in `~/.config/imap-smtp-email/.env`
- Multi-account support via prefixes (e.g., `WORK_IMAP_HOST`)
- `config.js` is a shared module for configuration loading
- `imap.js` and `smtp.js` are CLI entry points

### New Functionality

Add a `listAccounts()` function to `config.js` that:
1. Parses the `.env` file
2. Identifies all account prefixes (pattern: `XXX_IMAP_HOST`)
3. Extracts account details for each prefix
4. Returns an array of account objects

### Data Flow

```
User runs: node scripts/imap.js list-accounts
    ↓
imap.js detects "list-accounts" command
    ↓
Calls listAccounts() from config.js
    ↓
config.js parses .env and extracts account info
    ↓
Returns array of account objects
    ↓
imap.js formats and displays table
```

## Implementation Details

### config.js Changes

**New Function: `listAccounts()`**

```javascript
function listAccounts() {
  const envPath = findEnvPath();
  if (!envPath) {
    return { accounts: [], configPath: null };
  }

  const env = dotenv.config({ path: envPath }).parsed || {};
  const accounts = [];
  const seen = new Set();

  // Check for default account (no prefix)
  if (env.IMAP_HOST) {
    accounts.push(createAccountObject(env, '', 'default'));
    seen.add('default');
  }

  // Scan for named accounts (pattern: XXX_IMAP_HOST)
  for (const key of Object.keys(env)) {
    const match = key.match(/^([A-Z0-9]+)_IMAP_HOST$/);
    if (match) {
      const prefix = match[1];
      const name = prefix.toLowerCase();
      if (!seen.has(name)) {
        accounts.push(createAccountObject(env, prefix + '_', name));
        seen.add(name);
      }
    }
  }

  return { accounts, configPath: envPath };
}

function createAccountObject(env, prefix, name) {
  return {
    name,
    email: env[`${prefix}IMAP_USER`] || env[`${prefix}SMTP_FROM`] || '-',
    imapHost: env[`${prefix}IMAP_HOST`] || '-',
    smtpHost: env[`${prefix}SMTP_HOST`] || '-',
    isComplete: isAccountComplete(env, prefix)
  };
}

function isAccountComplete(env, prefix) {
  const required = [
    `${prefix}IMAP_HOST`,
    `${prefix}IMAP_USER`,
    `${prefix}IMAP_PASS`,
    `${prefix}SMTP_HOST`
  ];
  return required.every(key => env[key]);
}
```

### imap.js Changes

Add command handler:

```javascript
if (command === 'list-accounts') {
  const { listAccounts } = require('./config');
  const { accounts, configPath } = listAccounts();
  displayAccounts(accounts, configPath);
  process.exit(0);
}
```

### smtp.js Changes

Same as imap.js - both scripts support the same command.

## Output Format

```
Configured accounts (from /home/user/.config/imap-smtp-email/.env):

  Account    Email                  IMAP                SMTP                Status
  ───────────────────────────────────────────────────────────────────────────────────
  default    user@gmail.com         imap.gmail.com      smtp.gmail.com      ✓ Complete
  work       me@company.com         imap.company.com    smtp.company.com    ✓ Complete
  personal   someone@163.com        imap.163.com        smtp.163.com        ⚠ Incomplete

  3 accounts total
```

### Edge Cases

| Situation | Output |
|-----------|--------|
| No config file | `No configuration file found. Run "bash setup.sh" to configure.` |
| Config exists, no accounts | `No accounts configured in /path/to/.env` |
| Single account | Show single row in table |

## File Modifications

| File | Changes |
|------|---------|
| `scripts/config.js` | Add `listAccounts()`, `createAccountObject()`, `isAccountComplete()` |
| `scripts/imap.js` | Add `list-accounts` command handler |
| `scripts/smtp.js` | Add `list-accounts` command handler |

## Testing

### Test Cases

1. **Empty config file** → Show "No accounts configured"
2. **Only default account** → Show 1 account as "default"
3. **Default + 2 named accounts** → Show all 3
4. **Incomplete account (missing password)** → Mark as "Incomplete"
5. **No config file exists** → Suggest running setup.sh

### Manual Test Commands

```bash
# Test listing accounts
node scripts/imap.js list-accounts
node scripts/smtp.js list-accounts

# Test with no config
mv ~/.config/imap-smtp-email/.env ~/.config/imap-smtp-email/.env.bak
node scripts/imap.js list-accounts
mv ~/.config/imap-smtp-email/.env.bak ~/.config/imap-smtp-email/.env
```

## Security Considerations

- Passwords are NEVER displayed in the output
- Only the config path is shown, not file contents
- No changes to existing permission checks (600 on .env file)

## Documentation Updates

Update SKILL.md to add:

```markdown
### list-accounts
List all configured email accounts.

```bash
node scripts/imap.js list-accounts
node scripts/smtp.js list-accounts
```

Shows account name, email address, server addresses, and configuration status.
```
