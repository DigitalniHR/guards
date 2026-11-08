// PostToolUse (Write|Edit): when a session writes its goal file, check the format at once and return the missing
// keys, so the session fixes it now and not at a later blocked call (system#54). Never blocks other files; any
// error exits 0.
import { readInput, files, read, parseGoal, FORMAT } from './goal-lib.mjs';

try {
  const input = readInput();
  const target = String((input.tool_input || {}).file_path || '');
  const f = files(input.session_id);
  if (!target || target !== f.goal) process.exit(0);
  const g = parseGoal(read(f.goal));
  const missing = Object.keys(g.missing);
  if (g.quick || !missing.length) process.exit(0);
  process.stderr.write(`The goal file ${f.goal} is incomplete: ${missing.map(k => g.missing[k] === true ? k : `${k} (${g.missing[k]})`).join(', ')}. Fix it now; the goal hook blocks the next tool calls until it is complete. ${FORMAT}`);
  process.exit(2);
} catch { process.exit(0); }
