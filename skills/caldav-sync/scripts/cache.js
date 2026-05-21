#!/usr/bin/env node

const path = require('path');
const os = require('os');
const fs = require('fs');

const CACHE_BASE_DIR = path.join(os.homedir(), '.config', 'mail-skills', 'caldav-cache');

function getCacheDir(account, calendarUid) {
  // Sanitize calendarUid to be filesystem-safe
  const safeId = calendarUid.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(CACHE_BASE_DIR, account || 'default', safeId);
}

function loadSyncState(account, calendarUid) {
  const filePath = path.join(getCacheDir(account, calendarUid), 'sync-state.json');
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function saveSyncState(account, calendarUid, state) {
  const dir = getCacheDir(account, calendarUid);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'sync-state.json');
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, filePath);
}

function loadObjects(account, calendarUid) {
  const filePath = path.join(getCacheDir(account, calendarUid), 'objects.json');
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function saveObjects(account, calendarUid, objects) {
  const dir = getCacheDir(account, calendarUid);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'objects.json');
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(objects, null, 2));
  fs.renameSync(tmpPath, filePath);
}

function clearCache(account, calendarUid) {
  const dir = getCacheDir(account, calendarUid);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore if doesn't exist
  }
}

function getCalendarUid(calendar) {
  // Use the calendar URL as a stable identifier
  return calendar.url || 'unknown';
}

module.exports = {
  getCacheDir,
  loadSyncState,
  saveSyncState,
  loadObjects,
  saveObjects,
  clearCache,
  getCalendarUid,
};