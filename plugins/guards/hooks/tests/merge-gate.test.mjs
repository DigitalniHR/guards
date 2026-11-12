// node --test hooks/tests/merge-gate.test.mjs  (system#169)
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { merges, verdict, bucketOf, freshFor, FRESH_MS } from '../merge-gate.mjs';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'merge-gate.mjs');
// A fake gh: `pr view` prints $FAKE_PR; every other call prints $FAKE_CHECKS and exits $FAKE_EXIT; FAKE_ERR goes to stderr.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
const fake = path.join(tmp, 'gh');
fs.writeFileSync(fake, '#!/bin/sh\nif [ "$2" = view ]; then printf "%s" "$FAKE_PR"; exit 0; fi\nprintf "%s" "$FAKE_CHECKS"; [ -n "$FAKE_ERR" ] && printf "%s" "$FAKE_ERR" >&2; exit "${FAKE_EXIT:-0}"\n'); fs.chmodSync(fake, 0o755);
const OLD_PR = JSON.stringify({ createdAt: '2026-01-01T00:00:00Z', commits: [{ committedDate: '2026-01-01T00:00:00Z' }] });
function run(input, checks, exit = 0, err = '', pr = OLD_PR) {
  return spawnSync('node', [hook], { input: JSON.stringify({ cwd: tmp, ...input }), encoding: 'utf8',
    env: { ...process.env, MERGE_GATE_GH: fake, FAKE_CHECKS: checks, FAKE_EXIT: String(exit), FAKE_ERR: err, FAKE_PR: pr } });
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
test('freshFor: the wait left after the last of open and push', () => {
  const now = Date.parse('2026-11-12T05:47:36Z');
  assert.equal(freshFor(['2026-11-12T05:47:30Z', '2026-11-12T05:47:26Z'], now), FRESH_MS - 6000);
  assert.equal(freshFor(['2026-11-12T05:00:00Z'], now), 0);
  assert.equal(freshFor([undefined, null], now), 0);
});
test('a PR with no checks, opened seconds ago, is blocked (studio#500)', () => {
  const pr = JSON.stringify({ createdAt: new Date(Date.now() - 6000).toISOString(), commits: [] });
  const r = run(bash('gh pr merge 500 -R DigitalniHR/studio --squash'), '', 1, 'no checks reported on the branch', pr);
  assert.equal(r.status, 2); assert.match(r.stderr, /DigitalniHR\/studio#500 has no checks yet/);
});
test('an old PR with a commit pushed seconds ago and no checks is blocked', () => {
  const pr = JSON.stringify({ createdAt: '2026-01-01T00:00:00Z', commits: [{ committedDate: new Date(Date.now() - 20000).toISOString() }] });
  assert.equal(run(bash('gh pr merge 5'), '', 1, 'no checks reported on the branch', pr).status, 2);
});
test('a gh error blocks (fail closed)', () => { assert.equal(run(bash('gh pr merge 5'), '', 1, 'HTTP 502').status, 2); });
test('a command with no merge passes without gh', () => { assert.equal(run(bash('git status'), '', 1, 'HTTP 502').status, 0); });
test('a merge named inside a here-doc is data', () => {
  assert.equal(run(bash("gh issue create --body \"$(cat <<'EOF'\ngh pr merge 5 went through red\nEOF\n)\""), RED, 1).status, 0);
});
test('the MCP merge tool with a red check is blocked', () => {
  const r = run({ tool_name: 'mcp__852672da__merge_pull_request', tool_input: { owner: 'DigitalniHR', repo: 'dhr', pullNumber: 831 } }, RED, 1);
  assert.equal(r.status, 2);
});

// A fake gh for a cloud session: `gh pr checks` fails with the GraphQL error, `gh api` answers from REST.
const cloud = path.join(tmp, 'gh-cloud');
fs.writeFileSync(cloud, '#!/bin/sh\nif [ "$1" = pr ]; then echo "HTTP 403: GitHub GraphQL is not available" >&2; exit 1; fi\ncase "$2" in *check-runs*) printf "%s" "$FAKE_RUNS";; *) printf \'{"head":{"sha":"abc"}}\';; esac\n'); fs.chmodSync(cloud, 0o755);
function runCloud(input, runs) {
  return spawnSync('node', [hook], { input: JSON.stringify({ cwd: tmp, ...input }), encoding: 'utf8',
    env: { ...process.env, MERGE_GATE_GH: cloud, FAKE_RUNS: JSON.stringify({ check_runs: runs }) } });
}
const mcp = { tool_name: 'mcp__github__merge_pull_request', tool_input: { owner: 'DigitalniHR', repo: 'system', pullNumber: 195 } };
test('bucketOf maps REST check runs', () => {
  assert.equal(bucketOf({ status: 'in_progress' }), 'pending');
  assert.equal(bucketOf({ status: 'completed', conclusion: 'failure' }), 'fail');
  assert.equal(bucketOf({ status: 'completed', conclusion: 'success' }), 'pass');
});
test('cloud: no GraphQL, green REST checks pass', () => {
  assert.equal(runCloud(mcp, [{ name: 'scripts', status: 'completed', conclusion: 'success' }]).status, 0);
});
test('cloud: no GraphQL, a red REST check blocks', () => {
  const r = runCloud(mcp, [{ name: 'cause-and-research', status: 'completed', conclusion: 'failure' }]);
  assert.equal(r.status, 2); assert.match(r.stderr, /red checks \(cause-and-research\)/);
});
test('cloud: no GraphQL, a running REST check blocks', () => {
  assert.equal(runCloud(mcp, [{ name: 'scripts', status: 'in_progress' }]).status, 2);
});
test('cloud: no GraphQL, a merge without a PR number still blocks (fail closed)', () => {
  assert.equal(runCloud(bash('gh pr merge --squash'), []).status, 2);
});
