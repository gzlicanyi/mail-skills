# 📧 Mail & Calendar Skills

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![ClawHub](https://img.shields.io/badge/ClawHub-ai-green)](https://clawhub.ai/gzlicanyi/imap-smtp-email)

> Skills for AI assistants to manage email and calendar — read, search, send emails and manage calendar events/tasks via Claude Code, OpenClaw, and other compatible platforms.

## 📦 Skills

| Skill | Description |
|-------|-------------|
| **imap-smtp-email** | Read, search, manage, and send emails via IMAP/SMTP |
| **caldav-sync** | Calendar and task management via CalDAV protocol |

## ✨ Features

### Email (imap-smtp-email)

- **Read Emails** - Check for new/unread messages, fetch full email content
- **Search Mailboxes** - Advanced search with filters (unread, sender, subject, date range)
- **Manage Emails** - Mark as read/unread, list mailboxes
- **Send Emails** - Send text/HTML emails with attachments
- **Download Attachments** - Download all or specific attachments from emails
- **Multi-Account** - Configure multiple email accounts and switch with `--account <name>`

### Calendar (caldav-sync)

- **Calendar Events** - Create, update, delete, and query calendar events
- **Tasks/Todos** - Manage tasks with due dates, priorities, and status tracking
- **Free/Busy Query** - Check availability across calendars
- **Multi-Account** - Configure multiple CalDAV accounts and switch with `--account <name>`
- **Multi-Provider** - Supports Google Calendar, iCloud, Nextcloud, Fastmail, NetEase, and any standard CalDAV server

### Common

- **Multi-Platform** - Works with Claude Code, OpenClaw, and other skill-based AI platforms
- **Multi-Provider Support** - Optimized for NetEase (163.com, 126.com, 188.com) with support for Gmail, Outlook, and other standard servers

## 🛠️ Supported Platforms

- **[Claude Code](https://claude.com/claude-code)** - Anthropic's official CLI for Claude
- **[ClawHub](https://clawhub.ai/gzlicanyi/imap-smtp-email)** - Browse and install this skill
- And other compatible skill-based AI platforms

## 📦 Installation

### Via ClawHub

- **imap-smtp-email**: https://clawhub.ai/gzlicanyi/imap-smtp-email
- **caldav-sync**: https://clawhub.ai/gzlicanyi/caldav-sync

### Via CLI (Claude Code / OpenClaw)

```bash
# Install email skill
npx skills add https://github.com/gzlicanyi/mail-skills -s imap-smtp-email

# Install calendar skill
npx skills add https://github.com/gzlicanyi/mail-skills -s caldav-sync
```

### Manual Installation

**For Claude Code:**
```bash
git clone https://github.com/gzlicanyi/mail-skills.git
cp -r mail-skills/skills/imap-smtp-email ~/.claude/skills/
cp -r mail-skills/skills/caldav-sync ~/.claude/skills/
```

**For OpenClaw:**
```bash
git clone https://github.com/gzlicanyi/mail-skills.git
cp -r mail-skills/skills/imap-smtp-email ~/.openclaw/skills/
cp -r mail-skills/skills/caldav-sync ~/.openclaw/skills/
```

## ⚙️ Configuration

### Email (imap-smtp-email)

Run the setup script to configure your email account:

```bash
cd skills/imap-smtp-email && bash setup.sh
```

Configuration is stored at `~/.config/imap-smtp-email/.env` (survives skill updates).

You can add multiple accounts by running `setup.sh` again and choosing "Add a new account". Use `--account <name>` to switch between accounts:

```bash
node scripts/imap.js --account work check
node scripts/smtp.js --account work send --to foo@bar.com --subject Hi --body Hello
```

### Calendar (caldav-sync)

Run the setup script to configure your CalDAV account:

```bash
cd skills/caldav-sync && bash setup.sh
```

Configuration is stored at `~/.config/caldav-sync/.env` (survives skill updates).

You can add multiple accounts by running `setup.sh` again. Use `--account <name>` to switch between accounts:

```bash
node scripts/caldav.js --account work list-calendars
node scripts/caldav.js --account work list-events --start 2026-01-01 --end 2026-12-31
```

## 🌐 Supported Providers

### Email Providers

| Provider | IMAP Host | IMAP Port | SMTP Host | SMTP Port |
|----------|-----------|-----------|-----------|-----------|
| 163.com | imap.163.com | 993 | smtp.163.com | 465 |
| vip.163.com | imap.vip.163.com | 993 | smtp.vip.163.com | 465 |
| 126.com | imap.126.com | 993 | smtp.126.com | 465 |
| vip.126.com | imap.vip.126.com | 993 | smtp.vip.126.com | 465 |
| 188.com | imap.188.com | 993 | smtp.188.com | 465 |
| vip.188.com | imap.vip.188.com | 993 | smtp.vip.188.com | 465 |
| yeah.net | imap.yeah.net | 993 | smtp.yeah.net | 465 |
| Gmail | imap.gmail.com | 993 | smtp.gmail.com | 587 |
| Outlook | outlook.office365.com | 993 | smtp.office365.com | 587 |
| QQ Mail | imap.qq.com | 993 | smtp.qq.com | 587 |
| exmail.qq.com | imap.exmail.qq.com | 993 | smtp.exmail.qq.com | 465 |

### CalDAV Providers

| Provider | Server URL | Auth |
|----------|-----------|------|
| Google Calendar | `https://calendar.google.com/calendar/dav/` | App Password |
| iCloud | `https://caldav.icloud.com/` | App-Specific Password |
| Nextcloud | `https://<host>/remote.php/dav/calendars/<user>/` | Username/Password |
| Fastmail | `https://caldav.fastmail.com/dav/` | Username/Password |
| NetEase (163/126/yeah.net) | `https://caldav.163.com/` | Authorization Code |
| NetEase Enterprise (North) | `https://caldav.qiye.163.com/` | Username/Password |
| NetEase Enterprise (East) | `https://caldavhz.qiye.163.com/` | Username/Password |

### Important Notes

**NetEase Users (163.com/126.com/188.com):**
- Use **authorization code** (授权码), not account password
- Enable IMAP/SMTP or CalDAV in web settings first
- Get authorization code: Settings -> POP3/SMTP/IMAP -> Client Authorization Password

**Gmail/Google Users:**
- Google does **not** accept your regular account password
- You must generate an **App Password**: https://myaccount.google.com/apppasswords
- Use the generated 16-character App Password
- Requires Google Account with 2-Step Verification enabled

**iCloud Users:**
- Use **App-Specific Password**: https://appleid.apple.com > Sign-In and Security > App-Specific Passwords

## 💡 Usage Examples

### Email

#### Check for New Emails
```bash
node scripts/imap.js check [--limit 10] [--mailbox INBOX] [--recent 2h]
```

#### List Configured Accounts
```bash
node scripts/imap.js list-accounts
```

#### Search Emails
```bash
# Search unread emails from specific sender
node scripts/imap.js search --unseen --from sender@example.com

# Search emails from last 7 days
node scripts/imap.js search --recent 7d --limit 50
```

#### Send Email
```bash
# Simple text email
node scripts/smtp.js send --to recipient@example.com --subject "Hello" --body "World"

# Email with attachment
node scripts/smtp.js send --to recipient@example.com --subject "Report" --body "Please find attached" --attach report.pdf
```

#### Download Attachments
```bash
# Download all attachments from an email
node scripts/imap.js download <uid> --dir ./downloads

# Download specific attachment
node scripts/imap.js download <uid> --file document.pdf
```

### Calendar

#### List Calendars
```bash
node scripts/caldav.js list-calendars
```

#### Query Events
```bash
node scripts/caldav.js list-events --start 2026-01-01 --end 2026-12-31
```

#### Create Event
```bash
node scripts/caldav.js create-event --summary "Meeting" --start "2026-05-17T10:00:00" --end "2026-05-17T11:00:00"
```

#### Create Task
```bash
node scripts/caldav.js create-todo --summary "Buy groceries" --due 2026-05-20
```

#### Free/Busy Query
```bash
node scripts/caldav.js freebusy --start "2026-05-17T09:00:00" --end "2026-05-17T18:00:00"
```

## 📚 Documentation

- **imap-smtp-email**: See [SKILL.md](./skills/imap-smtp-email/SKILL.md) for complete email documentation and all available commands.
- **caldav-sync**: See [SKILL.md](./skills/caldav-sync/SKILL.md) for complete calendar documentation and all available commands.

## 🔒 Security

- Configuration is stored at `~/.config/imap-smtp-email/.env` and `~/.config/caldav-sync/.env` with `600` permissions (owner read/write only)
- **Never commit your credentials to version control**
- Use app passwords when available (Gmail, 163.com, etc.)

## 🐛 Troubleshooting

**Connection timeout:**
- Verify server is running and accessible
- Check host/port configuration

**Authentication failed:**
- Verify username (usually full email address)
- For NetEase: Use authorization code (授权码), not account password
- For Gmail: Use App Password, not regular password

**TLS/SSL errors:**
- Match `IMAP_TLS`/`SMTP_SECURE` setting to server requirements
- For self-signed certs: set `IMAP_REJECT_UNAUTHORIZED=false` or `SMTP_REJECT_UNAUTHORIZED=false`

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues and questions, please open an issue on [GitHub Issues](https://github.com/gzlicanyi/mail-skills/issues).