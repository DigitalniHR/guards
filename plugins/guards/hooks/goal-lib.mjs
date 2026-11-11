// Shared by the three goal hooks (goal-prompt, goal-gate, goal-stop). The goal file of a session is the plan Boss
// asked for on 5 Nov 2026: what he said, what he wants, when it is done as he sees it, the proof, the acts he must do
// (all at once), the steps with their proof. The hooks make the file exist before the work, make it follow every new
// message of Boss, and compare the end of a turn with it (DigitalniHR/system#32).
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

export const DIR = path.join(os.homedir(), '.claude', 'goals');
export const FREE_CALLS = 2;   // tool calls a turn may make before the goal file must be current (a look around)
export const MAX_BLOCKS = 2;   // refusals of one turn's end; after that the turn may end (no endless loop)
export const MAX_GOAL_REPROMPTS = 10; // re-prompts of a /goal Stop condition before the session may end (system#23)
export const QUICK_CALLS = 4;  // a "Quick:" goal covers a turn of at most this many tool calls; more needs the full form

export function readInput() { try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; } }
export function files(sessionId) {
  const id = String(sessionId || 'unknown').replace(/[^\w-]/g, '');
  fs.mkdirSync(DIR, { recursive: true });
  return { goal: path.join(DIR, `${id}.md`), prompt: path.join(DIR, `${id}.prompt`), blocks: path.join(DIR, `${id}.blocks`) };
}
export function mtime(file) { try { return fs.statSync(file).mtimeMs; } catch { return 0; } }
export function read(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }

