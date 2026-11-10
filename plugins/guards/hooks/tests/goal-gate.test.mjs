// node --test hooks/tests/goal-gate.test.mjs  (system#206): documents today's behaviour of goal-gate.mjs
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'goal-gate.mjs');
const full = 'Said: fix x\nWants: x works for Boss\nCause: class y\nResearch: mechanical: rename a file\nDone when: page shows y\nProof: test passes\nBoss acts: none\n## Steps\n- [ ] do x\n## Boss-only decision\n';
// A transcript with `n` tool calls after the last message of Boss.
function transcript(dir, n) {
  const lines = [JSON.stringify({ type: 'user', message: { content: 'do it' } })];
  for (let i = 0; i < n; i++) lines.push(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } }));
  const file = path.join(dir, 't.jsonl'); fs.writeFileSync(file, lines.join('\n') + '\n'); return file;
}
// opts: prompt (text of Boss's message, null = none), goal (text, null = none), goalNewer, calls, target
function run({ prompt = 'fix x', goal = null, goalNewer = true, calls = 3, target = '', stdin } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-gate-'));
  const dir = path.join(home, '.claude', 'goals'); fs.mkdirSync(dir, { recursive: true });
  const pf = path.join(dir, 's1.prompt'), gf = path.join(dir, 's1.md');
  if (prompt !== null) fs.writeFileSync(pf, prompt);
  if (goal !== null) fs.writeFileSync(gf, goal);
  if (prompt !== null && goal !== null) { const t = Date.now() / 1000; fs.utimesSync(pf, t - 100, t - 100); fs.utimesSync(gf, goalNewer ? t : t - 200, goalNewer ? t : t - 200); }
  const input = stdin !== undefined ? stdin : JSON.stringify({ session_id: 's1', transcript_path: transcript(home, calls), tool_input: { file_path: target === 'goal' ? gf : target } });
  return spawnSync('node', [hook], { input, env: { ...process.env, HOME: home }, encoding: 'utf8' });
}

test('allow: a complete current goal file', () => { const r = run({ goal: full }); assert.equal(r.status, 0); assert.equal(r.stderr, ''); });
test('allow: the first calls of a turn are free', () => { assert.equal(run({ calls: 1 }).status, 0); });
test('allow: no message of Boss yet', () => { assert.equal(run({ prompt: null }).status, 0); });
test('allow: an automated turn (routine)', () => { assert.equal(run({ prompt: '<command-name>x</command-name>' }).status, 0); });
test('allow: writing the goal file itself with no goal', () => { assert.equal(run({ target: 'goal' }).status, 0); });
test('block: no goal file after the free calls', () => {
  const r = run(); assert.equal(r.status, 2);
  assert.match(r.stderr, /Blocked by the goal hook: the goal file .* does not exist/); assert.match(r.stderr, /Goal file format/);
});
test('block: a stale goal file', () => { const r = run({ goal: full, goalNewer: false }); assert.equal(r.status, 2); assert.match(r.stderr, /Boss sent a new message/); });
test('block: an incomplete goal file names the missing keys', () => {
  const r = run({ goal: 'Said: fix x\nWants: x works\n' }); assert.equal(r.status, 2);
  assert.match(r.stderr, /incomplete: Cause, Research, Done when, Proof, Boss acts, Steps/);
});
test('Quick goal: passes up to 4 calls, blocks from the 5th', () => {
  assert.equal(run({ goal: 'Quick: answer\n', calls: 3 }).status, 0);
  const r = run({ goal: 'Quick: answer\n', calls: 5 }); assert.equal(r.status, 2); assert.match(r.stderr, /a "Quick:" goal covers at most 4/);
});
test('broken input: empty stdin, bad JSON and no transcript all exit 0 (no message of Boss for session "unknown")', () => {
  for (const stdin of ['', 'not json', '{}']) { const r = run({ stdin, prompt: null }); assert.equal(r.status, 0, JSON.stringify(stdin)); assert.equal(r.stdout, ''); }
});
test('broken input: a missing transcript file counts zero calls and passes', () => {
  const r = run({ stdin: JSON.stringify({ session_id: 's1', transcript_path: '/nonexistent/t.jsonl' }) }); assert.equal(r.status, 0);
});
