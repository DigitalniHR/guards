// Stop: compares the end of the turn with the goal file. The turn may end when every step is done with its proof,
// or when the file names the one Boss-only decision that blocks the end state. A turn that asks Boss for an act the
// goal file did not plan is refused too: the model first tries the automatic route, then lists every act at once.
// At most MAX_BLOCKS refusals per message of Boss, so a turn never loops (system#32).
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { readInput, files, goalState, parseGoal, turnCalls, goalLoop, isAutomated, read, mtime, MAX_BLOCKS, MAX_GOAL_REPROMPTS, QUICK_CALLS } from './goal-lib.mjs';

const input = readInput();
const f = files(input.session_id);

// A /goal Stop condition without an end must not loop a session: after MAX_GOAL_REPROMPTS re-prompts, or when the last
// two turns changed no file and opened no PR, the session ends (continue:false overrides the block of the harness
// check) and one line goes to the event log (system#23).
const loop = goalLoop(input.transcript_path);
if (loop.count >= MAX_GOAL_REPROMPTS || loop.idle) {
  const reason = loop.count >= MAX_GOAL_REPROMPTS ? `${loop.count} re-prompts of the /goal condition (limit ${MAX_GOAL_REPROMPTS})` : `${loop.count} re-prompts of the /goal condition and no file or PR changed in the last two turns`;
  try {
    const dir = path.join(os.homedir(), '.claude', 'logs'); fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'session-events.jsonl'), JSON.stringify({ at: new Date().toISOString(), event: 'StopLimit', type: loop.idle ? 'idle' : 'count', text: reason, cwd: input.cwd, session: input.session_id }) + '\n');
  } catch { /* a log line never stops the hook */ }
  console.log(JSON.stringify({ continue: false, stopReason: `Goal limit: ${reason}. The session ends; Boss restarts it with a condition that has a testable end.` }));
  process.exit(0);
}
if (isAutomated(read(f.prompt)) || !read(f.prompt)) process.exit(0);
const last = String(input.last_assistant_message || '');
const { state, text } = goalState(f);
const calls = turnCalls(input.transcript_path);
const quick = state !== 'missing' && parseGoal(text).quick;
if ((quick && calls < QUICK_CALLS) || (state === 'missing' && calls <= 2)) process.exit(0);

const blocks = read(f.blocks).split('\n').filter(l => l === String(mtime(f.prompt))).length;
if (blocks >= MAX_BLOCKS) process.exit(0);

let why = '';
if (quick) why = `this turn made ${calls} tool calls under a "Quick:" goal (at most ${QUICK_CALLS}). Write the full goal file ${f.goal} with the steps done and their proof, or finish the work.`;
else if (state === 'missing') why = `this turn did work without a goal file (${f.goal}). Write it now with the steps done and their proof, or finish the work.`;
else if (state === 'stale') why = `the goal file ${f.goal} is older than the last message of Boss. Update it, finish its steps or confirm it, then end.`;
else {
  const g = parseGoal(text);
  const asksAct = /\b(klikni|povol|schval|potvrď|nastav|otevři|přihlas|zadej|allow|click|approve|grant|sign in)\b/i.test(last);
  if (g.open.length && !g.decision) why = `the goal file has ${g.open.length} open step(s): ${g.open.map(s => `"${s}"`).join(', ')}. Finish them with proof, or write the one Boss-only decision that blocks them under "## Boss-only decision".`;
  else if (asksAct && /^none$/i.test(g['Boss acts'] || '')) why = `the last message asks Boss for an act, but the goal file says "Boss acts: none". Try the automatic route first (scripts, Terminal control, the memory of this machine). If Boss must act, list every act with the minutes under "Boss acts:", then ask once.`;
}
if (!why) process.exit(0);
fs.appendFileSync(f.blocks, `${mtime(f.prompt)}\n`);
console.log(JSON.stringify({ decision: 'block', reason: `Goal hook: ${why}` }));