// A routine or an automated turn (a skill body, a cross-session message, a hook feedback) is not a task of Boss.
export function isAutomated(promptText) { return /^\s*(Base directory for this skill|<|\[Request interrupted|Stop hook feedback|Your response above was cut off)/.test(String(promptText || '')); }

// The goal file: a `Quick:` line for a question or a handful of tool calls, else the full form.
export function parseGoal(text) {
  const g = { quick: /^\s*Quick:/m.test(text), missing: {} , open: [], waiting: [], decision: '' };
  if (g.quick) return g;
  for (const key of ['Said', 'Wants', 'Cause', 'Exists', 'Research', 'Design', 'Done when', 'Proof', 'Boss acts']) {
    // "Done when (all true):" with a numbered list under it is the form of standards/evals.md (8 Nov 2026).
    const m = text.match(new RegExp(`^${key}(?:\\s*\\([^)]*\\))?:[ \\t]*(.*)((?:\\n[ \\t]*(?:\\d+[.)]|[-*])[ \\t]+\\S.*)*)`, 'm'));
    const val = m ? `${m[1]} ${m[2].replace(/\s+/g, ' ')}`.trim() : '';
    if (!val) g.missing[key] = true; else g[key] = val;
  }
  if (g.Said && g.Wants && g.Said.toLowerCase() === g.Wants.toLowerCase()) g.missing.Wants = 'same as Said';
  // How we solve a problem (Boss, 8 Nov 2026): the class of the problem, not the case; best practice before the solution.
  if (g.Cause && g.Said && g.Cause.toLowerCase() === g.Said.toLowerCase()) g.missing.Cause = 'same as Said: name the class of problem, not the case';
  // A cause that is only the case got past this gate and Boss steered 6 proposals in 24 h to the cause (system#228).
  else if (g.Cause && !/\bclass\b/i.test(g.Cause)) g.missing.Cause = 'a case only: write "class: <the class of problem>; case: <this case>"';
  // What exists before what is built: a new worker or rule beside an old one was the other half of the 6 (system#228).
  if (g.Exists && !/^none found:\s*\S/i.test(g.Exists) && !/(https?:\/\/|[\w-]\/[\w.-]|\.(md|py|sh|mjs|js|json|ya?ml)\b|#\d+|\b(skill|worker|routine|hook|script|issue|standard)\b)/i.test(g.Exists)) g.missing.Exists = 'name the skills, workers, scripts, standards or issues read for this class, or "none found: <the search>"';
  if (g.Research && !/^mechanical:\s*\S/i.test(g.Research) && !/(https?:\/\/|\.md\b|standard)/i.test(g.Research)) g.missing.Research = 'name the standard file or the sources read, or "mechanical: <why no research>"';
  g.open = [...text.matchAll(/^- \[ \] (.+)$/gm)].map(m => m[1].trim());
  // A step that waits for sessions this one started: "- [~] <step> — waits for local_<id>[, local_<id>]" (system#302).
  g.waiting = [...text.matchAll(/^- \[~\] (.+)$/gm)].map(m => ({ step: m[1].trim(), sessions: [...m[1].matchAll(/\blocal_[0-9a-f-]{4,}/gi)].map(x => x[0].toLowerCase()) }));
  const steps = [...text.matchAll(/^- \[[ x~]\] /gm)].length;
  if (!steps) g.missing.Steps = true;
  const d = text.match(/^## Boss-only decision\s*\n([\s\S]*?)(?:\n## |\s*$)/m);
  g.decision = d ? d[1].trim() : '';
  return g;
}
// A session of the desktop app works while it is not archived and its last answer has no post-turn summary yet (the
// app writes the summary when a turn ends). A session the app does not know counts as ended (system#302).
export const SESSIONS_DIR = process.env.GOAL_SESSIONS_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code-sessions');
export const WAIT_MAX_MS = 2 * 3600 * 1000; // no activity for this long: the turn ended without a summary
export function sessionRunning(id, dir = SESSIONS_DIR) {
  const want = String(id).toLowerCase();
  let accounts = []; try { accounts = fs.readdirSync(dir).filter(a => !a.startsWith('deleted_')); } catch { return false; }
  for (const a of accounts) {
    let orgs = []; try { orgs = fs.readdirSync(path.join(dir, a)); } catch { continue; }
    for (const o of orgs) {
      let names = []; try { names = fs.readdirSync(path.join(dir, a, o)); } catch { continue; }
      const name = names.find(n => n.startsWith(want) && n.endsWith('.json'));
      if (!name) continue;
      let d; try { d = JSON.parse(fs.readFileSync(path.join(dir, a, o, name), 'utf8')); } catch { return false; }
      if (d.isArchived) return false;
      if (d.lastAssistantUuid && d.postTurnSummaryFor === d.lastAssistantUuid) return false;
      return Date.now() - Number(d.lastActivityAt || 0) < WAIT_MAX_MS;
    }
  }
  return false;
}
export function goalState(f) {
  const text = read(f.goal);
  if (!text.trim()) return { state: 'missing', text };
  if (mtime(f.goal) < mtime(f.prompt)) return { state: 'stale', text };
  return { state: 'current', text };
}

// The turn starts at the last message of Boss in the transcript (not a tool result, not a meta message).
export function turnCalls(transcriptPath) {
  let calls = 0;
  for (const line of read(transcriptPath).split('\n')) {
    let d; try { d = JSON.parse(line); } catch { continue; }
    const c = d.message && d.message.content;
    if (d.type === 'user' && !d.isMeta && (typeof c === 'string' || (Array.isArray(c) && !c.some(x => x && x.type === 'tool_result')))) calls = 0;
    else if (d.type === 'assistant' && Array.isArray(c)) calls += c.filter(x => x && x.type === 'tool_use').length;
  }
  return calls;
}

export const FORMAT = `Goal file format (Markdown, English, STE):
Said: <what Boss wrote, one line>
Wants: <the intent behind it: the higher goal, what he will do with the result; never the same as Said>
Cause: class: <the class of problem this case is a sign of>; case: <this case>. The fix solves the class, never a rule for one case
Exists: <what already exists for this class and was read: skills, workers, scripts, standards, issues, and why it fails the need now; or "none found: <the search>">
Research: <the standard file read or written, or the sources of best practice read before the solution; or "mechanical: <why no research>">
Design: <the one design you build: the fewest new parts (files, jobs, checks, criteria) that meet the need at the moment of use; a repair of what exists before a second mechanism; one or two other designs in a few words each and why not; or "mechanical: <why>">
Done when: <3 to 8 criteria, each true or false and checkable now, as Boss sees it; then "Not done when:" the likely half-done state (standards/evals.md)>
Proof: <the check that shows the end state: a test, a listing, a page opened, a count before and after>
Boss acts: none | <every click, permission or approval Boss must do, in one list, with the minutes, asked once>
## Steps
- [ ] <step> (mark done as "- [x] <step> — <proof>"; a step that waits for a session you started: "- [~] <step> — waits for local_<id>")
## Boss-only decision
<empty, or the one decision (money, data loss, public content, his accounts, direction) that blocks the end state>
A question or a turn of at most ${QUICK_CALLS} tool calls needs only one line: "Quick: <what>".`;

// A /goal Stop condition is judged by the harness after every turn; a condition with no testable end re-prompted one
// session 107 times in one night (system#23). Counts the re-prompts since the last message of Boss and tells whether
// the last two turns changed a file or opened a PR. Rule-hook and command-hook feedback is not counted.
export function goalLoop(transcriptPath) {
  let count = 0, segs = [{ changed: false }];
  for (const line of read(transcriptPath).split('\n')) {
    let d; try { d = JSON.parse(line); } catch { continue; }
    const c = d.message && d.message.content;
    if (d.type === 'user' && typeof c === 'string' && c.startsWith('Stop hook feedback:\n[')) {
      if (/^Stop hook feedback:\n\[(You check one rule|node )/.test(c)) continue;
      count++; segs.push({ changed: false });
    } else if (d.type === 'user' && !d.isMeta && (typeof c === 'string' || (Array.isArray(c) && !c.some(x => x && x.type === 'tool_result')))) {
      count = 0; segs = [{ changed: false }];
    } else if (d.type === 'assistant' && Array.isArray(c)) {
      for (const x of c) {
        if (!x || x.type !== 'tool_use') continue;
        const cmd = String((x.input && x.input.command) || '');
        if (/^(Edit|Write|NotebookEdit)$/.test(x.name) || /\bgit (commit|push)\b|\bgh pr (create|merge)\b/.test(cmd)) segs[segs.length - 1].changed = true;
      }
    }
  }
  return { count, idle: count >= 2 && !segs.slice(-2).some(s => s.changed) };
}
