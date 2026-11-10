// node --test hooks/tests/goal-prompt.test.mjs  (system#206): documents today's behaviour of goal-prompt.mjs
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'goal-prompt.mjs');
const full = 'Said: fix x\nWants: x works for Boss\nCause: class y\nResearch: mechanical: rename a file\nDone when: page shows y\nProof: test passes\nBoss acts: none\n## Steps\n- [ ] do x\n## Boss-only decision\n';
function run(input, { goal, blocks } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-prompt-'));
  const dir = path.join(home, '.claude', 'goals'); fs.mkdirSync(dir, { recursive: true });
  if (goal !== undefined) fs.writeFileSync(path.join(dir, 's1.md'), goal);
  if (blocks) fs.writeFileSync(path.join(dir, 's1.blocks'), '1');
  const r = spawnSync('node', [hook], { input, env: { ...process.env, HOME: home }, encoding: 'utf8' });
  return { ...r, dir };
}
const msg = (prompt) => JSON.stringify({ session_id: 's1', prompt });

test('no goal file: tells the model to write it and records the message', () => {
  const r = run(msg('fix x')); assert.equal(r.status, 0);
  assert.match(r.stdout, /Goal file of this session: .*s1\.md\nIt does not exist\. Before the 3\. tool call of this turn, write it\. Goal file format/);
  assert.equal(fs.readFileSync(path.join(r.dir, 's1.prompt'), 'utf8'), 'fix x');
});
test('existing goal file: summary and the instruction to update or touch it', () => {
  const r = run(msg('and y'), { goal: full }); assert.equal(r.status, 0);
  assert.match(r.stdout, /It exists \(Wants: x works for Boss · Done when: page shows y · open steps: 1\)\. Boss sent a new message/);
});
test('a Quick goal is named as such', () => { assert.match(run(msg('hi'), { goal: 'Quick: q\n' }).stdout, /It exists \(a Quick task\)/); });
test('the block counter of the session is removed', () => {
  const r = run(msg('hi'), { blocks: true }); assert.equal(fs.existsSync(path.join(r.dir, 's1.blocks')), false);
});
test('an automated prompt prints nothing and records nothing', () => {
  const r = run(msg('<command-name>x</command-name>')); assert.equal(r.status, 0); assert.equal(r.stdout, ''); assert.equal(fs.existsSync(path.join(r.dir, 's1.prompt')), false);
});
test('a long prompt is cut to 2000 characters', () => {
  const r = run(msg('a'.repeat(3000))); assert.equal(fs.readFileSync(path.join(r.dir, 's1.prompt'), 'utf8').length, 2000);
});
test('broken input: empty stdin, bad JSON and {} exit 0 and use the session "unknown"', () => {
  for (const s of ['', 'not json', '{}']) {
    const r = run(s); assert.equal(r.status, 0, JSON.stringify(s)); assert.match(r.stdout, /unknown\.md/);
    assert.equal(fs.readFileSync(path.join(r.dir, 'unknown.prompt'), 'utf8'), '');
  }
});
test('a block counter that cannot be removed is named on stderr; stdout and exit code are unchanged', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-prompt-'));
  const b = path.join(home, '.claude', 'goals', 's1.blocks'); fs.mkdirSync(path.join(b, 'x'), { recursive: true });   // a folder, not a file
  const r = spawnSync('node', [hook], { input: msg('hi'), env: { ...process.env, HOME: home }, encoding: 'utf8' });
  assert.equal(r.status, 0); assert.match(r.stderr, /^goal-prompt: /); assert.match(r.stdout, /^Goal file of this session/);
});
test('a missing block counter writes nothing on stderr', () => { assert.equal(run(msg('hi')).stderr, ''); });
