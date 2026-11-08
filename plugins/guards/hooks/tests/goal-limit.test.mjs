// node --test hooks/tests/goal-limit.test.mjs  (system#23)
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'goal-stop.mjs');
const feedback = { type: 'user', isMeta: true, message: { role: 'user', content: 'Stop hook feedback:\n[keep going]: not done' } };
const ruleFeedback = { type: 'user', isMeta: true, message: { role: 'user', content: 'Stop hook feedback:\n[You check one rule of Boss]: x' } };
const edit = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: {} }] } };
const read = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] } };
const boss = { type: 'user', message: { role: 'user', content: '/goal keep going' } };

function run(lines) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-limit-'));
  const tp = path.join(home, 't.jsonl');
  fs.writeFileSync(tp, lines.map(l => JSON.stringify(l)).join('\n'));
  const r = spawnSync('node', [hook], { input: JSON.stringify({ session_id: 's1', transcript_path: tp }), env: { ...process.env, HOME: home }, encoding: 'utf8' });
  const log = path.join(home, '.claude', 'logs', 'session-events.jsonl');
  return { out: r.stdout, log: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
}

test('10 re-prompts end the session and write one log line', () => {
  const lines = [boss]; for (let i = 0; i < 10; i++) lines.push(edit, feedback);
  const { out, log } = run(lines);
  assert.equal(JSON.parse(out).continue, false);
  assert.equal(log.trim().split('\n').length, 1);
  assert.match(log, /"event":"StopLimit"/);
});
test('two idle turns after re-prompts end the session', () => {
  const { out } = run([boss, edit, feedback, read, feedback, read]);
  assert.equal(JSON.parse(out).continue, false);
});
test('a turn that changed a file keeps the loop open', () => {
  assert.equal(run([boss, read, feedback, edit, feedback, read]).out, '');
});
test('rule-hook feedback is not counted', () => {
  const lines = [boss]; for (let i = 0; i < 12; i++) lines.push(read, ruleFeedback);
  assert.equal(run(lines).out, '');
});
test('a new message of Boss resets the count', () => {
  const lines = [boss]; for (let i = 0; i < 12; i++) lines.push(edit, feedback);
  lines.push(boss, edit, feedback);
  assert.equal(run(lines).out, '');
});
