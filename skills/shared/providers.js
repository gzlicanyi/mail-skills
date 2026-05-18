const PROVIDERS = {
  '163': {
    imap: { host: 'imap.163.com', port: 993, tls: true, rejectUnauthorized: true },
    smtp: { host: 'smtp.163.com', port: 465, secure: true, rejectUnauthorized: true },
    caldav: 'https://caldav.163.com/',
  },
  'vip.163': {
    imap: { host: 'imap.vip.163.com', port: 993, tls: true, rejectUnauthorized: true },
    smtp: { host: 'smtp.vip.163.com', port: 465, secure: true, rejectUnauthorized: true },
    caldav: 'https://caldav.163.com/',
  },
  '126': {
    imap: { host: 'imap.126.com', port: 993, tls: true, rejectUnauthorized: true },
    smtp: { host: 'smtp.126.com', port: 465, secure: true, rejectUnauthorized: true },
    caldav: 'https://caldav.163.com/',
  },
  'vip.126': {
    imap: { host: 'imap.vip.126.com', port: 993, tls: true, rejectUnauthorized: true },
    smtp: { host: 'smtp.vip.126.com', port: 465, secure: true, rejectUnauthorized: true },
    caldav: 'https://caldav.163.com/',
  },
  '188': {
    imap: { host: 'imap.188.com', port: 993, tls: true, rejectUnauthorized: true },
    smtp: { host: 'smtp.188.com', port: 465, secure: true, rejectUnauthorized: true },
    caldav: 'https://caldav.163.com/',
  },
  'vip.188': {
    imap: { host: 'imap.vip.188.com', port: 993, tls: true, rejectUnauthorized: true },
    smtp: { host: 'smtp.vip.188.com', port: 465, secure: true, rejectUnauthorized: true },
    caldav: 'https://caldav.163.com/',
  },
  'yeah': {
    imap: { host: 'imap.yeah.net', port: 993, tls: true, rejectUnauthorized: true },
    smtp: { host: 'smtp.yeah.net', port: 465, secure: true, rejectUnauthorized: true },
    caldav: 'https://caldav.163.com/',
  },
  'gmail': {
    imap: { host: 'imap.gmail.com', port: 993, tls: true, rejectUnauthorized: true },
    smtp: { host: 'smtp.gmail.com', port: 587, secure: false, rejectUnauthorized: true },
    caldav: 'https://calendar.google.com/calendar/dav/',
  },
  'outlook': {
    imap: { host: 'outlook.office365.com', port: 993, tls: true, rejectUnauthorized: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false, rejectUnauthorized: true },
  },
  'qq': {
    imap: { host: 'imap.qq.com', port: 993, tls: true, rejectUnauthorized: true },
    smtp: { host: 'smtp.qq.com', port: 587, secure: false, rejectUnauthorized: true },
  },
  'exmail.qq': {
    imap: { host: 'imap.exmail.qq.com', port: 993, tls: true, rejectUnauthorized: true },
    smtp: { host: 'smtp.exmail.qq.com', port: 465, secure: true, rejectUnauthorized: true },
  },
  'icloud': {
    imap: { host: 'imap.mail.me.com', port: 993, tls: true, rejectUnauthorized: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false, rejectUnauthorized: true },
    caldav: 'https://caldav.icloud.com/',
  },
  'fastmail': {
    imap: { host: 'imap.fastmail.com', port: 993, tls: true, rejectUnauthorized: true },
    smtp: { host: 'smtp.fastmail.com', port: 465, secure: true, rejectUnauthorized: true },
    caldav: 'https://caldav.fastmail.com/dav/',
  },
  'netease-enterprise-north': {
    imap: { host: 'imap.qiye.163.com', port: 993, tls: true, rejectUnauthorized: true },
    smtp: { host: 'smtp.qiye.163.com', port: 465, secure: true, rejectUnauthorized: true },
    caldav: 'https://caldav.qiye.163.com/',
  },
  'netease-enterprise-east': {
    imap: { host: 'imap.qiye.163.com', port: 993, tls: true, rejectUnauthorized: true },
    smtp: { host: 'smtp.qiye.163.com', port: 465, secure: true, rejectUnauthorized: true },
    caldav: 'https://caldavhz.qiye.163.com/',
  },
};

/**
 * Reverse-lookup: find provider name by IMAP host.
 * Returns null if no match found.
 */
function detectProvider(imapHost) {
  for (const [name, preset] of Object.entries(PROVIDERS)) {
    if (preset.imap && preset.imap.host === imapHost) return name;
  }
  return null;
}

/**
 * Get provider preset names as a display-friendly list for setup prompts.
 */
function providerNames() {
  return Object.keys(PROVIDERS);
}

module.exports = { PROVIDERS, detectProvider, providerNames };