#!/usr/bin/env node

const ICAL = require('ical.js');

function parseEvent(iCalString, calendarId) {
  const jcal = ICAL.parse(iCalString);
  const vcalendar = new ICAL.Component(jcal);
  const vevent = vcalendar.getFirstSubcomponent('vevent');
  if (!vevent) return null;

  const event = new ICAL.Event(vevent);
  const summary = vevent.getFirstPropertyValue('summary');
  const location = vevent.getFirstPropertyValue('location');
  const description = vevent.getFirstPropertyValue('description');

  return {
    uid: event.uid,
    summary: summary || '',
    start: event.startDate ? event.startDate.toJSDate().toISOString() : null,
    end: event.endDate ? event.endDate.toJSDate().toISOString() : null,
    location: location || '',
    description: description || '',
    recurrence: event.isRecurring(),
    calendar: calendarId || '',
  };
}

function generateEvent(eventObj) {
  const vcalendar = new ICAL.Component(['vcalendar', [], []]);
  vcalendar.updatePropertyWithValue('version', '2.0');
  vcalendar.updatePropertyWithValue('prodid', '-//caldav-sync-skill//EN');

  const vevent = new ICAL.Component('vevent');
  vevent.updatePropertyWithValue('uid', eventObj.uid || ICAL.uuid());
  vevent.updatePropertyWithValue('summary', eventObj.summary || '');

  const dtstart = ICAL.Time.fromJSDate(new Date(eventObj.start), true);
  vevent.updatePropertyWithValue('dtstart', dtstart);

  const dtend = ICAL.Time.fromJSDate(new Date(eventObj.end), true);
  vevent.updatePropertyWithValue('dtend', dtend);

  if (eventObj.description) {
    vevent.updatePropertyWithValue('description', eventObj.description);
  }
  if (eventObj.location) {
    vevent.updatePropertyWithValue('location', eventObj.location);
  }

  const dtstamp = ICAL.Time.fromJSDate(new Date(), true);
  vevent.updatePropertyWithValue('dtstamp', dtstamp);

  vcalendar.addSubcomponent(vevent);
  return vcalendar.toString();
}

function parseTodo(iCalString, calendarId) {
  const jcal = ICAL.parse(iCalString);
  const vcalendar = new ICAL.Component(jcal);
  const vtodo = vcalendar.getFirstSubcomponent('vtodo');
  if (!vtodo) return null;

  const uid = vtodo.getFirstPropertyValue('uid');
  const summary = vtodo.getFirstPropertyValue('summary');
  const description = vtodo.getFirstPropertyValue('description');
  const due = vtodo.getFirstPropertyValue('due');
  const status = vtodo.getFirstPropertyValue('status');
  const priority = vtodo.getFirstPropertyValue('priority');

  return {
    uid: uid || '',
    summary: summary || '',
    due: due ? due.toJSDate().toISOString().split('T')[0] : null,
    status: status === 'COMPLETED' ? 'completed' : 'pending',
    priority: priority || 0,
    description: description || '',
    calendar: calendarId || '',
  };
}

function generateTodo(todoObj) {
  const vcalendar = new ICAL.Component(['vcalendar', [], []]);
  vcalendar.updatePropertyWithValue('version', '2.0');
  vcalendar.updatePropertyWithValue('prodid', '-//caldav-sync-skill//EN');

  const vtodo = new ICAL.Component('vtodo');
  vtodo.updatePropertyWithValue('uid', todoObj.uid || ICAL.uuid());
  vtodo.updatePropertyWithValue('summary', todoObj.summary || '');

  if (todoObj.due) {
    const due = ICAL.Time.fromJSDate(new Date(todoObj.due), true);
    vtodo.updatePropertyWithValue('due', due);
  }
  if (todoObj.description) {
    vtodo.updatePropertyWithValue('description', todoObj.description);
  }
  if (todoObj.priority) {
    vtodo.updatePropertyWithValue('priority', todoObj.priority);
  }
  if (todoObj.status === 'completed') {
    vtodo.updatePropertyWithValue('status', 'COMPLETED');
  } else {
    vtodo.updatePropertyWithValue('status', 'NEEDS-ACTION');
  }

  const dtstamp = ICAL.Time.fromJSDate(new Date(), true);
  vtodo.updatePropertyWithValue('dtstamp', dtstamp);

  vcalendar.addSubcomponent(vtodo);
  return vcalendar.toString();
}

module.exports = { parseEvent, generateEvent, parseTodo, generateTodo };
