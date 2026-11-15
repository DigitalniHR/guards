// node --test hooks/tests/goal-stop-result.test.mjs  (CAO, 10 Nov 2026): a finished turn ends with its result stated
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'goal-stop.mjs');
const done = 'Said: fix x\nWants: x works for Boss\nCause: class y\nExists: none found: rg y\nResearch: mechanical: rename a file\nDesign: mechanical: one line\nDone when: page shows y\nProof: test passes\nBoss acts: none\n## Steps\n- [x] do x — test green\n## Boss-only decision\n';
const open = done.replace('- [x] do x — test green', '- [ ] do x');
function run({ goal = done, last = '' } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-stop-'));
  const dir = path.join(home, '.claude', 'goals'); fs.mkdirSync(dir, { recursive: true });
  const pf = path.join(dir, 's1.prompt'), gf = path.join(dir, 's1.md');
  fs.writeFileSync(pf, 'fix x'); fs.writeFileSync(gf, goal);
  const t = Date.now() / 1000; fs.utimesSync(pf, t - 100, t - 100); fs.utimesSync(gf, t, t);
  const lines = [JSON.stringify({ type: 'user', message: { content: 'fix x' } })];
  for (let i = 0; i < 5; i++) lines.push(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } }));
  const tp = path.join(home, 't.jsonl'); fs.writeFileSync(tp, lines.join('\n') + '\n');
  const r = spawnSync('node', [hook], { input: JSON.stringify({ session_id: 's1', transcript_path: tp, last_assistant_message: last }), env: { ...process.env, HOME: home }, encoding: 'utf8' });
  return r.stdout.trim();
}
test('allow: all steps done and the last message states the result with a proof link', () => {
  assert.equal(run({ last: 'Done: the page shows y, PR https://github.com/DigitalniHR/system/pull/1 merged. Boss acts: none.' }), '');
});
test('allow: a result stated with a path and "hotovo"', () => {
  assert.equal(run({ last: 'Hotovo. Proof: bin/tests/x.test.sh green.' }), '');
});
test('allow: not done, with the blocking issue named', () => {
  assert.equal(run({ last: 'Not done: blocked by #96, the CLI login.' }), '');
});
test('block: all steps done, the last message has no result line', () => {
  const out = JSON.parse(run({ last: 'I changed the file and the test runs.' }));
  assert.equal(out.decision, 'block'); assert.match(out.reason, /does not say the result/);
});
test('block: open steps are still reported first (unchanged)', () => {
  const out = JSON.parse(run({ goal: open, last: 'Done: https://x' }));
  assert.match(out.reason, /open step/);
});
// system#620: a promise to read may start the work, never end it; a system change reports "Parts: N -> M"; an audit
// gives the map and the delete list.
const real = done.replace('Design: mechanical: one line', 'Design: change goal-stop; parts 5 -> 5');
const ok = 'Done: PR https://github.com/DigitalniHR/system/pull/1 merged. Parts: 5 -> 5. Boss acts: none.';
test('block: Exists still holds "not yet read" at the end of the turn', () => {
  const out = JSON.parse(run({ goal: real.replace('Exists: none found: rg y', 'Exists: not yet read; to read: content-creation/README.md'), last: ok }));
  assert.match(out.reason, /Exists \(it still holds a promise to read/);
});
test('block: a design with no count of parts', () => {
  const out = JSON.parse(run({ goal: real.replace('; parts 5 -> 5', ''), last: ok }));
  assert.match(out.reason, /Design \(no count of parts/);
});
test('block: a system change whose last message has no "Parts: N -> M"', () => {
  const out = JSON.parse(run({ goal: real, last: 'Done: PR https://github.com/DigitalniHR/system/pull/1 merged.' }));
  assert.match(out.reason, /no line "Parts: N -> M"/);
});
test('allow: a system change with the parts line', () => { assert.equal(run({ goal: real, last: ok }), ''); });
test('block: an audit with no delete list; allow with it', () => {
  const audit = real.replace('Said: fix x', 'Said: audit of the worker');
  assert.match(JSON.parse(run({ goal: audit, last: ok })).reason, /delete list/);
  assert.equal(run({ goal: audit, last: `${ok} Map: 5 parts. Delete list: none.` }), '');
});
