// node --test hooks/tests/forbidden-commands.test.mjs  (system#97)
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'forbidden-commands.mjs');
// A fake gh as in a cloud session (system#293): every call but `gh api` gets HTTP 403; `gh api <route>` logs the route
// and prints $FAKE_PRS (the closed PRs of the branch on GitHub, REST shape), default none.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-'));
const fakeGh = path.join(tmp, 'gh'); const ghLog = path.join(tmp, 'gh.log');
fs.writeFileSync(fakeGh, `#!/bin/sh\n[ "$1" = api ] || { echo 'HTTP 403' >&2; exit 1; }\necho "$2" >> '${ghLog}'\nprintf "%s" "\${FAKE_PRS:-[]}"\n`); fs.chmodSync(fakeGh, 0o755);
function run(command, cwd, prs) {
  return spawnSync('node', [hook], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd }), encoding: 'utf8',
    env: { ...process.env, FORBIDDEN_GH: fakeGh, FAKE_PRS: prs ? JSON.stringify(prs) : '' } });
}
// A repository with origin/main, a branch merged into it and a branch with its own commit.
const bare = path.join(tmp, 'origin.git'); const repo = path.join(tmp, 'repo');
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env });
execFileSync('git', ['init', '-q', '--bare', bare]);
execFileSync('git', ['init', '-q', '-b', 'main', repo]);
fs.writeFileSync(path.join(repo, 'a.txt'), 'a'); git('add', 'a.txt'); git('commit', '-q', '-m', 'a');
git('remote', 'add', 'origin', bare); git('push', '-q', '-u', 'origin', 'main');
git('branch', 'done'); git('checkout', '-q', '-b', 'wip'); fs.writeFileSync(path.join(repo, 'b.txt'), 'b'); git('add', 'b.txt'); git('commit', '-q', '-m', 'b'); git('checkout', '-q', 'main');
// A squash merge: branch sq has two commits; main gets their content as one new commit (not an ancestor of sq).
git('checkout', '-q', '-b', 'sq'); fs.writeFileSync(path.join(repo, 'c.txt'), 'c1'); git('add', 'c.txt'); git('commit', '-q', '-m', 'c1');
fs.writeFileSync(path.join(repo, 'c.txt'), 'c2'); git('commit', '-q', '-am', 'c2'); git('checkout', '-q', 'main');
git('checkout', '-q', 'sq', '--', 'c.txt'); git('commit', '-q', '-m', 'squash of sq'); git('push', '-q', 'origin', 'main');

const DEL = 'git branch ' + '-D';
test('a branch merged into origin/main passes', () => { assert.equal(run(`${DEL} done`, repo).status, 0); });
test('an unmerged branch is blocked and named', () => {
  const r = run(`${DEL} wip`, repo); assert.equal(r.status, 2); assert.match(r.stderr, /not merged into origin\/main \(wip\)/);
});
test('a squash-merged branch passes', () => { assert.equal(run(`${DEL} sq`, repo).status, 0); });
// system#183: GitHub squash-merges a branch; the local origin/main is not fetched yet.
test('a branch squash-merged on the remote a second before passes (fetch)', () => {
  git('checkout', '-q', '-b', 'late'); fs.writeFileSync(path.join(repo, 'd.txt'), 'd'); git('add', 'd.txt'); git('commit', '-q', '-m', 'd');
  git('push', '-q', 'origin', 'late'); git('checkout', '-q', 'main');
  const other = path.join(tmp, 'other'); execFileSync('git', ['clone', '-q', '-b', 'main', bare, other]);
  const og = (...a) => execFileSync('git', ['-C', other, ...a], { encoding: 'utf8', env });
  og('checkout', '-q', 'origin/late', '--', 'd.txt'); og('commit', '-q', '-m', 'squash of late'); og('push', '-q', 'origin', 'main');
  const before = git('rev-parse', 'origin/main');
  assert.equal(run(`${DEL} late`, repo).status, 0);
  assert.notEqual(git('rev-parse', 'origin/main'), before);
  const r = run(`${DEL} wip`, repo); assert.equal(r.status, 2); assert.match(r.stderr, /not merged into origin\/main \(wip\)/);
});
test('two names: one unmerged blocks the call', () => { assert.equal(run(`${DEL} done wip`, repo).status, 2); });
test('the words inside a here-doc are data, not a command', () => {
  const cmd = `gh issue create --body "$(cat <<'EOF'\nThe hook blocked ${DEL} 18 times; git push --force is also blocked.\nEOF\n)"`;
  assert.equal(run(cmd, repo).status, 0);
});
test('an unquoted here-doc tag is stripped too', () => { assert.equal(run('cat > x.md <<EOF\ngit reset --hard is forbidden\nEOF', repo).status, 0); });
test('a forbidden command outside the here-doc is still blocked', () => { assert.equal(run('git push --force origin main', repo).status, 2); });
test('git reset --hard stays blocked', () => { assert.equal(run('git reset --hard', repo).status, 2); });

