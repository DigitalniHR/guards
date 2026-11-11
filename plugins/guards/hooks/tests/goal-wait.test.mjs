// node --test hooks/tests/goal-wait.test.mjs  (system#302): a goal step may wait for a named running session
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const hook = path.join(here, '..', 'goal-stop.mjs');
const base = 'Said: fix x\nWants: x works for Boss\nCause: class y\nExists: none found: rg y\nResearch: mechanical: rename a file\nDesign: mechanical: one line\nDone when: page shows y\nProof: test passes\nBoss acts: none\n## Steps\n- [x] start the session — local_abcd1234 started\nSTEP\n## Boss-only decision\n';
const waiting = base.replace('STEP', '- [~] open the results and report — waits for local_abcd1234');

// session: null = the app does not know it; else the fields of its file in claude-code-sessions/<account>/<org>/.
function run({ goal = waiting, session = null, last = 'Waiting for the session; I report when it ends.' } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'goal-wait-'));
  const dir = path.join(home, '.claude', 'goals'); fs.mkdirSync(dir, { recursive: true });
  const sessions = path.join(home, 'sessions'), org = path.join(sessions, 'acct', 'org'); fs.mkdirSync(org, { recursive: true });
  if (session) fs.writeFileSync(path.join(org, 'local_abcd1234-0000-4000-8000-000000000000.json'), JSON.stringify(session));
  const pf = path.join(dir, 's1.prompt'), gf = path.join(dir, 's1.md');
  fs.writeFileSync(pf, 'fix x'); fs.writeFileSync(gf, goal);
  const t = Date.now() / 1000; fs.utimesSync(pf, t - 100, t - 100); fs.utimesSync(gf, t, t);
  const lines = [JSON.stringify({ type: 'user', message: { content: 'fix x' } })];
  for (let i = 0; i < 5; i++) lines.push(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } }));
  const tp = path.join(home, 't.jsonl'); fs.writeFileSync(tp, lines.join('\n') + '\n');
  const r = spawnSync('node', [hook], { input: JSON.stringify({ session_id: 's1', transcript_path: tp, last_assistant_message: last }), env: { ...process.env, HOME: home, GOAL_SESSIONS_DIR: sessions }, encoding: 'utf8' });
  return r.stdout.trim();
}
const midTurn = () => ({ isArchived: false, lastAssistantUuid: 'b', postTurnSummaryFor: 'a', lastActivityAt: Date.now() });

test('parse: "- [~] <step> — waits for local_<id>" is a waiting step with its sessions, not an open step', async () => {
  const { parseGoal } = await import(path.join(here, '..', 'goal-lib.mjs'));
  const g = parseGoal(base.replace('STEP', '- [~] report — waits for local_abcd1234, local_EF56789a.'));
  assert.deepEqual(g.open, []); assert.equal(g.missing.Steps, undefined);
  assert.deepEqual(g.waiting, [{ step: 'report — waits for local_abcd1234, local_EF56789a.', sessions: ['local_abcd1234', 'local_ef56789a'] }]);
});
test('allow: the named session is in mid-turn', () => {
  assert.equal(run({ session: midTurn() }), '');
});
test('block: the named session is at the end of its turn', () => {
  const out = JSON.parse(run({ session: { ...midTurn(), postTurnSummaryFor: 'b' } }));
  assert.equal(out.decision, 'block'); assert.match(out.reason, /sessions it waits for have ended/);
});
test('block: the named session is archived', () => {
  const out = JSON.parse(run({ session: { ...midTurn(), isArchived: true } }));
  assert.equal(out.decision, 'block'); assert.match(out.reason, /open the results and report/);
});
test('block: the app does not know the named session', () => {
  assert.equal(JSON.parse(run()).decision, 'block');
});
test('block: a waiting step that names no session is an open step', () => {
  const out = JSON.parse(run({ goal: base.replace('STEP', '- [~] report later'), session: midTurn() }));
  assert.equal(out.decision, 'block'); assert.match(out.reason, /report later/);
});
test('block: no activity for 2 hours and no summary counts as ended', () => {
  assert.equal(JSON.parse(run({ session: { ...midTurn(), lastActivityAt: Date.now() - 3 * 3600 * 1000 } })).decision, 'block');
});
