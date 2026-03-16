# List Configured Email Accounts - Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `list-accounts` command to display all configured email accounts in the imap-smtp-email skill.

**Architecture:** Add account listing functions to `config.js` (the shared configuration module), then wire up the command in both `imap.js` and `smtp.js` entry points. The functions parse the `.env` file, identify account prefixes via the `XXX_IMAP_HOST` pattern, and return structured account data for display.

**Tech Stack:** Node.js, dotenv (already in use), no additional dependencies

---

## Chunk 1: Add listAccounts functionality to config.js

This chunk adds the core account listing logic to the shared configuration module.

### Task 1: Add listAccounts() function to config.js

**Files:**
- Modify: `scripts/config.js` (add after line 64, after `buildConfig` function)

- [ ] **Step 1: Add the listAccounts() function**

Open `scripts/config.js` and add the following function after the `buildConfig` function (around line 65):

```javascript
// List all configured accounts from .env file
// Returns { accounts: Array, configPath: String|null }
function listAccounts() {
  const envPath = findEnvPath();
  if (!envPath) {
    return { accounts: [], configPath: null };
  }

  // Parse the env file fresh to get all account prefixes
  const dotenvResult = dotenv.config({ path: envPath });
  const env = dotenvResult.parsed || {};
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

// Create an account object from env variables
function createAccountObject(env, prefix, name) {
  const p = prefix;
  return {
    name,
    email: env[`${p}IMAP_USER`] || env[`${p}SMTP_FROM`] || '-',
    imapHost: env[`${p}IMAP_HOST`] || '-',
    smtpHost: env[`${p}SMTP_HOST`] || '-',
    isComplete: isAccountComplete(env, prefix)
  };
}

// Check if an account has all required configuration
function isAccountComplete(env, prefix) {
  const p = prefix;
  return !!(
    env[`${p}IMAP_HOST`] &&
    env[`${p}IMAP_USER`] &&
    env[`${p}IMAP_PASS`] &&
    env[`${p}SMTP_HOST`]
  );
}
```

- [ ] **Step 2: Export listAccounts function**

At the end of `config.js`, update the module.exports to include `listAccounts` (around line 81):

Find this line:
```javascript
module.exports = config;
```

Replace with:
```javascript
module.exports = config;
module.exports.listAccounts = listAccounts;
```

- [ ] **Step 3: Verify syntax**

Run: `node -c scripts/config.js`
Expected: No syntax errors

- [ ] **Step 4: Commit**

```bash
git add scripts/config.js
git commit -m "feat: add listAccounts function to config.js

Add listAccounts(), createAccountObject(), and isAccountComplete()
functions to parse and list all configured email accounts from .env file."
```

---

## Chunk 2: Add list-accounts command to imap.js

This chunk wires up the list-accounts command in the IMAP CLI, including table formatting for output.

### Task 2: Add displayAccounts() function to imap.js

**Files:**
- Modify: `scripts/imap.js` (add before the main() function, around line 520)

- [ ] **Step 1: Add displayAccounts() function**

```javascript
// Display accounts in a formatted table
function displayAccounts(accounts, configPath) {
  // Handle no config file case
  if (!configPath) {
    console.error('No configuration file found.');
    console.error('Run "bash setup.sh" to configure your email account.');
    process.exit(1);
  }

  // Handle no accounts case
  if (accounts.length === 0) {
    console.error(`No accounts configured in ${configPath}`);
    process.exit(0);
  }

  // Display header with config path
  console.log(`Configured accounts (from ${configPath}):\n`);

  // Calculate column widths
  const maxNameLen = Math.max(7, ...accounts.map(a => a.name.length)); // 7 = 'Account'.length
  const maxEmailLen = Math.max(5, ...accounts.map(a => a.email.length)); // 5 = 'Email'.length
  const maxImapLen = Math.max(4, ...accounts.map(a => a.imapHost.length)); // 4 = 'IMAP'.length
  const maxSmtpLen = Math.max(4, ...accounts.map(a => a.smtpHost.length)); // 4 = 'SMTP'.length

  // Table header
  const header = `  ${padRight('Account', maxNameLen)}  ${padRight('Email', maxEmailLen)}  ${padRight('IMAP', maxImapLen)}  ${padRight('SMTP', maxSmtpLen)}  Status`;
  console.log(header);

  // Separator line
  const separator = '  ' + '─'.repeat(maxNameLen) + '  ' + '─'.repeat(maxEmailLen) + '  ' + '─'.repeat(maxImapLen) + '  ' + '─'.repeat(maxSmtpLen) + '  ' + '────────────────';
  console.log(separator);

  // Table rows
  for (const account of accounts) {
    const statusIcon = account.isComplete ? '✓' : '⚠';
    const statusText = account.isComplete ? 'Complete' : 'Incomplete';
    const row = `  ${padRight(account.name, maxNameLen)}  ${padRight(account.email, maxEmailLen)}  ${padRight(account.imapHost, maxImapLen)}  ${padRight(account.smtpHost, maxSmtpLen)}  ${statusIcon} ${statusText}`;
    console.log(row);
  }

  // Footer
  console.log(`\n  ${accounts.length} account${accounts.length > 1 ? 's' : ''} total`);
}

// Helper: right-pad a string to a fixed width
function padRight(str, len) {
  return (str + ' '.repeat(len)).slice(0, len);
}
```

