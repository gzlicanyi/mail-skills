#!/usr/bin/env node

const { createDAVClient } = require('tsdav');
const config = require('./config');
const { parseEvent, generateEvent, parseTodo, generateTodo } = require('./ical');

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  const options = {};
  const positional = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      options[key] = value || true;
      if (value && !value.startsWith('--')) i++;
    } else {
      positional.push(arg);
    }
  }

  return { command, options, positional };
}

async function createClient() {
  if (!config.serverUrl || !config.username || !config.password) {
    throw new Error('Missing CalDAV configuration. Run "bash setup.sh" to configure.');
  }

  const client = await createDAVClient({
    serverUrl: config.serverUrl,
    credentials: {
      username: config.username,
      password: config.password,
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });

  return client;
}

async function listCalendars() {
  const client = await createClient();
  const calendars = await client.fetchCalendars();

  return {
    calendars: calendars.map((cal) => ({
      id: cal.url,
      displayName: cal.displayName || '',
      color: cal.calendarColor || '',
      components: cal.supportedCalendarComponentSet || ['VEVENT'],
    })),
  };
}

function displayAccounts(accounts, configPath) {
  if (!configPath) {
    console.error('No configuration file found.');
    console.error('Run "bash setup.sh" to configure your CalDAV account.');
    process.exit(1);
  }

  if (accounts.length === 0) {
    console.error(`No accounts configured in ${configPath}`);
    process.exit(0);
  }

  console.log(`Configured accounts (from ${configPath}):\n`);

  const maxNameLen = Math.max(7, ...accounts.map((a) => a.name.length));
  const maxUrlLen = Math.max(10, ...accounts.map((a) => a.serverUrl.length));
  const maxUserLen = Math.max(8, ...accounts.map((a) => a.username.length));

  const header = `  ${padRight('Account', maxNameLen)}  ${padRight('Server', maxUrlLen)}  ${padRight('Username', maxUserLen)}  Status`;
  console.log(header);

  const separator =
    '  ' + '-'.repeat(maxNameLen) + '  ' + '-'.repeat(maxUrlLen) + '  ' + '-'.repeat(maxUserLen) + '  ' + '-'.repeat(16);
  console.log(separator);

  for (const account of accounts) {
    const statusIcon = account.isComplete ? 'OK' : '!!';
    const statusText = account.isComplete ? 'Complete' : 'Incomplete';
    const row = `  ${padRight(account.name, maxNameLen)}  ${padRight(account.serverUrl, maxUrlLen)}  ${padRight(account.username, maxUserLen)}  ${statusIcon} ${statusText}`;
    console.log(row);
  }

  console.log(`\n  ${accounts.length} account${accounts.length > 1 ? 's' : ''} total`);
}

function padRight(str, len) {
  return (str + ' '.repeat(len)).slice(0, len);
}

async function main() {
  const { command, options, positional } = parseArgs();

  try {
    let result;

    switch (command) {
      case 'list-calendars':
        result = await listCalendars();
        break;

      case 'list-accounts': {
        const { listAccounts } = require('./config');
        const { accounts, configPath } = listAccounts();
        displayAccounts(accounts, configPath);
        return;
      }

      default:
        console.error('Unknown command:', command);
        console.error('Available commands: list-calendars, list-events, get-event, create-event, update-event, delete-event, list-todos, create-todo, update-todo, delete-todo, freebusy, list-accounts');
        process.exit(1);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

main();
