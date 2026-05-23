# CardDAV Sync Skill Design

## Summary

独立的 `skills/carddav-sync/` skill，通过 CardDAV 协议同步联系人到本地缓存，支持增量同步和本地搜索。架构复刻现有 CalDAV skill 的模块化设计。

## Scope

- 读取联系人 + 增量同步（不做创建/更新/删除）
- 支持 NetEase、Google、iCloud、Custom 四类 Provider
- 本地搜索（按 FN/EMAIL/TEL/ORG 子串匹配）
- 多账户、多通讯录支持

## Module Structure

```
skills/carddav-sync/
├── package.json
├── SKILL.md
├── setup.sh
└── scripts/
    ├── carddav.js      # CLI entry: arg parsing, command routing
    ├── config.js        # Account config, provider detection from ~/.config/mail-skills/.env
    ├── sync.js          # Incremental sync core: sync-token → CTag+ETag → full
    ├── cache.js         # File cache under ~/.config/mail-skills/carddav-cache/<account>/<addressbook>/
    ├── vcard.js         # vCard 3.0/4.0 parsing, extract FN/EMAIL/TEL/ORG/TITLE/NOTE
    └── providers.js     # CardDAV endpoint presets for NetEase/Google/iCloud/Custom
```

## CLI Commands

```
node carddav.js sync [--account <name>]              # Sync contacts to local cache
node carddav.js list [--account <name>]               # List all addressbooks
node carddav.js contacts [--account <name>]           # List all cached contacts
node carddav.js search <keyword> [--account <name>]   # Local search by FN/EMAIL/TEL/ORG
node carddav.js get <uid> [--account <name>]          # Get single contact detail from cache
node carddav.js fetch <uid> [--account <name>]        # Fetch single contact from server
```

## Sync Strategy

Three-tier fallback, identical pattern to CalDAV:

### Tier 1: sync-token (preferred)

```xml
<sync-collection xmlns="urn:ietf:params:xml:ns:carddav">
  <sync-token>{previous-token}</sync-token>
  <sync-level>1</sync-level>
  <prop><getetag/><address-data/></prop>
</sync-collection>
```

- 410 Gone → clear cache, fall back to full sync
- Parse new/modified/deleted contacts from response
- Incremental cache update

### Tier 2: CTag + ETag (fallback)

1. Get addressbook CTag, compare with cached value
2. CTag unchanged → no changes, return immediately
3. CTag changed → fetch all ETags via `addressbook-multiget`, diff against local
4. Fetch only changed contacts by URL
5. Remove locally-deleted contacts (present in cache, missing on server)

### Tier 3: Full sync (last resort)

- Fetch all contacts via `addressbook-query` or `addressbook-multiget`
- Match by URL/UID for differential update

### First sync

Auto-detect server capability, perform full sync to establish baseline, record detected sync mode.

## Cache Structure

Per-account, per-addressbook directory: `~/.config/mail-skills/carddav-cache/<account>/<addressbook-id>/`

### sync-state.json

```json
{
  "mode": "sync-token|ctag|full",
  "syncToken": "last-sync-token",
  "ctag": "addressbook-ctag",
  "etags": { "https://server/contact.vcf": "\"etag-value\"" },
  "lastSync": "2026-05-23T12:00:00.000Z"
}
```

### objects.json

```json
{
  "contacts": {
    "uid1": {
      "uid": "uid1",
      "fn": "张三",
      "emails": [{ "type": "WORK", "value": "zhangsan@example.com" }],
      "tels": [{ "type": "CELL", "value": "+8613800138000" }],
      "org": "某公司",
      "title": "工程师",
      "note": "备注",
      "url": "https://dav.163.com/carddav/xxx.vcf",
      "etag": "\"abc123\"",
      "rawVcard": "BEGIN:VCARD\r\nVERSION:3.0\r\n..."
    }
  },
  "urlMap": {
    "https://server/contact.vcf": "uid1"
  }
}
```

## Provider Presets

| Provider | CardDAV URL | Notes |
|----------|------------|-------|
| NetEase (163/126/188) | `https://dav.163.com/carddav/` | Non-standard, use raw fetch, manual URL construction |
| Google | `https://www.googleapis.com/carddav/v1/principals/{email}/lists/default/` | Requires app-specific password |
| iCloud | `https://contacts.icloud.com/{principal}/` | Requires app-specific password |
| Custom | User-configured via `CARDDAV_URL` env var | Any standard CardDAV server |

Config reuses existing `~/.config/mail-skills/.env`:

```bash
# CardDAV config (with WORK prefix example)
WORK_CARDDAV_URL=https://dav.163.com/carddav/   # Optional if provider has default
```

## Search

Local-only, case-insensitive substring matching across structured fields:
- `fn` (display name)
- `emails[].value`
- `tels[].value`
- `org` (organization)

Returns list of matching contacts with summary fields (uid, fn, primary email, primary phone).

## Error Handling

| Case | Behavior |
|------|----------|
| 401/403 | Report auth failure, suggest checking credentials |
| 404 | Contact deleted on server, remove from cache |
| 410 Gone | sync-token expired, clear cache and re-sync full |
| Network timeout | Report connection failure, preserve existing cache |
| vCard parse error | Skip contact, log warning, continue sync |

## Special Cases

### NetEase

- Non-standard DAV implementation, do not use tsdav library
- Direct fetch with XML body, manual URL construction
- PROPFIND principal URL to discover addressbook home set

### Multiple Addressbooks

- One account may have multiple addressbooks (e.g. iCloud "All Contacts", "VIP")
- `sync` syncs all addressbooks by default, supports `--addressbook <name>` for specific one
- Each addressbook gets independent cache directory and sync state

### Concurrency Control

- File lock per addressbook during sync to prevent cache corruption
- Request throttling to avoid server rate limits

## Dependencies

- `node-fetch` or native `fetch` for HTTP requests
- No heavy DAV library — use raw XML requests like CalDAV does for NetEase
- No external vCard library — implement lightweight parser targeting only stored fields (FN, EMAIL, TEL, ORG, TITLE, NOTE, UID); all other vCard properties are ignored but preserved in rawVcard
