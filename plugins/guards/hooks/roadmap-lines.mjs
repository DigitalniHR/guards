// PreToolUse hook on Edit|Write|MultiEdit: check I4 of standards/github.md stops at the roadmap write (system#739).
// A roadmap file (`roadmap/<area>.md` or `ROADMAP.md`) names the Epic of work in progress by its issue: `  WEB-25 #223 <text>`.
// An Epic line (an indented code like `WEB-25`) that carries a state (a mark or "In progress", "Now") and no `#N` is refused.
// The hook never calls GitHub; whether the named issue is an open Feature stays with the daily check github_check.py I4.
import fs from 'node:fs'; import { fileURLToPath } from 'node:url';

export const MESSAGE = 'Blocked: an Epic line in work names its issue: `  WEB-25 #223 <one sentence>` (standards/github.md, I4). Create the Epic issue (type Feature) first, then write its number.';
const EPIC = /^\s+[A-Z]+-\d+\s/;
const STATE = /[◐●]|\b[Ii]n progress\b|\bNow\b/; // "Now" is the state word; a lower-case "now" in a description is not

export function isRoadmapFile(p) { return /\/roadmap\/[^/]+\.md$/.test(String(p || '')) || /ROADMAP\.md$/.test(String(p || '')); }

// The new text a tool call writes: Write content, Edit new_string, MultiEdit edits[].new_string.
export function newTexts(ti = {}) {
  const out = [];
  if (typeof ti.content === 'string') out.push(ti.content);
  if (typeof ti.new_string === 'string') out.push(ti.new_string);
  if (Array.isArray(ti.edits)) for (const e of ti.edits) if (typeof e?.new_string === 'string') out.push(e.new_string);
  return out;
}

// The first Epic line with a state and no issue number, or null.
export function badLine(text) {
  for (const line of String(text).split('\n')) if (EPIC.test(line) && STATE.test(line) && !/#\d+/.test(line)) return line;
  return null;
}

export function blockReason(ti = {}) {
  if (!isRoadmapFile(ti.file_path)) return null;
  return newTexts(ti).some((t) => badLine(t)) ? MESSAGE : null;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
  const why = blockReason(input.tool_input || {});
  if (why) { console.error(why); process.exit(2); }
  process.exit(0);
}
