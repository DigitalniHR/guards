// PostToolUse and PreToolUse hook: one issue has one engineer (system#386). The GitHub connector `issue_write` update
// replaces the whole label set. On system#380 the cloud routine wrote its claim from an old copy of the labels: the
// write removed `engineer:mac` and the check after the claim saw no Mac claim, so two engineers worked one cause.
// PostToolUse on `issue_read`: keep the labels of the issue in a state file of the session.
// PreToolUse on `issue_write` update with `labels`: block when this session did not read the issue in the last
// FRESH_S seconds, when the new set removes `engineer:mac`, or when it adds `engineer:cloud` to an issue the Mac claimed.
// Rules 6, 7, 8 of standards/github.md stop at the write (system#739): a label that is off the list (labels.json), an old
// name, or two labels that contradict is refused when it is written (connector write, `gh issue create/edit`, `gh label create`,
// `gh api .../labels`); only labels the write adds are judged, so an issue that already carries an old label can still change.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

export const FRESH_S = 120;
export const LIST = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'labels.json'), 'utf8'));
// The pairs of github_check.py CONFLICTS (rule 8); the old name pair is rule 7.
export const CONFLICTS = [['engineer:cloud', 'engineer:skip'], ['engineer:mac', 'engineer:skip'], ['in-progress', 'engineer:skip'],
  ['in-progress', 'status:review'], ['in-progress', 'blocked:access'], ['status:review', 'blocked:access']];
export function listed(name, lst = LIST) {
  const low = name.toLowerCase();
  if (lst.canonical.some((l) => l.name.toLowerCase() === low) || lst.defaults.some((d) => d.toLowerCase() === low)) return true;
  return lst.families.some((f) => { const fl = f.toLowerCase(); return (fl.endsWith('*') && low.startsWith(fl.slice(0, -1)) && low.length > fl.length - 1) || fl === low; });
}
// The reason to refuse a label write, or null. `added` = labels the write puts on; `final` = the whole set after it
// (the added labels when the issue is not known).
export function labelWriteReason(added, final = added, lst = LIST) {
  const old = Object.fromEntries(Object.entries(lst.old).map(([k, v]) => [k.toLowerCase(), v]));
  for (const n of added) {
    if (n.toLowerCase() in old) { const to = old[n.toLowerCase()]; return `rule 7: "${n}" is an old label name${to ? `; write "${to}"` : '; it has no new name, write no label'}`; }
    if (!listed(n, lst)) return `rule 6: "${n}" is not in plugins/guards/labels.json (canonical, families, defaults); the list follows Boss: use a listed label or add it to the list in a PR`;
  }
  const low = new Set(final.map((n) => n.toLowerCase()));
  for (const [a, b] of CONFLICTS) if (low.has(a) && low.has(b) && (added.some((n) => [a, b].includes(n.toLowerCase())))) return `rule 8: "${a}" and "${b}" contradict on one issue`;
  return null;
}
// Labels a Bash command writes: gh issue create/edit --label/--add-label, gh label create, gh api ... labels[]=x.
export function bashLabels(command) {
  const out = [];
  const split = (v) => v.replace(/^["']|["']$/g, '').split(',').map((x) => x.trim()).filter(Boolean);
  if (/\bgh\s+issue\s+(?:create|edit)\b/.test(command)) {
    for (const m of command.matchAll(/--(?:add-)?label(?:=|\s+)("[^"]*"|'[^']*'|[^\s;&|]+)/g)) out.push(...split(m[1]));
  }
  const lc = /\bgh\s+label\s+create\s+("[^"]*"|'[^']*'|[^\s;&|]+)/.exec(command);
  if (lc) out.push(...split(lc[1]));
  if (/\bgh\s+api\b/.test(command) && /\/labels\b/.test(command)) {
    for (const m of command.matchAll(/labels\[\]=("[^"]*"|'[^']*'|[^\s;&|]+)/g)) out.push(m[1].replace(/^["']|["']$/g, ''));
  }
  return out;
}
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

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
  const tool = String(input.tool_name || ''); const ti = input.tool_input || {};
  if (tool === 'Bash' && input.hook_event_name !== 'PostToolUse') {
    const added = bashLabels(String(ti.command || ''));
    const why = added.length ? labelWriteReason(added) : null;
    if (why) { console.error(`Blocked (claim-guard, standards/github.md, system#739): ${why}.`); process.exit(2); }
    process.exit(0);
  }
  if (/issue_write$/.test(tool) && ti.method === 'create' && Array.isArray(ti.labels)) {
    const wrong = labelWriteReason(ti.labels.map(String));
    if (wrong) { console.error(`Blocked (claim-guard, standards/github.md, system#739): ${wrong}.`); process.exit(2); }
  }
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
    const next = ti.labels.map(String);
    const wrong = labelWriteReason(next.filter((n) => !(seen?.labels || []).includes(n)), next);
    if (wrong) { console.error(`Blocked (claim-guard, standards/github.md, system#739): ${wrong}.`); process.exit(2); }
    const why = blockReason(seen, ti.labels.map(String));
    if (why) { console.error(`Blocked (claim-guard, system#386): ${why}.`); process.exit(2); }
    // The write changes the labels: the stored copy is the new set, so the next write needs no second read.
    fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file, JSON.stringify({ at: seen.at, labels: ti.labels.map(String) }));
  }
  process.exit(0);
}
