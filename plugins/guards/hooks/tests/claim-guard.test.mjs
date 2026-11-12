// node --test hooks/tests/claim-guard.test.mjs  (system#386)
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { labelsOf, blockReason, FRESH_S } from '../claim-guard.mjs';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'claim-guard.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'));
const where = { owner: 'DigitalniHR', repo: 'system', issue_number: 380 };
const run = (hook_event_name, tool_name, tool_input, tool_response) => spawnSync('node', [hook], {
  input: JSON.stringify({ session_id: 's1', hook_event_name, tool_name, tool_input, tool_response }),
  encoding: 'utf8', env: { ...process.env, CLAIM_GUARD_DIR: tmp },
});
const read = (names) => run('PostToolUse', 'mcp__claude_ai_GitHub_conector__issue_read', { method: 'get_labels', ...where },
  [{ type: 'text', text: JSON.stringify({ labels: names.map((name) => ({ name })) }) }]);
const write = (labels) => run('PreToolUse', 'mcp__claude_ai_GitHub_conector__issue_write', { method: 'update', ...where, labels });

test('labelsOf reads the connector JSON and ignores label words in the body', () => {
  assert.deepEqual(labelsOf({ labels: [{ name: 'a' }, { name: 'engineer:mac' }] }), ['a', 'engineer:mac']);
  assert.deepEqual(labelsOf([{ type: 'text', text: '{"body":"engineer:mac","labels":[{"name":"auditor"}]}' }]), ['auditor']);
  assert.equal(labelsOf('not json'), null);
});

test('system#380: a claim written from the trigger copy, with no read, is blocked', () => {
  fs.rmSync(tmp, { recursive: true, force: true });
  const r = write(['auditor', 'in-progress', 'engineer:cloud']);
  assert.equal(r.status, 2); assert.match(r.stderr, /read the issue/);
});

test('system#380: after a fresh read with the Mac claim, the cloud claim is blocked with the skip', () => {
  read(['auditor', 'engineer:mac', 'in-progress']);
  const r = write(['auditor', 'in-progress', 'engineer:mac', 'engineer:cloud']);
  assert.equal(r.status, 2); assert.match(r.stderr, /skip: the Mac has it/);
  assert.match(write(['auditor', 'in-progress', 'engineer:cloud']).stderr, /removes engineer:mac/);
});

test('a cloud claim on an issue with no Mac claim passes, and the step back after a late Mac claim passes', () => {
  read(['auditor']);
  assert.equal(write(['auditor', 'in-progress', 'engineer:cloud']).status, 0);
  read(['auditor', 'in-progress', 'engineer:cloud', 'engineer:mac']);   // the Mac claimed in the same minute
  assert.equal(write(['auditor', 'in-progress', 'engineer:mac']).status, 0);
});

test('an old read is not fresh', () => {
  assert.match(blockReason({ at: Date.now() - (FRESH_S + 1) * 1000, labels: [] }, ['x']), /read the issue/);
  assert.equal(blockReason({ at: Date.now(), labels: [] }, ['x']), null);
});

test('other tools and writes without labels pass', () => {
  assert.equal(run('PreToolUse', 'Bash', { command: 'gh issue edit 5 --add-label engineer:cloud' }).status, 0);
  assert.equal(run('PreToolUse', 'mcp__github__issue_write', { method: 'update', ...where, body: 'x' }).status, 0);
  assert.equal(run('PreToolUse', 'mcp__github__issue_write', { method: 'create', owner: 'a', repo: 'b', labels: ['x'] }).status, 0);
});

test('the hook runs when its path goes through a symlink (macOS /var is /private/var)', () => {
  const link = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-link-')), 'claim-guard.mjs');
  fs.symlinkSync(hook, link);
  const r = spawnSync('node', [link], { input: JSON.stringify({ session_id: 's2', hook_event_name: 'PreToolUse', tool_name: 'mcp__github__issue_write', tool_input: { method: 'update', ...where, labels: ['x'] } }), encoding: 'utf8', env: { ...process.env, CLAIM_GUARD_DIR: tmp } });
  assert.equal(r.status, 2);
});
