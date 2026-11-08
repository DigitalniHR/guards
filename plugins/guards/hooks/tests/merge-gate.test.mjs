// node --test hooks/tests/merge-gate.test.mjs  (system#169)
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { merges, verdict } from '../merge-gate.mjs';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'merge-gate.mjs');
// A fake gh: prints $FAKE_CHECKS and exits $FAKE_EXIT; FAKE_ERR goes to stderr.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
const fake = path.join(tmp, 'gh');
fs.writeFileSync(fake, '#!/bin/sh\nprintf "%s" "$FAKE_CHECKS"; [ -n "$FAKE_ERR" ] && printf "%s" "$FAKE_ERR" >&2; exit "${FAKE_EXIT:-0}"\n'); fs.chmodSync(fake, 0o755);
function run(input, checks, exit = 0, err = '') {
  return spawnSync('node', [hook], { input: JSON.stringify({ cwd: tmp, ...input }), encoding: 'utf8',
    env: { ...process.env, MERGE_GATE_GH: fake, FAKE_CHECKS: checks, FAKE_EXIT: String(exit), FAKE_ERR: err } });
}
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const RED = JSON.stringify([{ name: 'cause-and-research', bucket: 'fail' }, { name: 'tests', bucket: 'pass' }]);
const GREEN = JSON.stringify([{ name: 'cause-and-research', bucket: 'pass' }, { name: 'docs', bucket: 'skipping' }]);
const RUNNING = JSON.stringify([{ name: 'tests', bucket: 'pending' }]);

test('merges: number, repo flag and cd dir', () => {
  assert.deepEqual(merges('cd "/a b" && gh pr merge 831 -R DigitalniHR/dhr --squash'), [{ ref: '831', repo: 'DigitalniHR/dhr', dir: '/a b' }]);
  assert.deepEqual(merges('gh pr merge --squash --repo=o/r 5'), [{ ref: '5', repo: 'o/r', dir: null }]);
  assert.deepEqual(merges('gh pr merge --squash --delete-branch'), [{ ref: null, repo: null, dir: null }]);
  assert.deepEqual(merges('gh pr merge -t "x" 7 2>&1'), [{ ref: '7', repo: null, dir: null }]);
  assert.deepEqual(merges('gh api -X PUT repos/o/r/pulls/9/merge'), [{ ref: '9', repo: 'o/r', dir: null }]);
  assert.deepEqual(merges('gh pr view 5 && git status'), []);
});
test('verdict: red, running, green', () => {
  assert.deepEqual(verdict(JSON.parse(RED)), { red: ['cause-and-research'], running: [] });
  assert.deepEqual(verdict(JSON.parse(GREEN)), { red: [], running: [] });
});
test('a merge with a red check is blocked and the check is named', () => {
  const r = run(bash('gh pr merge 831 -R DigitalniHR/dhr --squash'), RED, 1);
  assert.equal(r.status, 2); assert.match(r.stderr, /DigitalniHR\/dhr#831 has red checks \(cause-and-research\)/);
});
test('a merge with a running check is blocked', () => { assert.equal(run(bash('gh pr merge 5 --squash'), RUNNING, 8).status, 2); });
test('a merge with green checks passes', () => { assert.equal(run(bash('gh pr merge 5 --squash'), GREEN).status, 0); });
test('a PR with no checks passes', () => { assert.equal(run(bash('gh pr merge 5'), '', 1, 'no checks reported on the branch').status, 0); });
test('a gh error blocks (fail closed)', () => { assert.equal(run(bash('gh pr merge 5'), '', 1, 'HTTP 502').status, 2); });
test('a command with no merge passes without gh', () => { assert.equal(run(bash('git status'), '', 1, 'HTTP 502').status, 0); });
test('a merge named inside a here-doc is data', () => {
  assert.equal(run(bash("gh issue create --body \"$(cat <<'EOF'\ngh pr merge 5 went through red\nEOF\n)\""), RED, 1).status, 0);
});
test('the MCP merge tool with a red check is blocked', () => {
  const r = run({ tool_name: 'mcp__852672da__merge_pull_request', tool_input: { owner: 'DigitalniHR', repo: 'dhr', pullNumber: 831 } }, RED, 1);
  assert.equal(r.status, 2);
});
