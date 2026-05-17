#!/usr/bin/env node

const { createDAVClient, DAVClient, fetchCalendars } = require('tsdav');
const { randomUUID } = require('crypto');
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

  const clientParams = {
    serverUrl: config.serverUrl,
    credentials: {
      username: config.username,
      password: config.password,
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  };

  // If principalUrl/homeUrl provided in config, use direct DAVClient with manual account
  const principalUrl = config.principalUrl || inferPrincipalUrl(config.serverUrl, config.username);
  const homeUrl = config.homeUrl || inferHomeUrl(config.serverUrl, config.username);

  if (principalUrl && homeUrl) {
    const client = new DAVClient(clientParams);
    // Skip login() — set auth headers and account directly for non-standard servers
    client.authHeaders = getBasicAuthHeaders(clientParams.credentials);
    client.account = {
      serverUrl: config.serverUrl,
      credentials: clientParams.credentials,
      accountType: 'caldav',
      principalUrl,
      homeUrl,
      rootUrl: homeUrl,
      calendarHomeUrl: homeUrl,
      calendars: [],
    };
    return client;
  }

  return await createDAVClient(clientParams);
}

function getBasicAuthHeaders(credentials) {
  const encoded = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

function inferPrincipalUrl(serverUrl, username) {
  const url = new URL(serverUrl);
  // NetEase pattern: caldav.163.com -> /caldav/dav/<user>/user/
  if (url.hostname === 'caldav.163.com' || url.hostname === 'caldav.qiye.163.com' || url.hostname === 'caldavhz.qiye.163.com') {
    return `${url.origin}/caldav/dav/${username}/user/`;
  }
  return null;
}

function inferHomeUrl(serverUrl, username) {
  const url = new URL(serverUrl);
  if (url.hostname === 'caldav.163.com' || url.hostname === 'caldav.qiye.163.com' || url.hostname === 'caldavhz.qiye.163.com') {
    return `${url.origin}/caldav/dav/${username}/calendar/`;
  }
  return null;
}

function needsNativeFetch() {
  return !!(inferPrincipalUrl(config.serverUrl, config.username));
}

function authHeaders() {
  const encoded = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  return { Authorization: `Basic ${encoded}`, 'Content-Type': 'text/calendar; charset=utf-8' };
}

async function davPut(url, body, etag) {
  const headers = authHeaders();
  if (etag) headers['If-Match'] = etag;
  const resp = await fetch(url, {
    method: 'PUT',
    headers,
    body,
  });
  if (!resp.ok) throw new Error(`PUT ${url} failed: ${resp.status} ${resp.statusText}`);
  return resp.headers.get('etag');
}

async function davDelete(url) {
  const resp = await fetch(url, { method: 'DELETE', headers: authHeaders() });
  if (!resp.ok && resp.status !== 404) throw new Error(`DELETE ${url} failed: ${resp.status} ${resp.statusText}`);
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

  const uid = randomUUID();
  const eventObj = {
    uid,
    summary: options.summary,
    start: options.start,
    end: options.end,
    description: options.description || '',
    location: options.location || '',
  };

  const iCalString = generateEvent(eventObj);
  const filename = `${uid}.ics`;
  const url = new URL(filename, calendar.url).href;

  if (needsNativeFetch()) {
    await davPut(url, iCalString);
  } else {
    await client.createCalendarObject({ calendar, iCalString, filename });
  }

  return { success: true, uid, url };
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

  if (needsNativeFetch()) {
    await davPut(found.url, iCalString, found.etag);
  } else {
    found.data = iCalString;
    await client.updateCalendarObject({ calendarObject: found });
  }

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

  if (needsNativeFetch()) {
    await davDelete(found.url);
  } else {
    await client.deleteCalendarObject({ calendarObject: found });
  }

  return { success: true, uid: options.uid };
}

async function listTodos(options) {
  const client = await createClient();
  const calendars = await client.fetchCalendars();
  const targetCalendars = options.calendar
    ? calendars.filter((c) => c.url === options.calendar || c.displayName === options.calendar)
    : calendars;

  const allTodos = [];
  const statusFilter = options.status || 'all';

  for (const calendar of targetCalendars) {
    let objects;
    if (needsNativeFetch()) {
      objects = await fetchObjectsViaPropfind(calendar.url);
    } else {
      objects = await client.fetchCalendarObjects({ calendar });
    }

    for (const obj of objects) {
      const todo = parseTodo(obj.data, calendar.displayName);
      if (!todo) continue;

      if (statusFilter === 'pending' && todo.status !== 'pending') continue;
      if (statusFilter === 'completed' && todo.status !== 'completed') continue;

      allTodos.push(todo);
    }
  }

  return { todos: allTodos };
}

async function fetchObjectsViaPropfind(calendarUrl) {
  const resp = await fetch(calendarUrl, {
    method: 'PROPFIND',
    headers: {
      ...authHeaders(),
      Depth: '1',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><prop><C:calendar-data/><D:getetag xmlns:D="DAV:"/></prop></propfind>',
  });
  if (!resp.ok && resp.status !== 207) return [];

  const text = await resp.text();
  const results = [];

  // Split by <response> blocks to correctly associate href/data/etag
  const responseBlocks = text.split(/<\/[^>]*response>/i);
  for (const block of responseBlocks) {
    const hrefMatch = block.match(/<[^>]*href[^>]*>(.*?)<\/[^>]*href>/i);
    const dataMatch = block.match(/<[^>]*calendar-data[^>]*><!\[CDATA\[(.*?)\]\]><\/[^>]*calendar-data>/is);
    const etagMatch = block.match(/<[^>]*getetag[^>]*>(.*?)<\/[^>]*getetag>/i);

    if (!dataMatch) continue;

    const href = hrefMatch ? hrefMatch[1] : '';
    const fullUrl = href.startsWith('http') ? href : new URL(href, calendarUrl).href;
    results.push({
      url: fullUrl,
      data: dataMatch[1],
      etag: etagMatch ? etagMatch[1] : null,
    });
  }

  return results;
}

async function createTodo(options) {
  const client = await createClient();
  const calendar = await resolveCalendar(client, options.calendar);

  const uid = randomUUID();
  const todoObj = {
    uid,
    summary: options.summary,
    due: options.due || null,
    description: options.description || '',
    priority: options.priority ? parseInt(options.priority) : 0,
    status: 'pending',
  };

  const iCalString = generateTodo(todoObj);
  const filename = `${uid}.ics`;
  const url = new URL(filename, calendar.url).href;

  if (needsNativeFetch()) {
    await davPut(url, iCalString);
  } else {
    await client.createCalendarObject({ calendar, iCalString, filename });
  }

  return { success: true, uid, url };
}

async function findTodoByUid(calendars, uid) {
  for (const calendar of calendars) {
    let objects;
    if (needsNativeFetch()) {
      objects = await fetchObjectsViaPropfind(calendar.url);
    } else {
      objects = await (await createClient()).fetchCalendarObjects({ calendar });
    }
    for (const obj of objects) {
      const todo = parseTodo(obj.data, calendar.displayName);
      if (todo && todo.uid === uid) {
        return { ...obj, calendarName: calendar.displayName };
      }
    }
  }
  return null;
}

async function updateTodo(options) {
  const client = await createClient();
  const calendars = await client.fetchCalendars();

  const found = await findTodoByUid(calendars, options.uid);
  if (!found) throw new Error(`Todo not found: ${options.uid}`);

  const existing = parseTodo(found.data, found.calendarName);

  const updatedObj = {
    uid: existing.uid,
    summary: options.summary || existing.summary,
    due: options.due || existing.due,
    description: options.description !== undefined ? options.description : existing.description,
    priority: options.priority ? parseInt(options.priority) : existing.priority,
    status: options.status || existing.status,
  };

  const iCalString = generateTodo(updatedObj);

  if (needsNativeFetch()) {
    await davPut(found.url, iCalString, found.etag);
  } else {
    found.data = iCalString;
    await client.updateCalendarObject({ calendarObject: found });
  }

  return { success: true, uid: existing.uid };
}

async function deleteTodo(options) {
  const client = await createClient();
  const calendars = await client.fetchCalendars();

  const found = await findTodoByUid(calendars, options.uid);
  if (!found) throw new Error(`Todo not found: ${options.uid}`);

  if (needsNativeFetch()) {
    await davDelete(found.url);
  } else {
    await client.deleteCalendarObject({ calendarObject: found });
  }

  return { success: true, uid: options.uid };
}

async function freebusy(options) {
  const client = await createClient();
  const calendar = await resolveCalendar(client, options.calendar);

  const result = await client.freeBusyQuery({
    calendar,
    timeRange: {
      start: options.start,
      end: options.end,
    },
  });

  return {
    busy: (result || []).map((period) => ({
      start: period.start,
      end: period.end,
      type: period.type || 'BUSY',
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

      case 'list-todos':
        result = await listTodos(options);
        break;

      case 'create-todo':
        if (!options.summary) {
          throw new Error('Missing required option: --summary <text>');
        }
        result = await createTodo(options);
        break;

      case 'update-todo':
        if (!options.uid) {
          throw new Error('Missing required option: --uid <uid>');
        }
        result = await updateTodo(options);
        break;

      case 'delete-todo':
        if (!options.uid) {
          throw new Error('Missing required option: --uid <uid>');
        }
        result = await deleteTodo(options);
        break;

      case 'freebusy':
        if (!options.start || !options.end) {
          throw new Error('Missing required options: --start <datetime> --end <datetime>');
        }
        result = await freebusy(options);
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
