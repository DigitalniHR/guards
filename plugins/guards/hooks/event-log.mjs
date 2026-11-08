// Notification (permission_prompt) and StopFailure hook: appends one JSON line per
// stall or failed turn to ~/.claude/logs/session-events.jsonl, so a routine that
// waits for an approval or dies on an API error at night is visible next morning.
// The CTO routines read this log. Never blocks; output is ignored by Claude Code.
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const dir = `${homedir()}/.claude/logs`;
  mkdirSync(dir, { recursive: true });
  appendFileSync(`${dir}/session-events.jsonl`, JSON.stringify({
    at: new Date().toISOString(),
    event: input.hook_event_name,
    type: input.notification_type || input.error || '',
    text: String(input.message || input.last_assistant_message || '').slice(0, 300),
    cwd: input.cwd,
    session: input.session_id,
  }) + '\n');
} catch { /* a log hook never stops a session */ }
