#!/usr/bin/env node

/**
 * Migrate a legacy ~/.config/imap-smtp-email/.env (IMAP_HOST/IMAP_USER/... format)
 * to the shared ~/.config/mail-skills/.env (PROVIDER/USERNAME/PASSWORD format).
 *
 * Parses the legacy file with dotenv (KEY=value only — never executes content),
 * discovers the default account + any NAME_-prefixed accounts, and prints the
 * shared-format config to stdout. setup.sh redirects stdout into the shared file.
 *
 * Usage: node migrate-legacy-config.js <legacy-env-path>
 * Exit 0 on success (config on stdout), 1 on failure (message on stderr).
 */

const fs = require('fs');
const os = require('os');
const dotenv = require('dotenv');
const { detectProvider } = require('./providers');

const legacyPath = process.argv[2];
if (!legacyPath) {
  console.error('Usage: node migrate-legacy-config.js <legacy-env-path>');
  process.exit(1);
}
if (!fs.existsSync(legacyPath)) {
  console.error(`Legacy config not found: ${legacyPath}`);
  process.exit(1);
}

// dotenv parses KEY=value lines only; it does NOT execute file content.
let parsed;
try {
  parsed = dotenv.config({ path: legacyPath }).parsed || {};
} catch (err) {
  console.error(`Failed to parse legacy config: ${err.message}`);
  process.exit(1);
}

const env = parsed;

// Expand each comma-separated entry's leading ~ to the home dir, matching config.js runtime behavior.
function expandHome(p) {
  if (typeof p !== 'string') return p;
  return p.split(',').map(s => s.trim().replace(/^~/, os.homedir())).join(',');
}

// Escape a value for safe .env writing: wrap in double quotes if it contains
// whitespace or shell metacharacters, and backslash-escape embedded quotes/backslashes.
// Values come from dotenv parsing (already de-quoted); we re-quote defensively.
function quote(value) {
  if (value === undefined || value === null) return '';
  const s = String(value);
  if (s === '') return '';
  if (/[\s#"'$`\\]/.test(s)) {
    return '"' + s.replace(/([\\"])/g, '\\$1') + '"';
  }
  return s;
}

// Build the shared-format block for one account.
// `prefix` is '' for default, 'WORK_' for a named account.
function accountBlock(prefix, name) {
  const p = prefix;
  const imapHost = env[`${p}IMAP_HOST`];
  const user = env[`${p}IMAP_USER`];
  const pass = env[`${p}IMAP_PASS`];
  const provider = detectProvider(imapHost || '') || 'custom';

  const lines = [];
  lines.push('');
  lines.push(`# ${name} account`);

  if (provider === 'custom') {
    lines.push(`${p}PROVIDER=custom`);
    lines.push(`${p}USERNAME=${quote(user)}`);
    lines.push(`${p}PASSWORD=${quote(pass)}`);
    lines.push(`${p}IMAP_HOST=${quote(imapHost)}`);
    lines.push(`${p}IMAP_PORT=${env[`${p}IMAP_PORT`] || '993'}`);
    lines.push(`${p}IMAP_TLS=${env[`${p}IMAP_TLS`] || 'true'}`);
    lines.push(`${p}SMTP_HOST=${quote(env[`${p}SMTP_HOST`])}`);
    lines.push(`${p}SMTP_PORT=${env[`${p}SMTP_PORT`] || '587'}`);
    lines.push(`${p}SMTP_SECURE=${env[`${p}SMTP_SECURE`] || 'false'}`);
  } else {
    lines.push(`${p}PROVIDER=${provider}`);
    lines.push(`${p}USERNAME=${quote(user)}`);
    lines.push(`${p}PASSWORD=${quote(pass)}`);
  }

  // rejectUnauthorized only written when explicitly false (matches current setup.sh).
  if (env[`${p}IMAP_REJECT_UNAUTHORIZED`] === 'false') {
    lines.push(`${p}IMAP_REJECT_UNAUTHORIZED=false`);
  }
  if (env[`${p}SMTP_REJECT_UNAUTHORIZED`] === 'false') {
    lines.push(`${p}SMTP_REJECT_UNAUTHORIZED=false`);
  }

  return lines;
}

// Discover accounts: default (bare IMAP_HOST) + named (NAME_IMAP_HOST).
const seen = new Set();
const blocks = [];

if (env.IMAP_HOST) {
  blocks.push(...accountBlock('', 'default'));
  seen.add('default');
}

for (const key of Object.keys(env)) {
  const match = key.match(/^([A-Z0-9]+)_IMAP_HOST$/);
  if (match) {
    const prefix = match[1] + '_';
    const name = match[1].toLowerCase();
    if (!seen.has(name)) {
      blocks.push(...accountBlock(prefix, name));
      seen.add(name);
    }
  }
}

// Shared file-access whitelist (always unprefixed). Expand ~ to home dir.
const readDirs = expandHome(env.ALLOWED_READ_DIRS || '~/Downloads,~/Documents');
const writeDirs = expandHome(env.ALLOWED_WRITE_DIRS || '~/Downloads');

blocks.push('');
blocks.push('# File access whitelist (security)');
blocks.push(`ALLOWED_READ_DIRS=${readDirs}`);
blocks.push(`ALLOWED_WRITE_DIRS=${writeDirs}`);

// Print to stdout. Drop the leading blank line of the first block for cleanliness.
process.stdout.write(blocks.join('\n').replace(/^\n/, '') + '\n');
