#!/usr/bin/env node

const { loadSyncState, saveSyncState, loadObjects, saveObjects, clearCache, getCalendarUid } = require('./cache');
const { parseEvent, parseTodo } = require('./ical');
const config = require('./config');

function getAuthHeaders() {
  const encoded = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  return { Authorization: `Basic ${encoded}`, 'Content-Type': 'application/xml; charset=utf-8' };
}

async function davRequest(url, method, body) {
  const headers = getAuthHeaders();
  const resp = await fetch(url, { method, headers, body });
  return resp;
}

async function trySyncCollection(calendarUrl) {
  const body = `<?xml version="1.0" encoding="utf-8" ?>
<sync-collection xmlns="urn:ietf:params:xml:ns:caldav">
  <sync-token/>
  <sync-level>1</sync-level>
  <prop>
    <getetag/>
  </prop>
</sync-collection>`;

  try {
    const resp = await davRequest(calendarUrl, 'REPORT', body);
    if (resp.ok) {
      const text = await resp.text();
      const tokenMatch = text.match(/<[^>]*sync-token[^>]*>(.*?)<\/[^>]*sync-token>/);
      if (tokenMatch) {
        return { supported: true, token: tokenMatch[1] };
      }
    }
    return { supported: false };
  } catch {
    return { supported: false };
  }
}

async function tryGetCtag(calendarUrl) {
  const body = `<?xml version="1.0" encoding="utf-8" ?>
<propfind xmlns="DAV:">
  <prop>
    <getctag xmlns="http://calendarserver.org/ns/"/>
  </prop>
</propfind>`;

  try {
    const resp = await davRequest(calendarUrl, 'PROPFIND', body);
    if (resp.ok) {
      const text = await resp.text();
      const ctagMatch = text.match(/<[^>]*getctag[^>]*>(.*?)<\/[^>]*getctag>/);
      if (ctagMatch) {
        return { supported: true, ctag: ctagMatch[1] };
      }
    }
    return { supported: false };
  } catch {
    return { supported: false };
  }
}

async function detectSyncMode(calendar) {
  const result = await trySyncCollection(calendar.url);
  if (result.supported) {
    return { mode: 'sync-token', syncToken: result.token };
  }

  const ctagResult = await tryGetCtag(calendar.url);
  if (ctagResult.supported) {
    return { mode: 'ctag', ctag: ctagResult.ctag };
  }

  return { mode: 'full' };
}

async function fetchAllEtags(calendarUrl) {
  // PROPFIND Depth:1 to get all resources with their etags
  const body = `<?xml version="1.0" encoding="utf-8" ?>
<propfind xmlns="DAV:">
  <prop>
    <getetag/>
  </prop>
</propfind>`;

  const resp = await davRequest(calendarUrl, 'PROPFIND', body);
  if (!resp.ok && resp.status !== 207) {
    throw new Error(`PROPFIND etags failed: ${resp.status}`);
  }

  const text = await resp.text();
  const etags = {};
  const blocks = text.split(/<\/[^>]*response>/i);
  for (const block of blocks) {
    const hrefMatch = block.match(/<[^>]*href[^>]*>(.*?)<\/[^>]*href>/i);
    const etagMatch = block.match(/<[^>]*getetag[^>]*>(.*?)<\/[^>]*getetag>/i);
    if (hrefMatch && etagMatch) {
      const href = hrefMatch[1];
      const fullUrl = href.startsWith('http') ? href : new URL(href, calendarUrl).href;
      etags[fullUrl] = etagMatch[1];
    }
  }
  return etags;
}

