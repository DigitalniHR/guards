// node --test hooks/tests/goal-stop.test.mjs  (system#670): the Stop hook blocks only an open step, once per message of
// Boss; format misses of the end message (result line, Parts, delete list, Boss acts, promise to read) never block.
// The cases are the sampled blocks of 2 to 16 Nov 2026 (cases 1-30 of the measurement in system#670).
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'goal-stop.mjs');
const done = 'Said: fix x\nWants: x works for Boss\nCause: class y\nExists: none found: rg y\nResearch: mechanical: rename a file\nDesign: change goal-stop; parts 5 -> 5\nDone when: page shows y\nProof: test passes\nBoss acts: none\n## Steps\n- [x] do x — test green\nSTEP\n## Boss-only decision\n';
const goal = (step = '') => done.replace('STEP', step);
function setup(g) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-stop-'));
  const dir = path.join(home, '.claude', 'goals'); fs.mkdirSync(dir, { recursive: true });
  const pf = path.join(dir, 's1.prompt'), gf = path.join(dir, 's1.md');
  fs.writeFileSync(pf, 'fix x'); fs.writeFileSync(gf, g);
  const t = Date.now() / 1000; fs.utimesSync(pf, t - 100, t - 100); fs.utimesSync(gf, t, t);
  const lines = [JSON.stringify({ type: 'user', message: { content: 'fix x' } })];
  for (let i = 0; i < 5; i++) lines.push(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } }));
  const tp = path.join(home, 't.jsonl'); fs.writeFileSync(tp, lines.join('\n') + '\n');
  return { home, tp };
}
function run({ g = goal(), last = 'I changed the file.', env = setup(g), active = false } = {}) {
  const r = spawnSync('node', [hook], { input: JSON.stringify({ session_id: 's1', transcript_path: env.tp, last_assistant_message: last, stop_hook_active: active }), env: { ...process.env, HOME: env.home, GOAL_SESSIONS_DIR: path.join(env.home, 'none') }, encoding: 'utf8' });
  return r.stdout.trim();
}

// Format-only misses (cases 18-30): the end message lacks a line; the facts are there. They pass now.
test('allow: no result line (case 18-21)', () => { assert.equal(run({ last: 'The page shows 6 steps.' }), ''); });
test('allow: no "Parts: N -> M" line (case 26-27)', () => { assert.equal(run({ last: 'Tests 43 of 43 passed.' }), ''); });
test('allow: an audit with no delete list (case 28-29)', () => { assert.equal(run({ g: goal().replace('Said: fix x', 'Said: audit of x') }), ''); });
test('allow: Exists still promises to read (case 22-23)', () => { assert.equal(run({ g: goal().replace('Exists: none found: rg y', 'Exists: not yet read') }), ''); });
test('allow: the message asks Boss for an act and the file says none (case 24)', () => { assert.equal(run({ last: 'Opraveno. Kontrola nastavení ukazuje ok.' }), ''); });
test('allow: a Quick goal with many calls', () => { assert.equal(run({ g: 'Quick: list the articles' }), ''); });
test('allow: missing or stale goal file at Stop (the start gate owns it)', () => {
  const env = setup(goal('- [ ] do y')); fs.rmSync(path.join(env.home, '.claude', 'goals', 's1.md'));
  assert.equal(run({ env }), '');
});
// Waiting steps (cases 1-6): the harness wakes the session when the task ends; a block only rewords "I wait".
test('allow: a step that waits for a background task or a monitor (case 2-4)', () => {
  assert.equal(run({ g: goal('- [~] safe merge — waits for background b0wpwvv84') }), '');
  assert.equal(run({ g: goal('- [ ] live check — waits for monitor bmnfx29ux') }), '');
});
test('allow: a step that waits for an agent (case 1)', () => { assert.equal(run({ g: goal('- [ ] read its result — waits for agent worker-auditor-research') }), ''); });
// Real catches (cases 7, 8): an open step with no wait still blocks, once per message of Boss.
test('block: an open step with no wait (case 7)', () => {
  const out = JSON.parse(run({ g: goal('- [ ] read the sensors live after the deploy and report') }));
  assert.equal(out.decision, 'block'); assert.match(out.reason, /1 open step/);
});
test('block once: the second Stop of the same message of Boss passes', () => {
  const env = setup(goal('- [ ] do y'));
  assert.equal(JSON.parse(run({ env })).decision, 'block');
  assert.equal(run({ env }), '');
});
test('allow: a turn that already continues for a Stop hook (stop_hook_active)', () => { assert.equal(run({ g: goal('- [ ] do y'), active: true }), ''); });
test('allow: an open step with a Boss-only decision', () => {
  assert.equal(run({ g: goal('- [ ] do y').replace('## Boss-only decision\n', '## Boss-only decision\nspend 20 USD on ads?\n') }), '');
});
