// SessionStart (compact): counts the compactions of a session. From the third one, it reminds the model of the rule
// "one task, one session" (global CLAUDE.md): each compaction loses detail Boss must explain again, and a long session
// re-reads its whole history on every request (audit 28 Oct 2026: 2 sessions with 20+ compactions used 3.5B tokens).
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
// Errors go to stderr (system#206). Claude Code never shows the stderr of a hook that exits 0 to the model (hooks docs, read 9 Nov 2026), so session, stdout and exit code stay as before.
const warn = (e) => process.stderr.write(`compaction-guard: ${e && e.message ? e.message : e}\n`);
let input = {}; try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (e) { warn(e); }
const dir = path.join(os.homedir(), '.claude', 'logs', 'compactions');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${(input.session_id || 'unknown').replace(/[^\w-]/g, '')}.count`);
let n = 0; try { n = parseInt(fs.readFileSync(file, 'utf8'), 10) || 0; } catch (e) { if (e.code !== 'ENOENT') warn(e); }   // no file = first compaction
fs.writeFileSync(file, String(++n));
if (n >= 3) console.log(`This session has had ${n} compactions. Finish the current task here. For a new task that does not build on this one, propose a new session with a short brief (hand_off_to_session or start_session) instead of starting it here.`);
