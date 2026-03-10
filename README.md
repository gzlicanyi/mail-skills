# 📧 Mail Skills

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![ClawHub](https://img.shields.io/badge/ClawHub-ai-green)](https://clawhub.ai/gzlicanyi/imap-smtp-email)

> An official NetEase email skill for AI assistants - read, search, manage, and send emails via Claude Code, OpenClaw, and other compatible platforms.

## ✨ Features

- **Read Emails** - Check for new/unread messages, fetch full email content
- **Search Mailboxes** - Advanced search with filters (unread, sender, subject, date range)
- **Manage Emails** - Mark as read/unread, list mailboxes
- **Send Emails** - Send text/HTML emails with attachments
- **Download Attachments** - Download all or specific attachments from emails
- **Multi-Platform** - Works with Claude Code, OpenClaw, and other skill-based AI platforms
- **Multi-Provider Support** - Optimized for NetEase mailboxes (163.com, 126.com, 188.com) with support for Gmail, Outlook, and any standard IMAP/SMTP server

## 🛠️ Supported Platforms

- **[Claude Code](https://claude.com/claude-code)** - Anthropic's official CLI for Claude
- **[OpenClaw](https://github.com/nbrown/oai-cli)** - OpenAI CLI with skill support
- **[ClawHub](https://clawhub.ai/gzlicanyi/imap-smtp-email)** - Browse and install this skill
- And other compatible skill-based AI platforms

## 📦 Installation

### Via ClawHub

Visit the skill page on ClawHub: https://clawhub.ai/gzlicanyi/imap-smtp-email

### Via CLI (Claude Code / OpenClaw)

```bash
npx skills add git@github.com:gzlicanyi/mail-skills.git
```

### Manual Installation

**For Claude Code:**
```bash
git clone git@github.com:gzlicanyi/mail-skills.git
cp -r mail-skills/imap-smtp-email ~/.claude/skills/
```

**For OpenClaw:**
```bash
git clone git@github.com:gzlicanyi/mail-skills.git
cp -r mail-skills/imap-smtp-email ~/.openclaw/skills/
```

## ⚙️ Configuration

Create a `.env` file in the skill directory with your email credentials:

```bash
# IMAP Configuration (receiving email)
IMAP_HOST=imap.gmail.com          # Server hostname
IMAP_PORT=993                     # Server port
IMAP_USER=your@email.com
IMAP_PASS=your_password
IMAP_TLS=true                     # Use TLS/SSL connection
IMAP_REJECT_UNAUTHORIZED=true     # Set to false for self-signed certs
IMAP_MAILBOX=INBOX                # Default mailbox

# SMTP Configuration (sending email)
SMTP_HOST=smtp.gmail.com          # SMTP server hostname
SMTP_PORT=587                     # SMTP port (587 for STARTTLS, 465 for SSL)
SMTP_SECURE=false                 # true for SSL (465), false for STARTTLS (587)
SMTP_USER=your@gmail.com          # Your email address
SMTP_PASS=your_password           # Your password or app password
SMTP_FROM=your@gmail.com          # Default sender email (optional)
SMTP_REJECT_UNAUTHORIZED=true     # Set to false for self-signed certs
```

## 🌐 Supported Email Providers

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

### Important Notes

**NetEase Mailbox Users (163.com/126.com/188.com):**
- Use **authorization code** (授权码), not account password
- Enable IMAP/SMTP in web settings first
- Get authorization code: Settings -> POP3/SMTP/IMAP -> Client Authorization Password

**Gmail Users:**
- Gmail does **not** accept your regular account password
- You must generate an **App Password**: https://myaccount.google.com/apppasswords
- Use the generated 16-character App Password as `IMAP_PASS` / `SMTP_PASS`
- Requires Google Account with 2-Step Verification enabled

## 💡 Usage Examples

### Check for New Emails
```bash
node scripts/imap.js check [--limit 10] [--mailbox INBOX] [--recent 2h]
```

### Search Emails
```bash
# Search unread emails from specific sender
node scripts/imap.js search --unseen --from sender@example.com

# Search emails from last 7 days
node scripts/imap.js search --recent 7d --limit 50
```

### Send Email
```bash
# Simple text email
node scripts/smtp.js send --to recipient@example.com --subject "Hello" --body "World"

# Email with attachment
node scripts/smtp.js send --to recipient@example.com --subject "Report" --body "Please find attached" --attach report.pdf
```

### Download Attachments
```bash
# Download all attachments from an email
node scripts/imap.js download <uid> --dir ./downloads

# Download specific attachment
node scripts/imap.js download <uid> --file document.pdf
```

## 📚 Documentation

For complete documentation and all available commands, see [SKILL.md](./imap-smtp-email/SKILL.md).

## 🔒 Security

- Store credentials in `.env` file (add to `.gitignore`)
- **Never commit your email credentials to version control**
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