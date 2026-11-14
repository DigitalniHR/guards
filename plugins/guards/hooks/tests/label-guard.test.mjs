// node --test hooks/tests/label-guard.test.mjs  (system#515)
import test from 'node:test'; import assert from 'node:assert'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { reason, written, LIST, DELETE } from '../label-guard.mjs';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'label-guard.mjs');
const run = (tool_name, tool_input) => spawnSync('node', [hook], { input: JSON.stringify({ tool_name, tool_input }), encoding: 'utf8' });

test('the list has the canonical labels once each, with a color', () => {
  const names = LIST.canonical.map((l) => l.name);
  assert.ok(names.includes('in-progress') && names.includes('engineer:mac'));
  assert.equal(new Set(names).size, names.length);
  assert.ok(LIST.canonical.every((l) => /^[0-9a-f]{6}$/.test(l.color) && l.description));
});

test('canonical, family and default names pass; others and old names are blocked', () => {
  for (const n of ['in-progress', 'Status:Review', 'chapter:growth', 'client:acme', 'small', 'bug', 'good first issue', '$p']) assert.equal(reason(n), null, n);
  assert.match(reason('status:in-progress'), /old name; write "in-progress"/);
  assert.match(reason('review'), /write "status:review"/);
  assert.match(reason('needs-review'), /not in the label list/);
  assert.match(reason('chapter:'), /not in the label list/);
});

test('the names a command writes', () => {
  assert.deepEqual(written('gh issue create -R DigitalniHR/system --title t --label in-progress,foo --body x'), ['in-progress', 'foo']);
  assert.deepEqual(written('gh issue edit 5 --add-label "a b" --remove-label c'), ['a b']);
  assert.deepEqual(written("gh api -X POST repos/DigitalniHR/system/issues/5/labels -f 'labels[]=engineer:cloud' -f \"labels[]=$p\""), ['engineer:cloud', '$p']);
  assert.deepEqual(written('gh api repos/o/r/labels -f name=new-one -f color=ffffff'), ['new-one']);
  assert.deepEqual(written('gh label create bar --color 000000 && gh label edit bar --name baz'), ['bar', 'baz']);
  assert.deepEqual(written('gh api -X DELETE repos/o/r/issues/5/labels/foo'), []);
  assert.deepEqual(written("gh api repos/o/r/issues/5 --jq '[.labels[].name]'"), []);
  assert.deepEqual(written('git commit -m "--label foo"'), []);
});

test('a label delete is blocked; the remove of a label from one issue passes', () => {
  assert.deepEqual(written('gh label delete later --yes'), [DELETE]);
  assert.deepEqual(written('gh api -X DELETE repos/DigitalniHR/dhr/labels/status:in-progress'), [DELETE]);
  assert.deepEqual(written('gh api -X DELETE repos/DigitalniHR/dhr/issues/9/labels/later'), []);
  assert.match(reason(DELETE), /Boss decision/);
});

test('the hook blocks a label outside the list from Bash and from the connector', () => {
  const r = run('Bash', { command: 'gh issue edit 5 --add-label needs-review' });
  assert.equal(r.status, 2); assert.match(r.stderr, /label-guard.*needs-review/);
  assert.equal(run('mcp__github__issue_write', { method: 'update', owner: 'o', repo: 'r', issue_number: 1, labels: ['in-progress', 'status:in-progress'] }).status, 2);
});

test('the hook passes a canonical label, a remove and other tools', () => {
  assert.equal(run('Bash', { command: 'gh issue create --label in-progress --title t --body b' }).status, 0);
  assert.equal(run('Bash', { command: 'gh api -X DELETE repos/o/r/issues/5/labels/in-progress' }).status, 0);
  assert.equal(run('mcp__github__issue_write', { method: 'update', owner: 'o', repo: 'r', issue_number: 1, labels: ['auditor', 'chapter:growth'] }).status, 0);
  assert.equal(run('Read', { file_path: '/x' }).status, 0);
});
