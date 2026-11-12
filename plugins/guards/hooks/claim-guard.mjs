// PostToolUse and PreToolUse hook: one issue has one engineer (system#386). The GitHub connector `issue_write` update
// replaces the whole label set. On system#380 the cloud routine wrote its claim from an old copy of the labels: the
// write removed `engineer:mac` and the check after the claim saw no Mac claim, so two engineers worked one cause.
// PostToolUse on `issue_read`: keep the labels of the issue in a state file of the session.
// PreToolUse on `issue_write` update with `labels`: block when this session did not read the issue in the last
// FRESH_S seconds, when the new set removes `engineer:mac`, or when it adds `engineer:cloud` to an issue the Mac claimed.
// `gh issue edit --add-label` adds and removes single labels and is not checked.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

export const FRESH_S = 120;
const DIR = process.env.CLAIM_GUARD_DIR || path.join(os.tmpdir(), 'claude-claim-guard');
const key = (session, ti) => path.join(DIR, `${String(session || 'none').replace(/\W/g, '')}-${ti.owner}-${ti.repo}-${ti.issue_number}.json`.toLowerCase());

// The label names in a tool response: the `labels` array of the JSON the connector returns (as text or as content blocks).
export function labelsOf(resp) {
  let found = null;
  const walk = (v, depth) => {
    if (found || depth > 6 || v == null) return;
    if (typeof v === 'string') { const s = v.trim(); if (/^[[{]/.test(s)) { try { walk(JSON.parse(s), depth + 1); } catch {} } return; }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    if (typeof v === 'object') {
      if (Array.isArray(v.labels)) { found = v.labels.map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean); return; }
      Object.values(v).forEach((x) => walk(x, depth + 1));
    }
  };
  walk(resp, 0);
  return found;
}

// The reason to block a label write, or null. `seen` is { at: ms, labels: [...] } of the last read, or null.
export function blockReason(seen, next, now = Date.now()) {
  if (!seen || now - seen.at > FRESH_S * 1000) return `the label set replaces all labels of the issue; read the issue (issue_read get or get_labels) right before the write, at most ${FRESH_S} s before, and build the new set from that read`;
  if (seen.labels.includes('engineer:mac') && !next.includes('engineer:mac')) return 'the new set removes engineer:mac, the claim of the Mac engineer; never remove it';
  if (seen.labels.includes('engineer:mac') && next.includes('engineer:cloud') && !seen.labels.includes('engineer:cloud')) return 'the Mac claimed this issue (engineer:mac): end with "skip: the Mac has it" and write nothing on GitHub';
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
  const tool = String(input.tool_name || ''); const ti = input.tool_input || {};
  if (!ti.owner || !ti.repo || !ti.issue_number) process.exit(0);
  const file = key(input.session_id, ti);
  if (/issue_read$/.test(tool) && input.hook_event_name === 'PostToolUse') {
    const labels = labelsOf(input.tool_response);
    if (labels) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file, JSON.stringify({ at: Date.now(), labels })); }
    process.exit(0);
  }
  if (/issue_write$/.test(tool) && ti.method === 'update' && Array.isArray(ti.labels)) {
    let seen = null;
    try { seen = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    const why = blockReason(seen, ti.labels.map(String));
    if (why) { console.error(`Blocked (claim-guard, system#386): ${why}.`); process.exit(2); }
    // The write changes the labels: the stored copy is the new set, so the next write needs no second read.
    fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file, JSON.stringify({ at: seen.at, labels: ti.labels.map(String) }));
  }
  process.exit(0);
}
