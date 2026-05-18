---
name: caldav-sync
description: Calendar and task management via CalDAV protocol. Query, create, edit, and delete calendar events and todos. Free/busy query, multi-account support.
metadata:
  openclaw:
    emoji: "📅"
    requires:
      bins:
        - node
        - npm
      env:
        - CALDAV_SERVER_URL
        - CALDAV_USERNAME
        - CALDAV_PASSWORD
    primaryEnv: CALDAV_SERVER_URL
---

# CalDAV Sync Tool

Manage calendar events and todos via CalDAV protocol. Supports Google Calendar, iCloud, Nextcloud, Fastmail, NetEase (163/126/yeah.net), and any standard CalDAV server.

## Configuration

Run the setup script to install dependencies and configure your CalDAV account:

```bash
bash setup.sh
```

If running commands manually without setup.sh, install dependencies first:

```bash
npm install --production
```

Configuration is stored at `~/.config/mail-skills/.env` (shared with imap-smtp-email skill). If no shared config is found, the skill falls back to a `.env` file in the skill directory.

### Config file format

```bash
# Default account
PROVIDER=163
USERNAME=your@163.com
PASSWORD=your_password
CALDAV_DEFAULT_CALENDAR=
```

The `PROVIDER` preset auto-fills the CalDAV server URL. For custom servers:

```bash
PROVIDER=custom
USERNAME=your@email.com
PASSWORD=your_password
CALDAV_SERVER_URL=https://your-caldav-server.com/
```

## Multi-Account

You can configure additional accounts in the same config file. Each account uses a name prefix (uppercase) on all variables.

```bash
# Work account (WORK_ prefix)
WORK_PROVIDER=gmail
WORK_USERNAME=me@company.com
WORK_PASSWORD=app_password
WORK_CALDAV_DEFAULT_CALENDAR=work
```

Add `--account <name>` before the command:

```bash
node scripts/caldav.js --account work list-calendars
node scripts/caldav.js --account work list-events --start 2026-01-01 --end 2026-12-31
```

## Supported Providers

| Provider | Server URL | Auth |
|----------|-----------|------|
| Google Calendar | `https://calendar.google.com/calendar/dav/` | App Password |
| iCloud | `https://caldav.icloud.com/` | App-Specific Password |
| Nextcloud | `https://<host>/remote.php/dav/calendars/<user>/` | Username/Password |
| Fastmail | `https://caldav.fastmail.com/dav/` | Username/Password |
| NetEase (163/126/yeah.net) | `https://caldav.163.com/` | Authorization Code |
| NetEase Enterprise (North) | `https://caldav.qiye.163.com/` | Username/Password |
| NetEase Enterprise (East) | `https://caldavhz.qiye.163.com/` | Username/Password |

## Commands

### list-calendars

List all available calendars.

```bash
node scripts/caldav.js [--account <name>] list-calendars
```

### list-events

Query events in a time range.

```bash
node scripts/caldav.js [--account <name>] list-events --start <date> --end <date> [--calendar <id>]
```

### get-event

Get a specific event by UID.

```bash
node scripts/caldav.js [--account <name>] get-event --uid <uid> [--calendar <id>]
```

### create-event

Create a new calendar event.

```bash
node scripts/caldav.js [--account <name>] create-event --summary <text> --start <datetime> --end <datetime> \
  [--description <text>] [--location <text>] [--calendar <id>]
```

### update-event

Update an existing event.

```bash
node scripts/caldav.js [--account <name>] update-event --uid <uid> [--summary <text>] [--start <datetime>] \
  [--end <datetime>] [--description <text>] [--location <text>] [--calendar <id>]
```

### delete-event

Delete an event.

```bash
node scripts/caldav.js [--account <name>] delete-event --uid <uid> [--calendar <id>]
```

### list-todos

List all todos/tasks.

```bash
node scripts/caldav.js [--account <name>] list-todos [--status <all|pending|completed>] [--calendar <id>]
```

### create-todo

Create a new todo/task.

```bash
node scripts/caldav.js [--account <name>] create-todo --summary <text> [--due <date>] \
  [--description <text>] [--priority <1-9>] [--calendar <id>]
```

### update-todo

Update an existing todo.

```bash
node scripts/caldav.js [--account <name>] update-todo --uid <uid> [--summary <text>] [--due <date>] \
  [--status <pending|completed>] [--calendar <id>]
```

### delete-todo

Delete a todo.

```bash
node scripts/caldav.js [--account <name>] delete-todo --uid <uid> [--calendar <id>]
```

### freebusy

Query free/busy information for a time range.

```bash
node scripts/caldav.js [--account <name>] freebusy --start <datetime> --end <datetime> [--calendar <id>]
```

### list-accounts

List all configured CalDAV accounts.

```bash
node scripts/caldav.js list-accounts
```

## Security Notes

- Configuration is stored at `~/.config/mail-skills/.env` with `600` permissions (owner read/write only)
- For Google: regular password is rejected -- generate an App Password at https://myaccount.google.com/apppasswords
- For NetEase: use authorization code (授权码), not account password

## Troubleshooting

**Connection failed:**
- Verify server URL is correct and accessible
- Check username and password

**Authentication failed:**
- For Google: use App Password, not regular password
- For NetEase: use authorization code, not account password
- For iCloud: use App-Specific Password

**No calendars found:**
- Verify CalDAV service is enabled in your account settings
- Check the server URL includes the correct path

## Related Skills

- **[imap-smtp-email](https://clawhub.ai/gzlicanyi/imap-smtp-email)** - Read, search, manage, and send emails via IMAP/SMTP. Supports Gmail, Outlook, NetEase (163/126/188), and any standard IMAP/SMTP server. Install with:
  ```bash
  npx skills add https://github.com/gzlicanyi/mail-skills -s imap-smtp-email
  ```

## Feedback

Issues and pull requests are welcome at [github.com/gzlicanyi/mail-skills](https://github.com/gzlicanyi/mail-skills).
