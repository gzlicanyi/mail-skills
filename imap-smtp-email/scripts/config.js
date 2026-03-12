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
