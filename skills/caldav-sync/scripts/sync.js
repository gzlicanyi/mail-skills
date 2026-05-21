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

module.exports = {
  getAuthHeaders,
  davRequest,
  trySyncCollection,
  tryGetCtag,
  detectSyncMode,
};