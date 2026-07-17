// Pure function for client-side text matching on email fields.
// Case-insensitive substring match. from matches the full from-string
// (display name + address); both from + subject given => AND.
// Used by searchEmailsLocal (neteasemail text search fallback) and
// potentially other local filtering paths.

function matchesTextCriteria(parsed, criteria) {
  if (criteria.from) {
    const want = String(criteria.from).toLowerCase();
    const have = String(parsed.from || '').toLowerCase();
    if (!have.includes(want)) return false;
  }
  if (criteria.subject) {
    const want = String(criteria.subject).toLowerCase();
    const have = String(parsed.subject || '').toLowerCase();
    if (!have.includes(want)) return false;
  }
  return true;
}

module.exports = { matchesTextCriteria };
