#!/usr/bin/env node

const path = require('path');
const os = require('os');
const fs = require('fs');
const dotenv = require('dotenv');
const { PROVIDERS } = require('./providers');

const SHARED_ENV_PATH = path.join(os.homedir(), '.config', 'mail-skills', '.env');
const FALLBACK_ENV_PATH = path.resolve(__dirname, '../.env');

function findEnvPath() {
  if (fs.existsSync(SHARED_ENV_PATH)) return { path: SHARED_ENV_PATH, type: 'shared' };
  if (fs.existsSync(FALLBACK_ENV_PATH)) return { path: FALLBACK_ENV_PATH, type: 'legacy' };
  return null;
}

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

function buildConfigFromShared(env, prefix) {
  const p = prefix ? `${prefix}_` : '';

  const provider = env[`${p}PROVIDER`];
  if (!provider) return null;

  const username = env[`${p}USERNAME`];
  const password = env[`${p}PASSWORD`];

  if (!username || !password) return null;

  if (provider === 'custom') {
    const serverUrl = env[`${p}CALDAV_SERVER_URL`];
    if (!serverUrl) return null;
    return {
      serverUrl,
      username,
      password,
      defaultCalendar: env[`${p}CALDAV_DEFAULT_CALENDAR`] || '',
      principalUrl: env[`${p}CALDAV_PRINCIPAL_URL`] || '',
      homeUrl: env[`${p}CALDAV_HOME_URL`] || '',
    };
  }

  const preset = PROVIDERS[provider];
  if (!preset) {
    console.error(`Error: Unknown provider "${provider}". Available: ${Object.keys(PROVIDERS).join(', ')}, custom`);
    process.exit(1);
  }
  if (!preset.caldav) {
    console.error(`Error: Provider "${provider}" does not support CalDAV.`);
    process.exit(1);
  }

  return {
    serverUrl: preset.caldav,
    username,
    password,
    defaultCalendar: env[`${p}CALDAV_DEFAULT_CALENDAR`] || '',
    principalUrl: '',
    homeUrl: '',
  };
}

function buildConfigFromLegacy(env, prefix) {
  const p = prefix ? `${prefix}_` : '';

  if (prefix && !env[`${p}CALDAV_SERVER_URL`]) {
    console.error(`Error: Account "${prefix.toLowerCase()}" not found in config.`);
    process.exit(1);
  }

  if (!env[`${p}CALDAV_SERVER_URL`]) return null;

  return {
    serverUrl: env[`${p}CALDAV_SERVER_URL`],
    username: env[`${p}CALDAV_USERNAME`],
    password: env[`${p}CALDAV_PASSWORD`],
    defaultCalendar: env[`${p}CALDAV_DEFAULT_CALENDAR`] || '',
    principalUrl: env[`${p}CALDAV_PRINCIPAL_URL`] || '',
    homeUrl: env[`${p}CALDAV_HOME_URL`] || '',
  };
}

function listAccounts() {
  const allAccounts = [];
  const seen = new Set();
  let primaryConfigPath = null;

  if (fs.existsSync(SHARED_ENV_PATH)) {
    primaryConfigPath = SHARED_ENV_PATH;
    const env = dotenv.config({ path: SHARED_ENV_PATH }).parsed || {};
    const accounts = scanSharedAccounts(env);
    for (const a of accounts) seen.add(a.name);
    allAccounts.push(...accounts);
  }

  if (fs.existsSync(FALLBACK_ENV_PATH)) {
    if (!primaryConfigPath) primaryConfigPath = FALLBACK_ENV_PATH;
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

function scanSharedAccounts(env) {
  const accounts = [];
  const seen = new Set();

  if (env.PROVIDER) {
    const preset = PROVIDERS[env.PROVIDER];
    accounts.push({
      name: 'default',
      serverUrl: (preset && preset.caldav) || env.CALDAV_SERVER_URL || '-',
      username: env.USERNAME || '-',
      isComplete: !!(env.USERNAME && env.PASSWORD && (preset?.caldav || env.CALDAV_SERVER_URL)),
    });
    seen.add('default');
  }

  for (const key of Object.keys(env)) {
    const match = key.match(/^([A-Z0-9]+)_PROVIDER$/);
    if (match) {
      const prefix = match[1];
      const name = prefix.toLowerCase();
      if (!seen.has(name)) {
        const preset = PROVIDERS[env[`${prefix}_PROVIDER`]];
        accounts.push({
          name,
          serverUrl: (preset && preset.caldav) || env[`${prefix}_CALDAV_SERVER_URL`] || '-',
          username: env[`${prefix}_USERNAME`] || '-',
          isComplete: !!(env[`${prefix}_USERNAME`] && env[`${prefix}_PASSWORD`] && (preset?.caldav || env[`${prefix}_CALDAV_SERVER_URL`])),
        });
        seen.add(name);
      }
    }
  }

  return accounts;
}

function scanLegacyAccounts(env) {
  const accounts = [];
  const seen = new Set();

  if (env.CALDAV_SERVER_URL) {
    accounts.push({
      name: 'default',
      serverUrl: env.CALDAV_SERVER_URL,
      username: env.CALDAV_USERNAME || '-',
      isComplete: !!(env.CALDAV_SERVER_URL && env.CALDAV_USERNAME && env.CALDAV_PASSWORD),
    });
    seen.add('default');
  }

  for (const key of Object.keys(env)) {
    const match = key.match(/^([A-Z0-9]+)_CALDAV_SERVER_URL$/);
    if (match) {
      const prefix = match[1];
      const name = prefix.toLowerCase();
      if (!seen.has(name)) {
        accounts.push({
          name,
          serverUrl: env[`${prefix}_CALDAV_SERVER_URL`],
          username: env[`${prefix}_CALDAV_USERNAME`] || '-',
          isComplete: !!(env[`${prefix}_CALDAV_SERVER_URL`] && env[`${prefix}_CALDAV_USERNAME`] && env[`${prefix}_CALDAV_PASSWORD`]),
        });
        seen.add(name);
      }
    }
  }

  return accounts;
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
    console.error(`Error: Account "${accountName}" not found. Check ~/.config/mail-skills/.env`);
  } else {
    console.error('Error: No CalDAV configuration found. Run "bash setup.sh" to configure.');
  }
  process.exit(1);
}

config._accountName = accountName;

module.exports = config;
module.exports.listAccounts = listAccounts;