- [ ] **Step 2: Add list-accounts case to switch statement**

In the `main()` function, add a new case to the switch statement (around line 570, after `list-mailboxes` case, before `default` case):

```javascript
      case 'list-accounts':
        {
          const { listAccounts } = require('./config');
          const { accounts, configPath } = listAccounts();
          displayAccounts(accounts, configPath);
        }
        return;  // Exit early, no JSON output
```

- [ ] **Step 3: Update the error message for unknown commands**

Find the line in the `default` case that lists available commands (around line 576):

Change from:
```javascript
        console.error('Available commands: check, fetch, download, search, mark-read, mark-unread, list-mailboxes');
```

To:
```javascript
        console.error('Available commands: check, fetch, download, search, mark-read, mark-unread, list-mailboxes, list-accounts');
```

- [ ] **Step 4: Verify syntax**

Run: `node -c scripts/imap.js`
Expected: No syntax errors

- [ ] **Step 5: Manual test**

Run: `node scripts/imap.js list-accounts`
Expected: Formatted table showing configured accounts, or appropriate error message

- [ ] **Step 6: Commit**

```bash
git add scripts/imap.js
git commit -m "feat: add list-accounts command to imap.js

Add displayAccounts() function for formatted table output.
Add list-accounts case to command switch statement."
```

---

## Chunk 3: Add list-accounts command to smtp.js

This chunk adds the same list-accounts functionality to the SMTP CLI.

### Task 3: Add displayAccounts() function to smtp.js

**Files:**
- Modify: `scripts/smtp.js` (add before the main() function, around line 169)

- [ ] **Step 1: Add displayAccounts() function**

```javascript
// Display accounts in a formatted table
function displayAccounts(accounts, configPath) {
  // Handle no config file case
  if (!configPath) {
    console.error('No configuration file found.');
    console.error('Run "bash setup.sh" to configure your email account.');
    process.exit(1);
  }

  // Handle no accounts case
  if (accounts.length === 0) {
    console.error(`No accounts configured in ${configPath}`);
    process.exit(0);
  }

  // Display header with config path
  console.log(`Configured accounts (from ${configPath}):\n`);

  // Calculate column widths
  const maxNameLen = Math.max(7, ...accounts.map(a => a.name.length)); // 7 = 'Account'.length
  const maxEmailLen = Math.max(5, ...accounts.map(a => a.email.length)); // 5 = 'Email'.length
  const maxImapLen = Math.max(4, ...accounts.map(a => a.imapHost.length)); // 4 = 'IMAP'.length
  const maxSmtpLen = Math.max(4, ...accounts.map(a => a.smtpHost.length)); // 4 = 'SMTP'.length

  // Table header
  const header = `  ${padRight('Account', maxNameLen)}  ${padRight('Email', maxEmailLen)}  ${padRight('IMAP', maxImapLen)}  ${padRight('SMTP', maxSmtpLen)}  Status`;
  console.log(header);

  // Separator line
  const separator = '  ' + '─'.repeat(maxNameLen) + '  ' + '─'.repeat(maxEmailLen) + '  ' + '─'.repeat(maxImapLen) + '  ' + '─'.repeat(maxSmtpLen) + '  ' + '────────────────';
  console.log(separator);

  // Table rows
  for (const account of accounts) {
    const statusIcon = account.isComplete ? '✓' : '⚠';
    const statusText = account.isComplete ? 'Complete' : 'Incomplete';
    const row = `  ${padRight(account.name, maxNameLen)}  ${padRight(account.email, maxEmailLen)}  ${padRight(account.imapHost, maxImapLen)}  ${padRight(account.smtpHost, maxSmtpLen)}  ${statusIcon} ${statusText}`;
    console.log(row);
  }

  // Footer
  console.log(`\n  ${accounts.length} account${accounts.length > 1 ? 's' : ''} total`);
}

// Helper: right-pad a string to a fixed width
function padRight(str, len) {
  return (str + ' '.repeat(len)).slice(0, len);
}
```

