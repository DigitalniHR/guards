// node --test hooks/tests/event-log.test.mjs  (system#206): documents today's behaviour of event-log.mjs
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'event-log.mjs');
const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'event-log-'));
const run = (h, stdin) => spawnSync('node', [hook], { input: stdin, env: { ...process.env, HOME: h }, encoding: 'utf8' });
const logOf = (h) => path.join(h, '.claude', 'logs', 'session-events.jsonl');
const lines = (h) => fs.readFileSync(logOf(h), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('a permission prompt is appended as one JSON line', () => {
  const h = home(); const r = run(h, JSON.stringify({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs permission', cwd: '/x', session_id: 's1' }));
  assert.equal(r.status, 0); assert.equal(r.stdout, '');
  const [e] = lines(h); assert.equal(e.event, 'Notification'); assert.equal(e.type, 'permission_prompt'); assert.equal(e.text, 'Claude needs permission'); assert.equal(e.cwd, '/x'); assert.equal(e.session, 's1'); assert.ok(e.at);
});
test('a failed turn: error is the type, last message is the text, cut to 300 characters', () => {
  const h = home(); run(h, JSON.stringify({ hook_event_name: 'StopFailure', error: 'rate_limit', last_assistant_message: 'x'.repeat(500) }));
  const [e] = lines(h); assert.equal(e.type, 'rate_limit'); assert.equal(e.text.length, 300);
});
test('lines are appended, not overwritten', () => { const h = home(); run(h, '{}'); run(h, '{}'); assert.equal(lines(h).length, 2); });
test('broken input: empty stdin logs an empty event and exits 0', () => { const h = home(); const r = run(h, ''); assert.equal(r.status, 0); assert.equal(lines(h)[0].type, ''); });
test('broken input: bad JSON logs nothing, exits 0, prints nothing (a log hook never stops a session)', () => {
  const h = home(); const r = run(h, 'not json'); assert.equal(r.status, 0); assert.equal(r.stdout, ''); assert.equal(fs.existsSync(logOf(h)), false);
});
test('broken input: an unwritable log folder exits 0', () => {
  const h = home(); fs.writeFileSync(path.join(h, '.claude'), 'a file, not a folder'); const r = run(h, '{}'); assert.equal(r.status, 0); assert.equal(r.stdout, '');
});
test('unit: the scheduled task name of the transcript wins over the folder (system#465: dhr-engineer runs in system)', () => {
  const h = home(); const t = path.join(h, 't.jsonl');
  fs.writeFileSync(t, JSON.stringify({ type: 'queue-operation', content: '<scheduled-task name="dhr-engineer" file="/x/SKILL.md">\nrun' }) + '\n');
  run(h, JSON.stringify({ hook_event_name: 'StopFailure', error: 'rate_limit', cwd: '/Users/m/Claude projects/system', transcript_path: t }));
  const [e] = lines(h); assert.equal(e.routine, 'dhr-engineer'); assert.equal(e.unit, 'dhr');
});
test('unit: from the folder, also an issue-engineer worktree; a scratch folder with no task name has no unit', () => {
  const h = home();
  run(h, JSON.stringify({ cwd: '/Users/m/Claude projects/.issue-engineer/jobboard-12' }));
  run(h, JSON.stringify({ cwd: '/Users/m/Claude projects/studio/core' }));
  run(h, JSON.stringify({ cwd: '/Users/m/Library/Application Support/Claude/scratch-workspaces/a/b', transcript_path: '/nope' }));
  assert.deepEqual(lines(h).map((e) => e.unit), ['jobboard', 'studio', '']);
});
