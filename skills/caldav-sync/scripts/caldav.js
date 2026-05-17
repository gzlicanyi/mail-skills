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

async function resolveCalendar(client, calendarId) {
  if (calendarId) {
    const calendars = await client.fetchCalendars();
    const found = calendars.find((c) => c.url === calendarId || c.displayName === calendarId);
    if (!found) throw new Error(`Calendar not found: ${calendarId}`);
    return found;
  }

  const calendars = await client.fetchCalendars();
  if (config.defaultCalendar) {
    const found = calendars.find(
      (c) => c.url === config.defaultCalendar || c.displayName === config.defaultCalendar
    );
    if (found) return found;
  }
  return calendars[0];
}

async function listEvents(options) {
  const client = await createClient();
  const calendar = await resolveCalendar(client, options.calendar);

  const timeRange = {
    start: options.start,
    end: options.end,
  };

  const objects = await client.fetchCalendarObjects({
    calendar,
    timeRange,
  });

  return {
    events: objects
      .map((obj) => parseEvent(obj.data, calendar.displayName))
      .filter(Boolean),
  };
}

async function getEvent(options) {
  const client = await createClient();
  const calendar = await resolveCalendar(client, options.calendar);

  const objects = await client.fetchCalendarObjects({ calendar });

  const found = objects.find((obj) => {
    const event = parseEvent(obj.data, calendar.displayName);
    return event && event.uid === options.uid;
  });

  if (!found) throw new Error(`Event not found: ${options.uid}`);

  return { event: parseEvent(found.data, calendar.displayName) };
}

async function createEvent(options) {
  const client = await createClient();
  const calendar = await resolveCalendar(client, options.calendar);

  const eventObj = {
    summary: options.summary,
    start: options.start,
    end: options.end,
    description: options.description || '',
    location: options.location || '',
  };

  const iCalString = generateEvent(eventObj);

  const result = await client.createCalendarObject({
    calendar,
    iCalString,
    filename: `${eventObj.uid || Date.now()}.ics`,
  });

  return { success: true, uid: eventObj.uid, url: result?.url };
}

async function updateEvent(options) {
  const client = await createClient();
  const calendar = await resolveCalendar(client, options.calendar);

  const objects = await client.fetchCalendarObjects({ calendar });

  const found = objects.find((obj) => {
    const event = parseEvent(obj.data, calendar.displayName);
    return event && event.uid === options.uid;
  });

  if (!found) throw new Error(`Event not found: ${options.uid}`);

  const existing = parseEvent(found.data, calendar.displayName);

  const updatedObj = {
    uid: existing.uid,
    summary: options.summary || existing.summary,
    start: options.start || existing.start,
    end: options.end || existing.end,
    description: options.description !== undefined ? options.description : existing.description,
    location: options.location !== undefined ? options.location : existing.location,
  };

  const iCalString = generateEvent(updatedObj);
  found.data = iCalString;

  await client.updateCalendarObject({ calendarObject: found });

  return { success: true, uid: existing.uid };
}

async function deleteEvent(options) {
  const client = await createClient();
  const calendar = await resolveCalendar(client, options.calendar);

  const objects = await client.fetchCalendarObjects({ calendar });

  const found = objects.find((obj) => {
    const event = parseEvent(obj.data, calendar.displayName);
    return event && event.uid === options.uid;
  });

  if (!found) throw new Error(`Event not found: ${options.uid}`);

  await client.deleteCalendarObject({ calendarObject: found });

  return { success: true, uid: options.uid };
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

      case 'list-events':
        if (!options.start || !options.end) {
          throw new Error('Missing required options: --start <date> --end <date>');
        }
        result = await listEvents(options);
        break;

      case 'get-event':
        if (!options.uid) {
          throw new Error('Missing required option: --uid <uid>');
        }
        result = await getEvent(options);
        break;

      case 'create-event':
        if (!options.summary || !options.start || !options.end) {
          throw new Error('Missing required options: --summary <text> --start <datetime> --end <datetime>');
        }
        result = await createEvent(options);
        break;

      case 'update-event':
        if (!options.uid) {
          throw new Error('Missing required option: --uid <uid>');
        }
        result = await updateEvent(options);
        break;

      case 'delete-event':
        if (!options.uid) {
          throw new Error('Missing required option: --uid <uid>');
        }
        result = await deleteEvent(options);
        break;

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
