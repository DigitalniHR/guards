// PreToolUse hook for Bash and the GitHub connector: a label an agent writes is in the one list (system#515). The list is
// ../labels.json (standards/github.md, section Labels): the canonical labels, the repository families (`chapter:*`, ...)
// and the GitHub defaults. Blocks (exit 2) a write of any other name, and of an old name (`status:in-progress`, system#509).
// A write is: `gh issue|pr create --label`, `gh issue|pr edit --add-label`, `gh label create|edit --name`,
// `gh api .../labels -f labels[]=X` or `-f name=X`, and the connector `issue_write` with `labels`. A remove, a read and a
// name with a shell variable (`$p`) pass. A script that calls gh is not a tool call: the daily label check covers it.
// An error passes (this guard never stops a session that it cannot read).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LIST = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'labels.json'), 'utf8'));

export const DELETE = '\0delete';

// Why a label name is not allowed, or null.
export function reason(name, list = LIST) {
  if (name === DELETE) return 'a label delete removes the mark from every issue and cannot be undone: a Boss decision (standards/github.md, Labels); remove the label from one issue instead (gh api -X DELETE repos/<o>/<r>/issues/<n>/labels/<name>)';
  const n = String(name).trim().toLowerCase();
  if (!n || n.includes('$')) return null;
  const old = Object.entries(list.old || {}).find(([o]) => o.toLowerCase() === n);
  if (old) return `"${name}" is an old name; write "${old[1]}"`;
  if (list.canonical.some((l) => l.name.toLowerCase() === n) || (list.defaults || []).includes(n)) return null;
  if ((list.families || []).some((f) => (f.endsWith('*') ? n.startsWith(f.slice(0, -1).toLowerCase()) && n.length > f.length - 1 : n === f))) return null;
  return `"${name}" is not in the label list of standards/github.md (plugins/guards/labels.json); use a canonical label or a family (${list.families.join(', ')}), or add the label to the list in a PR`;
}

const unq = (s) => s.replace(/^(["'])([\s\S]*)\1$/, '$2');
const ARG = `("[^"]*"|'[^']*'|[^\\s;&|]+)`;

// The label names a shell command writes.
export function written(command) {
  const out = [];
  const text = command.replace(/<<-?\s*(["']?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\s*\n|\s*\)|$)/g, (m) => m.split('\n')[0]);
  for (const seg of text.split(/\|\||&&|[;|\n]/)) {
    if (!/\bgh\b/.test(seg)) continue;
    if (/\bgh\s+(issue|pr)\s+(create|edit)\b/.test(seg)) {
      for (const m of seg.matchAll(new RegExp(`(?:--label|--add-label|\\s-l)(?:=|\\s+)${ARG}`, 'g'))) out.push(...unq(m[1]).split(','));
    }
    const lab = seg.match(new RegExp(`\\bgh\\s+label\\s+(create|edit)\\s+${ARG}`));
    if (lab) {
      const nm = seg.match(new RegExp(`(?:--name|-n)(?:=|\\s+)${ARG}`));
      out.push(lab[1] === 'create' ? unq(lab[2]) : nm ? unq(nm[1]) : '');
    }
    // A label delete removes the mark from every issue and cannot be undone: a Boss decision (standards/github.md).
    // The remove of one label from one issue (`issues/<n>/labels/<name>`) is not a delete.
    if (/\bgh\s+label\s+delete\b/.test(seg) || (/\bgh\s+api\b/.test(seg) && /(-X\s*|--method[\s=]+)DELETE/i.test(seg) && /\brepos\/[^/\s]+\/[^/\s]+\/labels\//.test(seg))) out.push(DELETE);
    if (/\bgh\s+api\b/.test(seg) && /\/labels\b/.test(seg) && !/-X\s*DELETE|--method[\s=]+DELETE/i.test(seg)) {
      for (const m of seg.matchAll(new RegExp(`(?:-f|-F|--field|--raw-field)(?:=|\\s+)${ARG}`, 'g'))) {
        const kv = unq(m[1]).match(/^(labels\[\]|name|new_name)=([\s\S]*)$/);
        if (kv) out.push(kv[2]);
      }
    }
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
    const tool = String(input.tool_name || ''); const ti = input.tool_input || {};
    const names = tool === 'Bash' ? written(String(ti.command || ''))
      : /issue_write$/.test(tool) && Array.isArray(ti.labels) ? ti.labels.map(String) : [];
    const bad = names.map((n) => reason(n)).filter(Boolean);
    if (bad.length) { console.error(`Blocked (label-guard, system#515): ${bad.join('; ')}.`); process.exit(2); }
  } catch { /* fail open */ }
  process.exit(0);
}