async function fetchObjectsByUrls(calendarUrl, urls) {
  // Use calendar-multiget REPORT to fetch specific resources
  if (urls.length === 0) return [];

  const hrefTags = urls.map(u => `    <href>${u}</href>`).join('\n');
  const body = `<?xml version="1.0" encoding="utf-8" ?>
<calendar-multiget xmlns="urn:ietf:params:xml:ns:caldav" xmlns:D="DAV:">
  <prop>
    <D:getetag/>
    <calendar-data/>
  </prop>
  ${hrefTags}
</calendar-multiget>`;

  const resp = await davRequest(calendarUrl, 'REPORT', body);
  if (!resp.ok && resp.status !== 207) {
    throw new Error(`calendar-multiget failed: ${resp.status}`);
  }

  const text = await resp.text();
  const results = [];
  const blocks = text.split(/<\/[^>]*response>/i);
  for (const block of blocks) {
    const hrefMatch = block.match(/<[^>]*href[^>]*>(.*?)<\/[^>]*href>/i);
    const dataMatch = block.match(/<[^>]*calendar-data[^>]*>([\s\S]*?)<\/[^>]*calendar-data>/);
    const etagMatch = block.match(/<[^>]*getetag[^>]*>(.*?)<\/[^>]*getetag>/i);

    if (hrefMatch && dataMatch) {
      results.push({
        url: hrefMatch[1],
        data: dataMatch[1],
        etag: etagMatch ? etagMatch[1] : null,
      });
    }
  }
  return results;
}

async function doCtagEtagSync(client, calendar, account) {
  const calendarUid = getCalendarUid(calendar);
  const state = loadSyncState(account, calendarUid);
  const objects = loadObjects(account, calendarUid) || { events: {}, todos: {} };

  // Get current ctag
  const ctagResult = await tryGetCtag(calendar.url);
  if (!ctagResult.supported) {
    // Lost ctag support, re-detect
    return doFullSync(client, calendar, account);
  }

  if (state && state.ctag === ctagResult.ctag) {
    // No changes
    state.lastSync = new Date().toISOString();
    saveSyncState(account, calendarUid, state);
    return objects;
  }

  // Get all etags from server
  const serverEtags = await fetchAllEtags(calendar.url);
  const localEtags = (state && state.etags) || {};

  // Find changed and deleted resources
  const changedUrls = [];
  for (const [url, etag] of Object.entries(serverEtags)) {
    if (localEtags[url] !== etag) {
      changedUrls.push(url);
    }
  }

  const deletedUrls = Object.keys(localEtags).filter(u => !serverEtags[u]);

  // Fetch changed objects
  if (changedUrls.length > 0) {
    const fetched = await fetchObjectsByUrls(calendar.url, changedUrls);
    for (const obj of fetched) {
      const event = parseEvent(obj.data, calendar.displayName);
      if (event) {
        objects.events[event.uid] = event;
        continue;
      }
      const todo = parseTodo(obj.data, calendar.displayName);
      if (todo) {
        objects.todos[todo.uid] = todo;
      }
    }
  }

  // Remove deleted objects
  for (const url of deletedUrls) {
    for (const uid of Object.keys(objects.events)) {
      if (url.includes(uid)) {
        delete objects.events[uid];
      }
    }
    for (const uid of Object.keys(objects.todos)) {
      if (url.includes(uid)) {
        delete objects.todos[uid];
      }
    }
  }

  // Update state
  const newState = {
    mode: 'ctag',
    ctag: ctagResult.ctag,
    etags: serverEtags,
    lastSync: new Date().toISOString(),
  };
  saveSyncState(account, calendarUid, newState);
  saveObjects(account, calendarUid, objects);

  return objects;
}

