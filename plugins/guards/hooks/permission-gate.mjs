// PermissionRequest hook: auto-approves prompts in bypass mode, blocks the
// destructive commands from the deny list, and leaves Boss-gated commands
// (Railway deploys, PR merge/close) to the normal prompt.
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const tool = input.tool_name || '';
const command = tool === 'Bash' ? String(input.tool_input?.command || '') : '';

import { DENY } from './forbidden-patterns.mjs'; // shared with forbidden-commands.mjs

const ASK = [
  [/\brailway\s+(up|redeploy)\b/],
  [/\bgh\s+pr\s+close\b/],
];

const decide = (behavior, message) =>
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: message ? { behavior, message } : { behavior } },
  }));

const denied = DENY.find(([re]) => re.test(command));
if (denied) {
  decide('deny', `Blocked by Boss policy: ${denied[1]}. Boss does this in the UI.`);
} else if (!ASK.some(([re]) => re.test(command))) {
  decide('allow');
}
// ASK matches: no output, the normal prompt is shown.