// 8 Nov 2026: the repository comes from `cd <dir> &&` or `git -C <dir>`, not only from the session folder.
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-out-'));
test('cd <repo> && delete of a merged branch passes from a folder outside the repository', () => {
  assert.equal(run(`cd "${repo}" && ${DEL} done`, outside).status, 0);
});
test('cd <repo> && delete of an unmerged branch is blocked from outside', () => {
  assert.equal(run(`cd "${repo}" && ${DEL} wip`, outside).status, 2);
});
test('git -C <repo> delete of a squash-merged branch passes from outside', () => {
  assert.equal(run(`git -C "${repo}" ${DEL.replace('git ', '')} sq`, outside).status, 0);
});
test('cd with an escaped space in the path reads that repository', () => {
  const spaced = fs.mkdtempSync(path.join(os.tmpdir(), 'fc sp-'));
  execFileSync('git', ['clone', '-q', bare, path.join(spaced, 'r')]);
  execFileSync('git', ['-C', path.join(spaced, 'r'), 'branch', 'done2', 'origin/main']);
  const esc = path.join(spaced, 'r').replace(/ /g, '\\ ');
  assert.equal(run(`cd ${esc} && ${DEL} done2`, outside).status, 0);
});

// system#150: a redirect is not a branch name; system#151: outside a repository the block is clear, not a crash.
test('a redirect after the names is not a branch (system#150)', async () => {
  const { deletedBranches } = await import(path.join(path.dirname(hook), 'forbidden-patterns.mjs'));
  assert.deepEqual(deletedBranches(`${DEL} done wip 2>&1 | tail -3`), ['done', 'wip']);
  assert.deepEqual(deletedBranches(`${DEL} done > /tmp/log`), ['done']);
});
test('merged branch plus redirect passes, unmerged plus redirect is blocked (system#150)', () => {
  assert.equal(run(`${DEL} done 2>&1`, repo).status, 0);
  const r = run(`${DEL} wip 2>&1`, repo); assert.equal(r.status, 2); assert.match(r.stderr, /\(wip\)/);
});
test('outside a repository: a clear block, no hook error (system#151)', () => {
  const r = run(`${DEL} done`, outside);
  assert.equal(r.status, 2); assert.doesNotMatch(r.stderr, /hook error/); assert.match(r.stderr, /not a git repository/); assert.ok(r.stderr.includes(outside));
});

