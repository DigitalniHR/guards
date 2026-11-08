// PreToolUse (every tool): after FREE_CALLS tool calls of a turn, no further tool call runs while the goal file of
// the session is missing, stale (older than the last message of Boss) or incomplete. Writing the goal file itself
// is always allowed. Exit 2 blocks the call and gives the model the reason (system#32).
import { readInput, files, goalState, parseGoal, turnCalls, isAutomated, read, FORMAT, FREE_CALLS, QUICK_CALLS } from './goal-lib.mjs';

const input = readInput();
const f = files(input.session_id);
if (isAutomated(read(f.prompt)) || !read(f.prompt)) process.exit(0);   // a routine, or no message of Boss yet
const target = String((input.tool_input || {}).file_path || '');
if (target && target === f.goal) process.exit(0);
const calls = turnCalls(input.transcript_path);
if (calls < FREE_CALLS) process.exit(0);

const { state, text } = goalState(f);
let why = '';
if (state === 'current' && parseGoal(text).quick && calls >= QUICK_CALLS) why = `this turn has made ${calls} tool calls; a "Quick:" goal covers at most ${QUICK_CALLS}. Write the full goal file ${f.goal}, then continue. ${FORMAT}`;
else if (state === 'missing') why = `the goal file ${f.goal} does not exist. Write it now, then continue. ${FORMAT}`;
else if (state === 'stale') why = `Boss sent a new message after the goal file ${f.goal} was last written. Read it, update it or confirm it unchanged (touch it), then continue.`;
else {
  const g = parseGoal(text);
  const missing = Object.keys(g.missing);
  if (missing.length) why = `the goal file ${f.goal} is incomplete: ${missing.map(k => g.missing[k] === true ? k : `${k} (${g.missing[k]})`).join(', ')}. Complete it, then continue. ${FORMAT}`;
}
if (!why) process.exit(0);
process.stderr.write(`Blocked by the goal hook: ${why}`);
process.exit(2);
