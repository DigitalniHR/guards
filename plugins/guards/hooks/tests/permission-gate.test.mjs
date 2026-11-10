// node --test hooks/tests/permission-gate.test.mjs  (system#206): documents today's behaviour of permission-gate.mjs
import test from 'node:test'; import assert from 'node:assert'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'permission-gate.mjs');
const run = (stdin) => spawnSync('node', [hook], { input: stdin, encoding: 'utf8' });
const bash = (command) => run(JSON.stringify({ tool_name: 'Bash', tool_input: { command } }));
const decision = (r) => JSON.parse(r.stdout).hookSpecificOutput;

test('a normal command is allowed', () => {
  const r = bash('ls -la'); assert.equal(r.status, 0);
  assert.deepEqual(decision(r), { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } });
});
test('a non-Bash tool is allowed', () => { assert.equal(decision(run(JSON.stringify({ tool_name: 'Read', tool_input: {} }))).decision.behavior, 'allow'); });
test('a command from the deny list is denied with a reason', () => {
  const r = bash('git push --force origin main'); assert.equal(r.status, 0);
  const d = decision(r).decision; assert.equal(d.behavior, 'deny'); assert.match(d.message, /^Blocked by Boss policy: .*Boss does this in the UI\.$/);
});
test('railway up and gh pr close are left to the normal prompt (no output)', () => {
  for (const c of ['railway up', 'railway redeploy', 'gh pr close 5']) { const r = bash(c); assert.equal(r.status, 0, c); assert.equal(r.stdout, '', c); }
});
test('broken input: empty stdin is treated as {} and allowed', () => { const r = run(''); assert.equal(r.status, 0); assert.equal(decision(r).decision.behavior, 'allow'); });
test('broken input: bad JSON throws (exit 1, no stdout); hooks.json sets onFailure block', () => {
  const r = run('not json'); assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.match(r.stderr, /SyntaxError/);
});
