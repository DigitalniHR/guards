// PreToolUse hook: a new GitHub issue names its end state for Boss (Boss, 8 Nov 2026, system#122: 96 of 213 open
// issues had a "Done when" line; work was closed half done). Blocks (exit 2) `gh issue create` and the GitHub MCP
// issue_write create when the body has no "Done when" line and no "Proof" line. Other commands pass untouched.
// A comment, an edit or a decision issue is not a new piece of work and is not checked for Done when and Proof.
// An issue with "Owner: Boss" needs Recommendation and Default (bossMissing).
import { readFileSync, existsSync } from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Repositories whose issues name their objective or initiative first in the title (dhr#717: 6 open dhr issues were made
// outside `board.sh add`, which refuses a title without the code; the dhr report counts them as a defect).
const TITLE_CODE = { 'digitalnihr/dhr': /^\[[A-Z]+[-.]\d+/ };
export function titleMissing(repo, title) {
  const rule = TITLE_CODE[String(repo || '').toLowerCase()];
  return Boolean(rule && !rule.test(String(title || '').trim()));
}
// The repository of a `gh issue create`: its -R/--repo flag, else the origin remote of the working folder; null if unknown.
export function repoOf(command, cwd) {
  const flag = String(command).match(/(?:-R|--repo)[ =]["']?([\w.-]+\/[\w.-]+)/);
  if (flag) return flag[1];
  try {
    const url = execFileSync('git', ['-C', cwd, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = url.trim().match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
    return m ? m[1] : null;
  } catch { return null; }
}

export const RULE = 'a new issue needs "Done when:" as a list of 3 to 8 criteria, each true or false, each checkable now (no time window such as "for two weeks"), in Boss words (no code, file, tool or "merged/PR/tests" words), and "Proof:" with one check per criterion (standard: system standards/evals.md)';

// The Done when section: its first line and the lines under it, to a heading or the next key line ("Proof:", ...).
// Blank lines right after the heading are skipped; a blank line after text ends the section.
function section(body) {
  const lines = String(body || '').split('\n');
  const i = lines.findIndex((l) => /^\W*done when\b/i.test(l));
  if (i < 0) return null;
  const first = lines[i].replace(/^\W*done when\b(\s*\([^)]*\))?\s*:?\**/i, '');   // drop "(all true)" and ":"
  const rest = [];
  for (const l of lines.slice(i + 1)) {
    if (!l.trim()) { if (rest.length) break; else continue; }
    if (/^\s*#/.test(l) || /^\W*(not done when|proof|owner|steps|objective|cause|research|boss acts)\b/i.test(l)) break;
    rest.push(l);
  }
  return { first: first.trim(), rest };
}
export function doneWhen(body) {
  const s = section(body);
  return s ? [s.first, ...s.rest].join(' ').trim() : null;
}
// Criteria: the list items of the section ("1.", "-", "*", "- [ ]"); a Done when written as one sentence counts 1.
export function criteria(body) {
  const s = section(body);
  if (!s) return 0;
  const items = s.rest.filter((l) => /^\s*(?:\d+[.)]|[-*])\s+\S/.test(l)).length;
  return items || ((s.first || s.rest.length) ? 1 : 0);
}
// A time window makes the work wait instead of close (Boss, 8 Nov 2026): that is a KPI of the roadmap, not an eval.
const WINDOW = /\b(?:for|in|over|within|during|after)\s+(?:the\s+)?(?:next\s+)?(?:\d+|one|two|three|four|a|several)\s+(?:days?|weeks?|months?)\b|\bafter (?:the )?baseline\b|\bnext (?:week|month)\b|\b(?:two|three|\d+) (?:runs|days|weeks) in a row\b|\bweek over week\b/i;

// Signs that the end state is written for a developer, not for Boss (Boss, 8 Nov 2026: Done when is L3, Boss level).
const TECH = [
  [/`/, 'code in backticks'],
  [/\b[\w./-]+\.(?:py|mjs|js|ts|json|md|sh|yml|yaml|sql|toml)\b/i, 'a file name'],
  [/\b(?:merged|pull request|PR\b|commit|tests? (?:pass|green)|pytest|CI\b|deployed?\b)\b/i, 'a technical word'],   // output words; names of system parts are fine (system#138)
];

export function missing(body) {
  const b = String(body || '');
  const out = [];
  const dw = doneWhen(b);
  if (dw === null || !dw) out.push('Done when');
  else {
    const n = criteria(b);
    if (n < 3 || n > 8) out.push(`Done when with 3 to 8 criteria (it has ${n})`);
    if (WINDOW.test(dw)) out.push(`Done when checkable now (it has a time window: "${dw.match(WINDOW)[0]}")`);
    for (const [re, what] of TECH) if (re.test(dw)) { out.push(`Done when at Boss level (it has ${what}: "${dw.match(re)[0]}")`); break; }
  }
  if (!/^\W*proof\b/im.test(b)) out.push('Proof');
  return out;
}

// A Boss issue (a line "Owner: Boss", also a Decision) needs a "Recommendation:" and a "Default:" line, so the
// night can apply the Default after 7 days (system#59; dhr#761: dhr#755 was made with Owner: Boss and no Default).
export const BOSS_RULE = 'a new issue with "Owner: Boss" needs a line "Recommendation:" (one line, the answer you advise) and a line "Default:" (what happens when Boss does not answer in 7 days)';
export function bossMissing(body) {
  const b = String(body || '');
  if (!/^\W*owner\s*:\s*boss\b/im.test(b)) return [];
  return ['Recommendation', 'Default'].filter((k) => !new RegExp(`^\\W*${k}\\s*:\\s*\\S`, 'im').test(b));
}

// The body of a `gh issue create` command: --body-file/-F <path> is read, --body/-b "<text>" is taken as written.
export function bodyOf(command, cwd) {
  // The flag stands alone (not the end of another word); ~ and $VAR / ${VAR} are taken from the environment (system#139).
  const file = command.match(/(?<![\w-])(?:--body-file|-F)[ =](?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (file) {
    let p = file[1] || file[2] || file[3];
    if (p === '-') return null;              // stdin: cannot be read here
    p = p.replace(/^~(?=\/)/, process.env.HOME || '~').replace(/\$\{?(\w+)\}?/g, (m, v) => process.env[v] ?? m);
    if (p.includes('$')) return null;        // a shell variable the guard cannot see: do not block on a guess
    const full = path.isAbsolute(p) ? p : path.join(cwd, p);
    return existsSync(full) ? readFileSync(full, 'utf8') : '';
  }
  // --body "$(cat <<'EOF' ... EOF)": the here-doc text is the body, quotes inside it are text (owner run, 8 Nov 2026:
  // a body with a quoted word was read only to that quote and blocked as "Missing: Done when").
  const heredoc = command.match(/(?<![\w-])(?:--body|-b)[ =]"\$\(\s*cat\s+<<-?\s*(['"]?)(\w+)\1\s*\n([\s\S]*?)\n\s*\2\s*\n?\s*\)"/);
  if (heredoc) return heredoc[3];
  const inline = command.match(/(?<![\w-])(?:--body|-b)[ =](?:"((?:[^"\\]|\\.)*)"|'([^']*)'|\$'((?:[^'\\]|\\.)*)')/s);
  if (inline) return (inline[1] ?? inline[2] ?? inline[3] ?? '').replace(/\\n/g, '\n');
  return '';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {   // run as a hook, not imported
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
  const tool = String(input.tool_name || '');
  let body, title, repo;
  try {
    if (tool === 'Bash') {
      const command = String(input.tool_input?.command || '');
      // Only a real call counts (8 Nov 2026): a here-doc body and text in quotes (a comment that names the command) are data.
      const { commandText } = await import('./forbidden-patterns.mjs');
      const bare = commandText(command).replace(/"(?:[^"\\]|\\.)*"|'[^']*'/gs, '""');
      if (!/(?:^|[;&|(]\s*|\n\s*)gh\s+issue\s+create\b/.test(bare)) process.exit(0);
      body = bodyOf(command, String(input.cwd || process.cwd()));
      if (body === null) process.exit(0);
      const t = command.match(/(?:--title|-t)[ =](?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/);
      title = t ? (t[1] ?? t[2] ?? t[3]) : '';
      repo = repoOf(command, String(input.cwd || process.cwd()));
    } else if (/issue_write$/.test(tool)) {
      if (String(input.tool_input?.method || '') !== 'create') process.exit(0);
      body = input.tool_input?.body;
      title = input.tool_input?.title;
      repo = input.tool_input?.owner && input.tool_input?.repo ? `${input.tool_input.owner}/${input.tool_input.repo}` : null;
    } else process.exit(0);
    if (titleMissing(repo, title)) {
      console.error(`Blocked: an issue of ${repo} names its objective or initiative first in the title: [<AREA>.<objective>] or [<AREA>-n], for example "[SYS.2] ...". Find the code in the roadmap of the repository and create the issue again.`);
      process.exit(2);
    }
    const boss = bossMissing(body);
    if (boss.length) {
      console.error(`Blocked: ${BOSS_RULE}. Missing: ${boss.join(', ')}. Add the lines and create the issue again; an access or a key is not a Boss class: Owner: Agent with the label blocked:access.`);
      process.exit(2);
    }
    if (/^\W*(\[[^\]]*\]\s*)?decision\b/i.test(String(title || ''))) process.exit(0);
    const gaps = missing(body);
    if (gaps.length) {
      console.error(`Blocked: ${RULE}. Missing: ${gaps.join(', ')}. Add the lines (form and examples: system standards/evals.md) and create the issue again.`);
      process.exit(2);
    }
  } catch (e) {
    console.error(`Blocked: issue-format hook error (${e.message}). The rule: ${RULE}.`);
    process.exit(2);
  }
}
