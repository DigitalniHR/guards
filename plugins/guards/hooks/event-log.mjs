// Notification (permission_prompt) and StopFailure hook: appends one JSON line per
// stall or failed turn to ~/.claude/logs/session-events.jsonl, so a routine that
// waits for an approval or dies on an API error at night is visible next morning.
// The CTO routines read this log by `unit`. Never blocks; output is ignored by Claude Code.
// unit: the repository of the run (dhr, jobboard, studio, system, ...). An app routine names it in its task name
// (dhr-engineer runs in the system checkout; a routine without a folder runs in a scratch workspace), so the name
// of the scheduled task in the first prompt of the transcript wins over the folder (system#465).
import { readFileSync, appendFileSync, mkdirSync, openSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';

const UNITS = ['dhr', 'jobboard', 'studio', 'system', 'lab'];

function routineOf(transcript) {
  if (!transcript) return '';
  try {
    const fd = openSync(transcript, 'r'); const buf = Buffer.alloc(8192);
    const len = readSync(fd, buf, 0, buf.length, 0); closeSync(fd);
    const m = buf.toString('utf8', 0, len).match(/<scheduled-task name=\\?"([\w.-]+)/);
    return m ? m[1] : '';
  } catch { return ''; }
}

function unitOf(routine, cwd) {
  const head = routine.split('-')[0];
  if (UNITS.includes(head)) return head;
  const m = String(cwd || '').match(/Claude projects\/(?:\.issue-engineer\/)?([A-Za-z]+)/);
  return m ? m[1] : '';
}

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const dir = `${homedir()}/.claude/logs`;
  mkdirSync(dir, { recursive: true });
  const routine = routineOf(input.transcript_path);
  appendFileSync(`${dir}/session-events.jsonl`, JSON.stringify({
    at: new Date().toISOString(),
    event: input.hook_event_name,
    type: input.notification_type || input.error || '',
    text: String(input.message || input.last_assistant_message || '').slice(0, 300),
    cwd: input.cwd,
    session: input.session_id,
    routine,
    unit: unitOf(routine, input.cwd),
  }) + '\n');
} catch { /* a log hook never stops a session */ }