- [ ] **Step 2: Add list-accounts case to switch statement**

In the `main()` function, add a new case to the switch statement (around line 212, after `test` case, before `default` case):

```javascript
      case 'list-accounts':
        {
          const { listAccounts } = require('./config');
          const { accounts, configPath } = listAccounts();
          displayAccounts(accounts, configPath);
        }
        return;  // Exit early, no JSON output
```

- [ ] **Step 3: Update the error message for unknown commands**

Find the lines in the `default` case that list available commands (around line 216):

Change from:
```javascript
        console.error('Available commands: send, test');
```

To:
```javascript
        console.error('Available commands: send, test, list-accounts');
```

- [ ] **Step 4: Verify syntax**

Run: `node -c scripts/smtp.js`
Expected: No syntax errors

- [ ] **Step 5: Manual test**

Run: `node scripts/smtp.js list-accounts`
Expected: Same formatted table as imap.js

- [ ] **Step 6: Commit**

```bash
git add scripts/smtp.js
git commit -m "feat: add list-accounts command to smtp.js

Add displayAccounts() function for formatted table output.
Add list-accounts case to command switch statement."
```

---

## Chunk 4: Update SKILL.md documentation

This chunk adds documentation for the new list-accounts command.

### Task 4: Add list-accounts documentation to SKILL.md

**Files:**
- Modify: `imap-smtp-email/SKILL.md`

- [ ] **Step 1: Add list-accounts section after list-mailboxes**

Find the `### list-mailboxes` section (around line 186) and add the following after it:

```markdown
### list-accounts
List all configured email accounts.

```bash
node scripts/imap.js list-accounts
node scripts/smtp.js list-accounts
```

Shows account name, email address, server addresses, and configuration status.
```

- [ ] **Step 2: Verify markdown formatting**

Run: `head -200 imap-smtp-email/SKILL.md | tail -20`
Expected: See the new list-accounts section with proper formatting

- [ ] **Step 3: Commit**

```bash
git add imap-smtp-email/SKILL.md
git commit -m "docs: add list-accounts command documentation to SKILL.md"
```

---

## Chunk 5: Update README.md documentation

This chunk adds a usage example for list-accounts in the main README.

### Task 5: Add list-accounts example to README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add list-accounts example to usage section**

Find the `## 💡 Usage Examples` section (around line 97) and add the following after the "Check for New Emails" subsection:

```markdown
### List Configured Accounts
```bash
node scripts/imap.js list-accounts
```
```

- [ ] **Step 2: Verify markdown formatting**

Run: `grep -A 3 "List Configured Accounts" README.md`
Expected: See the new section with proper formatting

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add list-accounts example to README.md"
```

---

## Testing Checklist

After completing all chunks, run the following tests:

- [ ] **Test 1: List accounts with default account**
```bash
node scripts/imap.js list-accounts
```
Expected: Shows at least the default account

- [ ] **Test 2: List accounts via smtp.js**
```bash
node scripts/smtp.js list-accounts
```
Expected: Same output as imap.js

- [ ] **Test 3: Test with no config file**
```bash
mv ~/.config/imap-smtp-email/.env ~/.config/imap-smtp-email/.env.bak
node scripts/imap.js list-accounts
mv ~/.config/imap-smtp-email/.env.bak ~/.config/imap-smtp-email/.env
```
Expected: "No configuration file found. Run 'bash setup.sh' to configure."

- [ ] **Test 4: Verify existing commands still work**
```bash
node scripts/imap.js list-mailboxes
```
Expected: Normal JSON output of mailboxes

---

## Summary

**Files Modified:**
1. `scripts/config.js` - Added `listAccounts()`, `createAccountObject()`, `isAccountComplete()`
2. `scripts/imap.js` - Added `displayAccounts()`, `padRight()`, and `list-accounts` command
3. `scripts/smtp.js` - Added `displayAccounts()`, `padRight()`, and `list-accounts` command
4. `SKILL.md` - Added documentation for `list-accounts` command
5. `README.md` - Added usage example for `list-accounts` command

**No New Dependencies:** Uses only existing Node.js built-ins and already-installed packages (dotenv)
