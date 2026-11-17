// node --test plugins/guards/hooks/tests/roadmap-lines.test.mjs  (system#739, check I4 at the write)
import test from 'node:test'; import assert from 'node:assert'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { blockReason, badLine, isRoadmapFile } from '../roadmap-lines.mjs';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'roadmap-lines.mjs');
const run = (tool_name, tool_input) => spawnSync('node', [hook], { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input }), encoding: 'utf8' });
const F = '/r/system/roadmap/web.md';

test('an Epic line with a state and no issue is refused (exit 2, the message)', () => {
  for (const s of ['  WEB-25 ◐ New landing page', '  WEB-25 In progress: new landing page', '  WEB-25 Now: landing']) {
    const r = run('Write', { file_path: F, content: `# Web\n${s}\n` });
    assert.equal(r.status, 2, s); assert.match(r.stderr, /names its issue/); assert.match(r.stderr, /I4/);
  }
  assert.equal(run('Edit', { file_path: F, old_string: 'a', new_string: '  WEB-25 ● x' }).status, 2);
  assert.equal(run('MultiEdit', { file_path: '/r/ROADMAP.md', edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: '  SYS-3 ◐ x' }] }).status, 2);
});

test('an Epic line with #N is allowed', () => {
  assert.equal(run('Write', { file_path: F, content: '  WEB-25 #223 ◐ New landing page\n' }).status, 0);
});

test('a Later line with no state and no #N is allowed', () => {
  assert.equal(run('Write', { file_path: F, content: '  WEB-26 A page for later\n' }).status, 0);
});

test('a file that is no roadmap file is ignored', () => {
  assert.equal(run('Write', { file_path: '/r/system/docs/web.md', content: '  WEB-25 ◐ x\n' }).status, 0);
  assert.equal(blockReason({ file_path: '/r/roadmap/web.txt', content: '  WEB-25 ◐ x' }), null);
});

test('helpers', () => {
  assert.ok(isRoadmapFile('/a/roadmap/x.md') && isRoadmapFile('/a/ROADMAP.md') && !isRoadmapFile('/a/roadmap/sub/x.txt'));
  assert.equal(badLine('WEB-25 ◐ not indented'), null);
  assert.equal(badLine('  WEB-25 #1 ◐ x'), null);
});
