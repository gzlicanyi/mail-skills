#!/usr/bin/env node
// Pure-logic unit tests for matchesTextCriteria. No IMAP, no network.
// Run: node scripts/test-search-filter.js
const assert = require('assert');

// matchesTextCriteria is exported from search-filter.js, a pure module with no
// IMAP/config dependencies so it can be tested without email configuration.
const { matchesTextCriteria } = require('./search-filter');

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

const sample = {
  from: '张三 <zs@163.com>',
  subject: '[E2E-v3] 会议邀请测试 1784104089',
};

check('from matches email address substring (case-insensitive)', () => {
  assert.strictEqual(matchesTextCriteria(sample, { from: 'zs@163.com' }), true);
  assert.strictEqual(matchesTextCriteria(sample, { from: 'ZS@163.COM' }), true);
});

check('from matches display name substring', () => {
  assert.strictEqual(matchesTextCriteria(sample, { from: '张三' }), true);
});

check('from does not match absent substring', () => {
  assert.strictEqual(matchesTextCriteria(sample, { from: 'nobody@example.com' }), false);
});

check('subject matches substring (case-insensitive)', () => {
  assert.strictEqual(matchesTextCriteria(sample, { subject: '会议邀请测试' }), true);
  assert.strictEqual(matchesTextCriteria(sample, { subject: 'e2e-v3' }), true);
});

check('subject does not match absent substring', () => {
  assert.strictEqual(matchesTextCriteria(sample, { subject: '不存在的主题' }), false);
});

check('both from and subject given => AND (both hit => true)', () => {
  assert.strictEqual(matchesTextCriteria(sample, { from: 'zs@163.com', subject: '会议' }), true);
});

check('both from and subject given => AND (one miss => false)', () => {
  assert.strictEqual(matchesTextCriteria(sample, { from: 'zs@163.com', subject: '不存在' }), false);
  assert.strictEqual(matchesTextCriteria(sample, { from: 'nobody', subject: '会议' }), false);
});

check('no criteria => true (matches all)', () => {
  assert.strictEqual(matchesTextCriteria(sample, {}), true);
});

check('from handles Unknown sender gracefully', () => {
  assert.strictEqual(matchesTextCriteria({ from: 'Unknown', subject: 'x' }, { from: 'zs' }), false);
});

console.log(`\n${passed} passed`);
