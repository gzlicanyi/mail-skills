#!/usr/bin/env node

const path = require('path');
const os = require('os');
const fs = require('fs');
const dotenv = require('dotenv');
const { PROVIDERS } = require('./providers');

// Config file locations
const LEGACY_ENV_PATH = path.join(os.homedir(), '.config', 'imap-smtp-email', '.env');
const SHARED_ENV_PATH = path.join(os.homedir(), '.config', 'mail-skills', '.env');
const FALLBACK_ENV_PATH = path.resolve(__dirname, '../.env');

function findEnvPath() {
  if (fs.existsSync(LEGACY_ENV_PATH)) return { path: LEGACY_ENV_PATH, type: 'legacy' };
  if (fs.existsSync(SHARED_ENV_PATH)) return { path: SHARED_ENV_PATH, type: 'shared' };
  if (fs.existsSync(FALLBACK_ENV_PATH)) return { path: FALLBACK_ENV_PATH, type: 'legacy' };
  return null;
}

// Parse and strip --account <name> from process.argv
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

// Build config from legacy format (IMAP_HOST/IMAP_USER etc.)
function buildConfigFromLegacy(env, prefix) {
  const p = prefix ? `${prefix}_` : '';

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

// Build config from shared format (PROVIDER/USERNAME/PASSWORD)
function buildConfigFromShared(env, prefix) {
  const p = prefix ? `${prefix}_` : '';

  const provider = env[`${p}PROVIDER`];
  if (!provider) return null;

  const username = env[`${p}USERNAME`];
  const password = env[`${p}PASSWORD`];

  if (!username || !password) return null;

  let imapPreset, smtpPreset;

  if (provider === 'custom') {
    const imapHost = env[`${p}IMAP_HOST`];
    if (!imapHost) return null;
    imapPreset = {
      host: imapHost,
      port: parseInt(env[`${p}IMAP_PORT`]) || 993,
      tls: env[`${p}IMAP_TLS`] !== 'false',
      rejectUnauthorized: env[`${p}IMAP_REJECT_UNAUTHORIZED`] !== 'false',
    };
    smtpPreset = {
      host: env[`${p}SMTP_HOST`],
      port: parseInt(env[`${p}SMTP_PORT`]) || 587,
      secure: env[`${p}SMTP_SECURE`] === 'true',
      rejectUnauthorized: env[`${p}SMTP_REJECT_UNAUTHORIZED`] !== 'false',
    };
  } else {
    const preset = PROVIDERS[provider];
    if (!preset || !preset.imap) return null;
    imapPreset = preset.imap;
    smtpPreset = preset.smtp;
  }

  return {
    imap: {
      host: imapPreset.host,
      port: imapPreset.port,
      user: username,
      pass: password,
      tls: imapPreset.tls,
      rejectUnauthorized: env[`${p}IMAP_REJECT_UNAUTHORIZED`] !== undefined
        ? env[`${p}IMAP_REJECT_UNAUTHORIZED`] !== 'false'
        : imapPreset.rejectUnauthorized,
      mailbox: env[`${p}IMAP_MAILBOX`] || 'INBOX',
    },
    smtp: {
      host: smtpPreset.host,
      port: smtpPreset.port,
      user: username,
      pass: password,
      secure: smtpPreset.secure,
      from: username,
      rejectUnauthorized: env[`${p}SMTP_REJECT_UNAUTHORIZED`] !== undefined
        ? env[`${p}SMTP_REJECT_UNAUTHORIZED`] !== 'false'
        : smtpPreset.rejectUnauthorized,
    },
    allowedReadDirs: (env.ALLOWED_READ_DIRS || '~/Downloads,~/Documents').split(',').map(d => d.trim()).filter(Boolean),
    allowedWriteDirs: (env.ALLOWED_WRITE_DIRS || '~/Downloads').split(',').map(d => d.trim()).filter(Boolean),
  };
}

// List all configured accounts from all config sources
function listAccounts() {
  const allAccounts = [];
  const seen = new Set();
  let primaryConfigPath = null;

  // 1. Legacy config
  if (fs.existsSync(LEGACY_ENV_PATH)) {
    primaryConfigPath = LEGACY_ENV_PATH;
    const env = dotenv.config({ path: LEGACY_ENV_PATH }).parsed || {};
    const accounts = scanLegacyAccounts(env);
    for (const a of accounts) seen.add(a.name);
    allAccounts.push(...accounts);
  }

  // 2. Shared config
  if (fs.existsSync(SHARED_ENV_PATH)) {
    if (!primaryConfigPath) primaryConfigPath = SHARED_ENV_PATH;
    const env = dotenv.config({ path: SHARED_ENV_PATH }).parsed || {};
    const accounts = scanSharedAccounts(env);
    for (const a of accounts) {
      if (!seen.has(a.name)) {
        allAccounts.push(a);
        seen.add(a.name);
      }
    }
  }

  // 3. Fallback
  if (fs.existsSync(FALLBACK_ENV_PATH) && !primaryConfigPath) {
    primaryConfigPath = FALLBACK_ENV_PATH;
    const env = dotenv.config({ path: FALLBACK_ENV_PATH }).parsed || {};
    const accounts = scanLegacyAccounts(env);
    for (const a of accounts) {
      if (!seen.has(a.name)) {
        allAccounts.push(a);
        seen.add(a.name);
      }
    }
  }

  return { accounts: allAccounts, configPath: primaryConfigPath };
}

function scanLegacyAccounts(env) {
  const accounts = [];
  const seen = new Set();

  if (env.IMAP_HOST) {
    accounts.push(createAccountObject(env, '', 'default'));
    seen.add('default');
  }

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

  return accounts;
}

function scanSharedAccounts(env) {
  const accounts = [];
  const seen = new Set();

  if (env.PROVIDER) {
    const preset = PROVIDERS[env.PROVIDER];
    accounts.push({
      name: 'default',
      email: env.USERNAME || '-',
      imapHost: (preset && preset.imap) ? preset.imap.host : (env.IMAP_HOST || '-'),
      smtpHost: (preset && preset.smtp) ? preset.smtp.host : (env.SMTP_HOST || '-'),
      isComplete: env.PROVIDER === 'custom'
        ? !!(env.USERNAME && env.PASSWORD && env.IMAP_HOST && env.SMTP_HOST)
        : !!(env.USERNAME && env.PASSWORD && preset?.imap && preset?.smtp),
    });
    seen.add('default');
  }

  for (const key of Object.keys(env)) {
    const match = key.match(/^([A-Z0-9]+)_PROVIDER$/);
    if (match) {
      const rawPrefix = match[1];
      const name = rawPrefix.toLowerCase();
      if (!seen.has(name)) {
        const p = `${rawPrefix}_`;
        const preset = PROVIDERS[env[`${p}PROVIDER`]];
        accounts.push({
          name,
          email: env[`${p}USERNAME`] || '-',
          imapHost: (preset && preset.imap) ? preset.imap.host : (env[`${p}IMAP_HOST`] || '-'),
          smtpHost: (preset && preset.smtp) ? preset.smtp.host : (env[`${p}SMTP_HOST`] || '-'),
          isComplete: env[`${p}PROVIDER`] === 'custom'
            ? !!(env[`${p}USERNAME`] && env[`${p}PASSWORD`] && env[`${p}IMAP_HOST`] && env[`${p}SMTP_HOST`])
            : !!(env[`${p}USERNAME`] && env[`${p}PASSWORD`] && preset?.imap && preset?.smtp),
        });
        seen.add(name);
      }
    }
  }

  return accounts;
}

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

function isAccountComplete(env, prefix) {
  const p = prefix;
  return !!(
    env[`${p}IMAP_HOST`] &&
    env[`${p}IMAP_USER`] &&
    env[`${p}IMAP_PASS`] &&
    env[`${p}SMTP_HOST`]
  );
}

// --- Module initialization ---
const envInfo = findEnvPath();

const { accountName, remainingArgs } = parseAccountFromArgv(process.argv);
const prefix = accountName ? accountName.toUpperCase() : null;

process.argv = [process.argv[0], process.argv[1], ...remainingArgs];

let config;
if (envInfo) {
  const parsed = dotenv.config({ path: envInfo.path }).parsed || {};
  if (envInfo.type === 'shared') {
    config = buildConfigFromShared(parsed, prefix);
  } else {
    config = buildConfigFromLegacy(parsed, prefix);
  }
}

if (!config) {
  if (accountName) {
    console.error(`Error: Account "${accountName}" not found. Check ~/.config/imap-smtp-email/.env or ~/.config/mail-skills/.env`);
  } else {
    console.error('Error: No email configuration found. Run "bash setup.sh" to configure.');
  }
  process.exit(1);
}

module.exports = config;
module.exports.listAccounts = listAccounts;
