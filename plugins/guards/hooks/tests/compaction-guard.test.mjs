// node --test hooks/tests/compaction-guard.test.mjs  (system#206): documents today's behaviour of compaction-guard.mjs
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'compaction-guard.mjs');
const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'compaction-'));
const run = (h, stdin) => spawnSync('node', [hook], { input: stdin, env: { ...process.env, HOME: h }, encoding: 'utf8' });
const countFile = (h, id) => path.join(h, '.claude', 'logs', 'compactions', `${id}.count`);
const msg = (id) => JSON.stringify({ session_id: id });

test('first and second compaction: count is stored, no output', () => {
  const h = home();
  for (const n of [1, 2]) { const r = run(h, msg('s1')); assert.equal(r.status, 0); assert.equal(r.stdout, ''); assert.equal(fs.readFileSync(countFile(h, 's1'), 'utf8'), String(n)); }
});
test('third compaction: the reminder to start a new session', () => {
  const h = home(); run(h, msg('s1')); run(h, msg('s1'));
  const r = run(h, msg('s1')); assert.equal(r.status, 0);
  assert.match(r.stdout, /^This session has had 3 compactions\. Finish the current task here\./);
  assert.equal(run(h, msg('s1')).stdout.includes('had 4 compactions'), true);
});
test('sessions are counted apart; unsafe characters are stripped from the file name', () => {
  const h = home(); run(h, msg('a/../b')); run(h, msg('c'));
  assert.equal(fs.readFileSync(countFile(h, 'ab'), 'utf8'), '1'); assert.equal(fs.readFileSync(countFile(h, 'c'), 'utf8'), '1');
});
test('broken input: empty stdin and bad JSON exit 0 and count under "unknown"', () => {
  const h = home();
  for (const s of ['', 'not json']) { const r = run(h, s); assert.equal(r.status, 0, JSON.stringify(s)); assert.equal(r.stdout, ''); }
  assert.equal(fs.readFileSync(countFile(h, 'unknown'), 'utf8'), '2');
});
test('broken input: an unreadable count file restarts the count at 1', () => {
  const h = home(); fs.mkdirSync(path.dirname(countFile(h, 's1')), { recursive: true }); fs.writeFileSync(countFile(h, 's1'), 'garbage');
  const r = run(h, msg('s1')); assert.equal(r.status, 0); assert.equal(fs.readFileSync(countFile(h, 's1'), 'utf8'), '1');
});
test('the error of a bad input is named on stderr with the guard name, stdout and exit code unchanged', () => {
  const r = run(home(), 'not json'); assert.equal(r.status, 0); assert.equal(r.stdout, ''); assert.match(r.stderr, /^compaction-guard: .+\n$/);
});
test('a missing count file (first compaction) writes nothing on stderr', () => { assert.equal(run(home(), msg('s9')).stderr, ''); });
