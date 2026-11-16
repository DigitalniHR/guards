// Stop: the turn may not end while the goal file has an open step and no Boss-only decision (system#32). Only this one
// fact check blocks, at most once per message of Boss. A step that waits ("waits for <a session, a background task, a
// monitor, a routine>") is not open: the harness or the app wakes the session when that ends. A step that waits for
// named sessions "local_<id>" is open again when all of them have ended (system#302).
// The format checks of the end message (result line, "Parts: N -> M", delete list, Boss acts, promise to read, Quick
// limit) were deleted on 16 Nov 2026: of 30 sampled blocks they gave Boss no new fact, 2 were gamed (system#670).
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { readInput, files, goalState, parseGoal, goalLoop, isAutomated, sessionRunning, read, mtime, MAX_BLOCKS, MAX_GOAL_REPROMPTS } from './goal-lib.mjs';

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
if (input.stop_hook_active || isAutomated(read(f.prompt)) || !read(f.prompt)) process.exit(0);
const { state, text } = goalState(f);
if (state !== 'current') process.exit(0);   // missing or stale: the start gate (goal-gate) owns that
const g = parseGoal(text);
if (g.quick || g.decision) process.exit(0);
const blocks = read(f.blocks).split('\n').filter(l => l === String(mtime(f.prompt))).length;
if (blocks >= MAX_BLOCKS) process.exit(0);

const open = [];
for (const step of [...g.open, ...g.waiting.map(w => w.step)]) {
  const sessions = [...step.matchAll(/\blocal_[0-9a-f-]{4,}/gi)].map(x => x[0].toLowerCase());
  if (sessions.length) { if (!sessions.some(id => sessionRunning(id))) open.push(`${step} (the sessions it waits for have ended: open their results now)`); }
  else if (!/\bwaits? for\b/i.test(step)) open.push(step);
}
if (!open.length) process.exit(0);
const uniq = open;
fs.appendFileSync(f.blocks, `${mtime(f.prompt)}\n`);
console.log(JSON.stringify({ decision: 'block', reason: `Goal hook: the goal file has ${uniq.length} open step(s): ${uniq.map(s => `"${s}"`).join(', ')}. Finish them with proof, mark a step that waits as "- [~] <step> — waits for <what>", or write the one Boss-only decision that blocks them under "## Boss-only decision".` }));
