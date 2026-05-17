#!/usr/bin/env node

const path = require('path');
const os = require('os');
const fs = require('fs');
const dotenv = require('dotenv');

const PRIMARY_ENV_PATH = path.join(os.homedir(), '.config', 'caldav-sync', '.env');
const FALLBACK_ENV_PATH = path.resolve(__dirname, '../.env');

function findEnvPath() {
  if (fs.existsSync(PRIMARY_ENV_PATH)) return PRIMARY_ENV_PATH;
  if (fs.existsSync(FALLBACK_ENV_PATH)) return FALLBACK_ENV_PATH;
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

function buildConfig(env, prefix) {
  const p = prefix ? `${prefix}_` : '';

  if (prefix && !env[`${p}CALDAV_SERVER_URL`]) {
    console.error(`Error: Account "${prefix.toLowerCase()}" not found in config. Check ~/.config/caldav-sync/.env`);
    process.exit(1);
  }

  return {
    serverUrl: env[`${p}CALDAV_SERVER_URL`],
    username: env[`${p}CALDAV_USERNAME`],
    password: env[`${p}CALDAV_PASSWORD`],
    defaultCalendar: env[`${p}CALDAV_DEFAULT_CALENDAR`] || '',
  };
}

function listAccounts() {
  const envPath = findEnvPath();
  if (!envPath) {
    return { accounts: [], configPath: null };
  }

  const dotenvResult = dotenv.config({ path: envPath });
  const env = dotenvResult.parsed || {};
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

  return { accounts, configPath: envPath };
}

const envPath = findEnvPath();
if (envPath) {
  dotenv.config({ path: envPath });
}

const { accountName, remainingArgs } = parseAccountFromArgv(process.argv);
const prefix = accountName ? accountName.toUpperCase() : null;

process.argv = [process.argv[0], process.argv[1], ...remainingArgs];

const config = buildConfig(process.env, prefix);

module.exports = config;
module.exports.listAccounts = listAccounts;