async function doSyncTokenSync(client, calendar, account) {
  const calendarUid = getCalendarUid(calendar);
  const state = loadSyncState(account, calendarUid);
  const objects = loadObjects(account, calendarUid) || { events: {}, todos: {} };

  const body = `<?xml version="1.0" encoding="utf-8" ?>
<sync-collection xmlns="urn:ietf:params:xml:ns:caldav">
  <sync-token>${state.syncToken}</sync-token>
  <sync-level>1</sync-level>
  <prop>
    <getetag/>
    <calendar-data/>
  </prop>
</sync-collection>`;

  const resp = await davRequest(calendar.url, 'REPORT', body);

  if (resp.status === 410) {
    // Token expired, re-sync from scratch
    clearCache(account, calendarUid);
    return doFullSync(client, calendar, account);
  }

  if (!resp.ok) {
    // Fallback to ctag mode
    const newState = { ...state, mode: 'ctag', ctag: null, etags: {} };
    saveSyncState(account, calendarUid, newState);
    return doCtagEtagSync(client, calendar, account);
  }

  const text = await resp.text();

  // Parse new sync token
  const tokenMatch = text.match(/<[^>]*sync-token[^>]*>(.*?)<\/[^>]*sync-token>/);
  const newToken = tokenMatch ? tokenMatch[1] : state.syncToken;

  // Parse response blocks
  const blocks = text.split(/<\/[^>]*response>/i);
  for (const block of blocks) {
    const hrefMatch = block.match(/<[^>]*href[^>]*>(.*?)<\/[^>]*href>/i);
    const dataMatch = block.match(/<[^>]*calendar-data[^>]*>([\s\S]*?)<\/[^>]*calendar-data>/);

    if (!hrefMatch) continue;

    const href = hrefMatch[1];

    if (dataMatch) {
      // New or modified resource
      const data = dataMatch[1];
      const event = parseEvent(data, calendar.displayName);
      if (event) {
        objects.events[event.uid] = event;
        continue;
      }
      const todo = parseTodo(data, calendar.displayName);
      if (todo) {
        objects.todos[todo.uid] = todo;
      }
    } else {
      // Deleted resource — no calendar-data means removal
      for (const uid of Object.keys(objects.events)) {
        if (href.includes(uid)) delete objects.events[uid];
      }
      for (const uid of Object.keys(objects.todos)) {
        if (href.includes(uid)) delete objects.todos[uid];
      }
    }
  }

  // Update state
  const updatedState = {
    ...state,
    mode: 'sync-token',
    syncToken: newToken,
    lastSync: new Date().toISOString(),
  };
  saveSyncState(account, calendarUid, updatedState);
  saveObjects(account, calendarUid, objects);

  return objects;
}

async function doFullSync(client, calendar, account) {
  const calendarUid = getCalendarUid(calendar);

  const objects = await client.fetchCalendarObjects({ calendar });

  const cachedObjects = { events: {}, todos: {} };
  const etags = {};

  for (const obj of objects) {
    const event = parseEvent(obj.data, calendar.displayName);
    if (event) {
      cachedObjects.events[event.uid] = event;
      if (obj.url) etags[obj.url] = obj.etag;
      continue;
    }
    const todo = parseTodo(obj.data, calendar.displayName);
    if (todo) {
      cachedObjects.todos[todo.uid] = todo;
      if (obj.url) etags[obj.url] = obj.etag;
    }
  }

  // Detect sync mode for future syncs
  const modeInfo = await detectSyncMode(calendar);

  const state = {
    mode: modeInfo.mode,
    syncToken: modeInfo.syncToken || '',
    ctag: modeInfo.ctag || '',
    etags,
    lastSync: new Date().toISOString(),
  };

  saveSyncState(account, calendarUid, state);
  saveObjects(account, calendarUid, cachedObjects);

  return cachedObjects;
}

async function syncCalendarObjects(client, calendar, account, forceRefresh) {
  const calendarUid = getCalendarUid(calendar);

  if (forceRefresh) {
    clearCache(account, calendarUid);
  }

  const state = loadSyncState(account, calendarUid);

  if (!state) {
    return doFullSync(client, calendar, account);
  }

  switch (state.mode) {
    case 'sync-token':
      return doSyncTokenSync(client, calendar, account);
    case 'ctag':
      return doCtagEtagSync(client, calendar, account);
    default:
      return doFullSync(client, calendar, account);
  }
}

module.exports = {
  getAuthHeaders,
  davRequest,
  trySyncCollection,
  tryGetCtag,
  detectSyncMode,
  fetchAllEtags,
  fetchObjectsByUrls,
  doCtagEtagSync,
  doSyncTokenSync,
  doFullSync,
  syncCalendarObjects,
};