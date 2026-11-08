// node --test hooks/tests/refresh.test.mjs  (system#169: a new guard reaches the Mac settings)
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { missing } from '../refresh.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const hook = path.join(dir, 'refresh.mjs');
const env = { ...process.env }; delete env.CLAUDE_CODE_REMOTE;
const run = (settings) => spawnSync('node', [hook], { input: '{}', encoding: 'utf8', env: { ...env, GUARDS_SETTINGS: settings } });

test('missing: names a hook of hooks.json that the settings do not hold', () => {
  const hj = { hooks: { PreToolUse: [{ hooks: [{ command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/a.mjs"' }, { command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/b.mjs"' }] }] } };
  const text = JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ command: 'node "/d/a.mjs"' }] }] } });
  assert.deepEqual(missing(hj, text, '/d'), ['node "/d/b.mjs"']);
});
test('on the Mac a settings file without a guard gets every guard', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-')); const s = path.join(tmp, 'settings.json');
  fs.writeFileSync(s, JSON.stringify({ model: 'x', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo own' }] }] } }));
  assert.equal(run(s).status, 0);
  const text = fs.readFileSync(s, 'utf8');
  assert.match(text, /merge-gate\.mjs/); assert.match(text, /echo own/); assert.match(text, /"model": "x"/);
  assert.deepEqual(missing(JSON.parse(fs.readFileSync(path.join(dir, 'hooks.json'), 'utf8')), text, dir), []);
});
test('a complete settings file is not written again', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-')); const s = path.join(tmp, 'settings.json');
  run(s); const before = fs.readFileSync(s, 'utf8'); fs.writeFileSync(s, before.replace('\n', '\n ')); // a mark install would remove
  assert.equal(run(s).status, 0); assert.equal(fs.readFileSync(s, 'utf8'), before.replace('\n', '\n '));
});
