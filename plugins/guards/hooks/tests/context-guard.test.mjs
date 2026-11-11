// node --test hooks/tests/context-guard.test.mjs  (CCO, 11 Nov 2026): the reminder of context-guard.mjs from 200 k tokens.
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { lastContext, reminder } from '../context-guard.mjs';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'context-guard.mjs');
const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'context-'));
const run = (h, stdin) => spawnSync('node', [hook], { input: stdin, env: { ...process.env, HOME: h }, encoding: 'utf8' });
const line = (ctx, type = 'assistant') => JSON.stringify({ type, message: { usage: { input_tokens: 1000, cache_creation_input_tokens: 2000, cache_read_input_tokens: ctx - 3000 } } });
const transcript = (h, ...lines) => { const f = path.join(h, 't.jsonl'); fs.writeFileSync(f, lines.join('\n') + '\n'); return f; };
const msg = (h, extra = {}) => JSON.stringify({ session_id: 's1', transcript_path: path.join(h, 't.jsonl'), ...extra });
const stepFile = (h) => path.join(h, '.claude', 'logs', 'compactions', 's1.context');

test('lastContext sums the usage of the last assistant line and skips other lines', () => {
  assert.equal(lastContext([line(50_000), JSON.stringify({ type: 'user' }), 'not json', ''].join('\n')), 50_000);
  assert.equal(lastContext('{"type":"user"}\n'), 0);
});
test('under 200 k: silent, exit 0, no step file', () => {
  const h = home(); transcript(h, line(199_000)); const r = run(h, msg(h));
  assert.equal(r.status, 0); assert.equal(r.stdout, ''); assert.equal(fs.existsSync(stepFile(h)), false);
});
test('at 200 k: one reminder as additionalContext, then silence until the next 100 k step', () => {
  const h = home(); transcript(h, line(201_000));
  const r = run(h, msg(h)); assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.equal(out.hookSpecificOutput.additionalContext, reminder(201_000));
  assert.match(out.hookSpecificOutput.additionalContext, /^The context of this session is 201 k tokens.*one task, one session/);
  assert.equal(fs.readFileSync(stepFile(h), 'utf8'), '2');
  transcript(h, line(260_000)); assert.equal(run(h, msg(h)).stdout, '');
  transcript(h, line(310_000)); assert.match(run(h, msg(h)).stdout, /310 k tokens/);
  assert.equal(fs.readFileSync(stepFile(h), 'utf8'), '3');
});
test('a subagent, a missing transcript, no session id and bad input are silent with exit 0', () => {
  const h = home(); transcript(h, line(400_000));
  for (const s of [msg(h, { agent_id: 'a1' }), msg(h, { transcript_path: path.join(h, 'none.jsonl') }), JSON.stringify({ transcript_path: path.join(h, 't.jsonl') }), '', 'not json']) {
    const r = run(h, s); assert.equal(r.status, 0, s); assert.equal(r.stdout, '', s);
  }
});
test('only the tail of a long transcript is read; the last assistant line counts', () => {
  const h = home(); const filler = JSON.stringify({ type: 'user', message: { content: 'x'.repeat(5000) } });
  transcript(h, line(900_000), ...Array(300).fill(filler), line(150_000)); assert.equal(run(h, msg(h)).stdout, '');
  transcript(h, ...Array(300).fill(filler), line(250_000)); assert.match(run(h, msg(h)).stdout, /250 k tokens/);
});
