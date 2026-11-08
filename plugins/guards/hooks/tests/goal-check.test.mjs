// node --test hooks/tests/goal-check.test.mjs  (system#54)
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'goal-check.mjs');
function run(text, name = 's1.md') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-check-'));
  const dir = path.join(home, '.claude', 'goals'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name); fs.writeFileSync(file, text);
  return spawnSync('node', [hook], { input: JSON.stringify({ session_id: 's1', tool_name: 'Write', tool_input: { file_path: file } }), env: { ...process.env, HOME: home }, encoding: 'utf8' });
}
const full = 'Said: fix x\nWants: x works for Boss\nCause: class y\nResearch: dhr/2_content/newsletter-funnel-standard.md\nDone when: page shows y\nProof: test passes\nBoss acts: none\n## Steps\n- [ ] do x\n## Boss-only decision\n';

test('an incomplete goal file gives exit 2 and names the missing keys', () => {
  const r = run('Said: fix x\nWants: x works\n');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /incomplete: Cause, Research, Done when, Proof, Boss acts, Steps/);
  assert.match(r.stderr, /Goal file format/);
});
test('a complete goal file passes', () => { assert.equal(run(full).status, 0); });
test('a Quick goal passes', () => { assert.equal(run('Quick: answer a question\n').status, 0); });
test('another file is not checked', () => { assert.equal(run('nothing', 'other.md').status, 0); });
test('Research without a source or a mechanical reason is refused', () => {
  const r = run(full.replace('Research: dhr/2_content/newsletter-funnel-standard.md', 'Research: I know how'));
  assert.equal(r.status, 2); assert.match(r.stderr, /Research \(name the standard/);
});
test('a mechanical Research line passes', () => { assert.equal(run(full.replace('Research: dhr/2_content/newsletter-funnel-standard.md', 'Research: mechanical: rename a file')).status, 0); });
test('a Cause that repeats Said is refused', () => {
  const r = run(full.replace('Cause: class y', 'Cause: fix x'));
  assert.equal(r.status, 2); assert.match(r.stderr, /Cause \(same as Said/);
});

test('Done when as a list (standards/evals.md form) is complete', async () => {
  const { parseGoal } = await import(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'goal-lib.mjs'));
  const g = parseGoal('Said: a\nWants: b c\nCause: d\nResearch: mechanical: e\nDone when (all true):\n1. x\n2. y\n3. z\nNot done when: w\nProof:\n1. p\n2. q\n3. r\nBoss acts: none\n## Steps\n- [ ] s\n## Boss-only decision\n');
  assert.equal(g.missing['Done when'], undefined); assert.equal(g.missing.Proof, undefined);
  assert.equal(g['Done when'], '1. x 2. y 3. z');
});