// system#291: a squash branch whose file main changed later conflicts in merge-tree; a merged PR on GitHub with
// the same head as the local tip is the proof. A branch with no merged PR or with later work stays blocked.
git('checkout', '-q', '-b', 'sq2'); fs.writeFileSync(path.join(repo, 'e.txt'), 'e1'); git('add', 'e.txt'); git('commit', '-q', '-m', 'e1');
git('checkout', '-q', 'main'); git('checkout', '-q', 'sq2', '--', 'e.txt'); git('commit', '-q', '-m', 'squash of sq2');
fs.writeFileSync(path.join(repo, 'e.txt'), 'e-later'); git('commit', '-q', '-am', 'later change of e'); git('push', '-q', 'origin', 'main');
const sq2tip = git('rev-parse', 'sq2').trim();
test('squash branch with a later change on main: blocked by git alone (system#291)', () => {
  const r = run(`${DEL} sq2`, repo); assert.equal(r.status, 2); assert.match(r.stderr, /\(sq2\)/);
});
test('squash branch with a merged PR of the same head passes (system#291)', () => {
  fs.rmSync(ghLog, { force: true });
  assert.equal(run(`${DEL} sq2`, repo, [{ merged_at: null, head: { sha: 'f'.repeat(40) } }, { merged_at: '2026-11-10T22:00:00Z', head: { sha: sq2tip } }]).status, 0);
  assert.match(fs.readFileSync(ghLog, 'utf8'), /^repos\/[^/]+\/origin\/pulls\?state=closed&per_page=100&head=[^&]+%3Asq2$/m);
});
test('a closed PR of the same head that is not merged stays blocked (system#293)', () => {
  assert.equal(run(`${DEL} sq2`, repo, [{ merged_at: null, head: { sha: sq2tip } }]).status, 2);
});
test('a branch with no merged PR stays blocked (system#291)', () => {
  assert.equal(run(`${DEL} wip`, repo, []).status, 2);
});
// system#516: a command that merges and then deletes is judged before the merge; an open PR of the same head is the proof.
test('merge then delete in one command: an open PR of the same head passes (system#516)', () => {
  fs.rmSync(ghLog, { force: true });
  assert.equal(run(`gh pr merge 7 --squash --delete-branch 2>&1 | tail -2; ${DEL} sq2`, repo, [{ state: 'open', merged_at: null, head: { sha: sq2tip } }]).status, 0);
  assert.match(fs.readFileSync(ghLog, 'utf8'), /pulls\?state=open&per_page=100&head=[^&]+%3Asq2$/m);
  assert.equal(run(`bash engineers/safe_merge.sh system 7 && ${DEL} sq2`, repo, [{ state: 'open', merged_at: null, head: { sha: sq2tip } }]).status, 0);
});
test('an open PR of the same head with no merge step before the delete stays blocked (system#516)', () => {
  assert.equal(run(`${DEL} sq2`, repo, [{ state: 'open', merged_at: null, head: { sha: sq2tip } }]).status, 2);
  assert.equal(run(`${DEL} sq2; gh pr merge 7 --squash`, repo, [{ state: 'open', merged_at: null, head: { sha: sq2tip } }]).status, 2);
});
test('merge then delete: a closed unmerged PR, no PR, or an open PR of another head stays blocked (system#516)', () => {
  assert.equal(run(`gh pr merge 7 --squash; ${DEL} sq2`, repo, [{ state: 'closed', merged_at: null, head: { sha: sq2tip } }]).status, 2);
  assert.equal(run(`gh pr merge 7 --squash; ${DEL} wip`, repo, []).status, 2);
  assert.equal(run(`gh pr merge 7 --squash; ${DEL} sq2`, repo, [{ state: 'open', merged_at: null, head: { sha: 'f'.repeat(40) } }]).status, 2);
});
test('a branch with later work than its merged PR stays blocked (system#291)', () => {
  git('checkout', '-q', 'sq2'); fs.writeFileSync(path.join(repo, 'e.txt'), 'e2'); git('commit', '-q', '-am', 'e2'); git('checkout', '-q', 'main');
  const r = run(`${DEL} sq2`, repo, [{ merged_at: '2026-11-10T22:00:00Z', head: { sha: sq2tip } }]); assert.equal(r.status, 2); assert.match(r.stderr, /\(sq2\)/);
});

// A label delete is hard to undo (system#515): blocked; a remove of a label from one issue passes.
test('a label delete is blocked; a remove from one issue passes', () => {
  for (const c of ['gh label delete review -R a/b --yes', 'gh api -X DELETE repos/a/b/labels/review', 'gh api repos/a/b/labels/review -X DELETE'])
    assert.equal(run(c, tmp).status, 2, c);
  for (const c of ['gh api -X DELETE repos/a/b/issues/4/labels/review', 'gh label list -R a/b', 'git push origin main'])
    assert.equal(run(c, tmp).status, 0, c);
});
