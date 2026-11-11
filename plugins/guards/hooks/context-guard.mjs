// PostToolUse (every tool): when the context of a session passes 200 k tokens, reminds the model of the rule
// "one task, one session" (global CLAUDE.md), once per 100 k step (200 k, 300 k, ...). A session on a 1M model never
// compacts, so compaction-guard.mjs never fires, and every request re-reads the whole history: on 10 Nov 2026, 51 % of
// the weighted tokens of the day came from requests above 200 k of context (CCO, 11 Nov 2026). Reads the last
// assistant usage from the tail of the transcript; a subagent, a broken input or a missing transcript exits 0 silent.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

export const LIMIT = 200_000;          // the first reminder
export const STEP = 100_000;           // then one reminder per step
const TAIL = 1_000_000;                // bytes of the transcript read from its end

// The context of the last assistant request in the transcript text: input + cache write + cache read; 0 when none.
export function lastContext(text) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    let d; try { d = JSON.parse(lines[i]); } catch { continue; }
    const u = d && d.type === 'assistant' && d.message && d.message.usage;
    if (!u) continue;
    return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  }
  return 0;
}
export function tail(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size; const len = Math.min(size, TAIL); const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len); return buf.toString('utf8');
  } finally { fs.closeSync(fd); }
}
export function reminder(ctx) {
  return `The context of this session is ${Math.round(ctx / 1000)} k tokens; every request re-reads all of it. Finish the current task here, then stop. Do not start new work here: hand off the next task with a short brief to a fresh session (one task, one session).`;
}

const main = () => {
  let input = {}; try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return; }
  if (!input.session_id || input.agent_id || !input.transcript_path) return;
  const ctx = lastContext(tail(input.transcript_path));
  if (ctx < LIMIT) return;
  const step = Math.floor(ctx / STEP);
  const dir = path.join(os.homedir(), '.claude', 'logs', 'compactions');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${String(input.session_id).replace(/[^\w-]/g, '')}.context`);
  let last = 0; try { last = parseInt(fs.readFileSync(file, 'utf8'), 10) || 0; } catch { /* first reminder */ }
  if (step <= last) return;
  fs.writeFileSync(file, String(step));
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: reminder(ctx) } }));
};
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) { try { main(); } catch (e) { process.stderr.write(`context-guard: ${e && e.message ? e.message : e}\n`); } }
