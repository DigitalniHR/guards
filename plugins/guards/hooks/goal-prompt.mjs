// UserPromptSubmit: records the moment of each message of Boss and tells the model the state of the goal file of
// this session (missing, stale, current). A new message makes the goal stale: the model must confirm or change the
// goal before it works on, so the goal follows Boss and not the last sentence (Boss, 5 Nov 2026, system#32).
import fs from 'node:fs';
import { readInput, files, goalState, isAutomated, parseGoal, FORMAT, FREE_CALLS } from './goal-lib.mjs';

const input = readInput();
const f = files(input.session_id);
if (isAutomated(input.prompt)) process.exit(0);
const before = goalState(f);
fs.writeFileSync(f.prompt, String(input.prompt || '').slice(0, 2000));
try { fs.unlinkSync(f.blocks); } catch (e) { if (e.code !== 'ENOENT') process.stderr.write(`goal-prompt: ${e.message}\n`); }   // no file = nothing to reset; stderr of an exit-0 hook never reaches the model (system#206)

const lines = [`Goal file of this session: ${f.goal}`];
if (before.state === 'missing') {
  lines.push(`It does not exist. Before the ${FREE_CALLS + 1}. tool call of this turn, write it. ${FORMAT}`);
} else {
  const g = parseGoal(before.text);
  const summary = g.quick ? 'a Quick task' : `Wants: ${g.Wants || '?'} · Done when: ${g['Done when'] || '?'} · open steps: ${g.open.length}`;
  lines.push(`It exists (${summary}). Boss sent a new message: read the goal file, then update it (a new goal, a changed intent, new steps) or confirm it unchanged by touching it, before the ${FREE_CALLS + 1}. tool call. A new task gets a new goal file content, not an append.`);
}
console.log(lines.join('\n'));
