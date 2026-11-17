// PreToolUse hook: a new GitHub issue names its end state for Boss (Boss, 8 Nov 2026, system#122: 96 of 213 open
// issues had a "Done when" line; work was closed half done). Blocks (exit 2) `gh issue create` and the GitHub MCP
// issue_write create when the body does not have the lite form (missing): What and why, Done when with the proof in
// each line. Who acts next is the assignee, not a body line (system#526). A comment or an edit is not checked for the form.
// An issue where Boss decides (a "Boss decides:" block, the class line "Owner: Boss (<class>)" or the assignee is the Boss login)
// also has Boss decides, Options and Recommendation with "With no answer in 7 days:" (bossMissing). Only agents pass
// this hook: Boss on the GitHub web or app is never blocked.
// An issue with "Owner: Boss (public content)" needs the full text or an approval page (textMissing), also on an edit.
// The title of a new or renamed issue is a plain sentence, and for a Boss issue it names his act (titleUnclear).
// A `Proof date:` more than PROOF_DAYS_MAX days ahead is refused in a new issue, an edit and a comment (proofDateFar,
// system#204): a proof that waits longer is split into a part that can be proved now and the rest.
// A new issue is also checked against the open issues and those closed in the last 30 days of its repository
// (duplicateOf, system#736): a hit is refused until the agent comments on or reopens the first issue, or the body says
// "Not a duplicate of #n: <why>". The same checks run on the REST create (`gh api -X POST repos/<o>/<r>/issues`) that
// cloud sessions and routines use.
import { readFileSync, existsSync } from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Repositories whose issues name their objective or initiative first in the title (dhr#717: 6 open dhr issues were made
// outside `board.sh add`, which refuses a title without the code; the dhr report counts them as a defect).
const TITLE_CODE = { 'digitalnihr/dhr': /^\[[A-Z]+[-.]\d+/ };
export function titleMissing(repo, title) {
  const rule = TITLE_CODE[String(repo || '').toLowerCase()];
  return Boolean(rule && !rule.test(String(title || '').trim()));
}
// The title is the one line the reader sees in a list (Boss, 13 Nov 2026: he could not tell from the Tasks page what
// system#381 "[model-cost] The OpenRouter balance lasts 13 days" and dhr#713 "[SYS.2] Accesses agents need" asked of
// him). The rule is for the text after the leading codes ("[SYS.2]", "[model-cost]"); standard: standards/evals.md rule 8.
export const TITLE_RULE = 'the title is one plain sentence of the outcome or the problem, for a reader who sees only this line: after the leading code at least 4 words and at most 90 characters, no code, file name or internal marker (words such as failed_items or worker:check); a title of an issue where Boss decides also names his act: "Boss <verb> ...", "Decision: <the choice>" or "<what happens>: <what Boss does>" (examples: "AI credit ends in 13 days: add 100 USD", "Boss grants 10 accesses that block agent work"; standard: system standards/evals.md)';
const TITLE_MIN = 4, TITLE_MAX = 90;
const TITLE_TECH = [
  [/`/, 'code in backticks'],
  [/\b[\w./-]+\.(?:py|mjs|js|ts|json|md|sh|yml|yaml|sql|toml)\b/i, 'a file name'],
  [/\b[a-z0-9]+_[a-z0-9_]+\b/i, 'an internal name'],
  [/\b[a-z][\w-]*:[a-z][\w-]*/i, 'an internal marker'],
];
export function titleText(title) { return String(title || '').trim().replace(/^(?:\[[^\]]*\]\s*)+/, '').trim(); }
// Reasons the title is unclear; an empty list passes. `boss` is true for an issue where Boss decides.
export function titleUnclear(title, boss = false) {
  const text = titleText(title);
  const out = [];
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%-]*/gu) || [];
  if (words.length < TITLE_MIN) out.push(`a sentence of at least ${TITLE_MIN} words after the code (it has ${words.length}: "${text}")`);
  if (text.length > TITLE_MAX) out.push(`at most ${TITLE_MAX} characters after the code (it has ${text.length})`);
  for (const [re, what] of TITLE_TECH) if (re.test(text)) { out.push(`plain words (it has ${what}: "${text.match(re)[0]}")`); break; }
  if (boss && !bossAct(text)) out.push('the act of Boss ("Boss <verb> ...", "Decision: <the choice>" or "<what happens>: <what Boss does>")');
  return out;
}
// The act of Boss in a title: "Boss approves ...", "Decision: ..." or a part of at least 2 words after a colon.
function bossAct(text) {
  if (/\bBoss\s+[a-z]{3,}/.test(text) || /^decision\s*:\s*\S/i.test(text)) return true;
  const after = text.includes(': ') ? text.slice(text.lastIndexOf(': ') + 2) : '';
  return (after.match(/[\p{L}\p{N}]+/gu) || []).length >= 2;
}
// An issue where Boss decides: its body asks him ("Boss decides:"), names the class ("Owner: Boss (<class>)"), or the
// command assigns it to Boss (gh --assignee / -a DigitalniHR; system#526: the assignee is who acts next).
// The login comes from accounts.json beside the plugin (system#542; the plugin is copied whole to the public repository).
function readBossLogin() {
  try { return JSON.parse(readFileSync(new URL('../accounts.json', import.meta.url), 'utf8')).boss || null; } catch { return null; }
}
export const BOSS_LOGIN = process.env.BOSS_LOGIN || readBossLogin();
export function bossOwned(body, command = '', assignees = []) {
  const b = String(body || '');
  return /^\W*boss decides\s*:/im.test(b) || /^\W*owner\s*:\W*boss\s*\(/im.test(b)
    || (BOSS_LOGIN && new RegExp(`(?:--assignee|-a)[ =]["']?[^"'\\s]*\\b${BOSS_LOGIN}\\b`).test(String(command)))
    || (BOSS_LOGIN && new RegExp(`assignees\\[\\][ =]*["']?${BOSS_LOGIN}\\b`).test(String(command)))
    || (BOSS_LOGIN && (assignees || []).includes(BOSS_LOGIN));
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

// The lite form of every issue (Boss approved it on 13 Nov 2026, system#479; standards/evals.md): What and why, Done
// when with the proof in each line; an issue where Boss decides also has Boss decides, Options, Recommendation and the
// class line "Owner: Boss (<class>)". The assignee says who acts next (system#526).
export const TEMPLATE = '**What and why:** <1 to 3 sentences in business words; each internal term with its meaning>\n\n**Done when:**\n1. <a result Boss or a customer sees, true or false>. Proof: <the check, and where to open it>.\n(1 to 5 lines)\n\n(assign it: --assignee Agent-digihr for agent work, --assignee ' + (BOSS_LOGIN || '<the Boss login>') + ' where Boss decides)\n\n## Details (for agents)\n<optional: steps, links, times, markers>';
export const RULE = 'a new issue has the lite form: "What and why:" opens it (1 to 3 sentences in business words), "Done when:" is a list of 1 to 5 results, each true or false, checkable when the work ends (no time window such as "for two weeks"), in Boss words (no code, file or "merged/PR/tests" words) and each with its check after "Proof:" in the same line; the assignee (one: Agent-digihr or DigitalniHR) says who acts next; detail only an agent needs goes under "## Details (for agents)" (template and examples: system standards/evals.md)';

// The Done when section: its first line and the lines under it, to a heading or the next key line ("Owner:", ...).
// Blank lines right after the heading are skipped; a blank line after text ends the section.
function section(body) {
  const lines = String(body || '').split('\n');
  const i = lines.findIndex((l) => /^\W*done when\b/i.test(l));
  if (i < 0) return null;
  const first = lines[i].replace(/^\W*done when\b(\s*\([^)]*\))?\s*:?\**/i, '');   // drop "(all true)" and ":"
  const rest = [];
  for (const l of lines.slice(i + 1)) {
    if (!l.trim()) { if (rest.length) break; else continue; }
    if (/^\s*#/.test(l) || /^\W*(not done when|proof|owner|steps|objective|cause|research|boss acts|boss decides|options|recommendation)\b/i.test(l)) break;
    rest.push(l);
  }
  return { first: first.trim(), rest };
}
export function doneWhen(body) {
  const s = section(body);
  return s ? [s.first, ...s.rest].join(' ').trim() : null;
}
// The results of the section: its list items ("1.", "-", "*", "- [ ]"), each with the lines that continue it; a Done
// when written as one sentence is one result.
export function results(body) {
  const s = section(body);
  if (!s) return [];
  const out = [];
  for (const l of s.rest) {
    if (/^\s*(?:\d+[.)]|[-*])\s+\S/.test(l)) out.push(l.trim());
    else if (out.length) out[out.length - 1] += ` ${l.trim()}`;
  }
  if (out.length) return out;
  const one = [s.first, ...s.rest].join(' ').trim();
  return one ? [one] : [];
}
export function criteria(body) { return results(body).length; }
// A time window makes the work wait instead of close (Boss, 8 Nov 2026): that is a KPI of the roadmap, not an eval.
const WINDOW = /\b(?:for|in|over|within|during|after)\s+(?:the\s+)?(?:next\s+)?(?:\d+|one|two|three|four|a|several)\s+(?:days?|weeks?|months?)\b|\bafter (?:the )?baseline\b|\bnext (?:week|month)\b|\b(?:two|three|\d+) (?:runs|days|weeks) in a row\b|\bweek over week\b/i;

// Signs that the end state is written for a developer, not for Boss (Boss, 8 Nov 2026: Done when is L3, Boss level).
const TECH = [
  [/`/, 'code in backticks'],
  [/\b[\w./-]+\.(?:py|mjs|js|ts|json|md|sh|yml|yaml|sql|toml)\b/i, 'a file name'],
  [/\b(?:merged|pull request|PR\b|commit|tests? (?:pass|green)|pytest|CI\b|deployed?\b)\b/i, 'a technical word'],   // output words; names of system parts are fine (system#138)
];
const KEY_LINE = /^\W*(what and why|boss decides|options|recommendation|done when|owner)\s*:/i;
// The text of a key line: the rest of its line and the lines under it, to the next key line, a heading or a blank line.
function part(lines, key) {
  const i = lines.findIndex((l) => new RegExp(`^\\W*${key}\\s*:`, 'i').test(l));
  if (i < 0) return null;
  const rest = [];
  for (const l of lines.slice(i + 1)) {
    if (!l.trim()) { if (rest.length || key !== 'Options') break; else continue; }
    if (/^\s*#/.test(l) || KEY_LINE.test(l)) break;
    rest.push(l);
  }
  return { first: lines[i].replace(new RegExp(`^\\W*${key}\\s*:\\W*`, 'i'), '').trim(), rest };
}
const textOf = (p) => (p ? [p.first, ...p.rest].join(' ').trim() : '');

// Reasons a body fails the lite form; an empty list passes. `boss` is true when the label, not the body, names Boss.
export function missing(body, boss = false) {
  const b = String(body || '');
  const lines = b.split('\n');
  const out = [];
  if (!textOf(part(lines, 'What and why'))) out.push('What and why');
  else if (!/^\W*what and why\s*:/i.test(lines.find((l) => l.trim() && !/^\s*<!--.*-->\s*$/.test(l)) || '')) out.push('"What and why:" as the first line of the issue');
  const list = results(b);
  if (!list.length) out.push('Done when');
  else {
    if (list.length > 5) out.push(`Done when with 1 to 5 results (it has ${list.length})`);
    const bare = list.filter((x) => !/\bproof\s*:\s*\S/i.test(x)).length;
    if (bare) out.push(`"Proof:" with its check in each line of Done when (${bare} of ${list.length} have none)`);
    const seen = list.map((x) => x.split(/\bproof\s*:/i)[0]).join(' ');
    if (WINDOW.test(seen)) out.push(`Done when checkable when the work ends (it has a time window: "${seen.match(WINDOW)[0]}")`);
    for (const [re, what] of TECH) if (re.test(seen)) { out.push(`Done when at Boss level (it has ${what}: "${seen.match(re)[0]}"; the technical check goes after "Proof:")`); break; }
  }
  return out;
}

// The part for Boss of an issue where he decides (Boss, 13 Nov 2026, on dhr#34: "I do not understand it at all"):
// Boss decides, Options (2 or 3), Recommendation (one concrete answer, never the choice again, and what happens with
// no answer in 7 days, so the engineer can apply it: system#59).
export const BOSS_RULE = 'an issue where Boss decides (assigned to DigitalniHR, or "Boss decides:" in the body) also has, in plain business words: "Boss decides:" (the one question), "Options:" (a list of 2 or 3, each with what it causes) and "Recommendation:" (ONE concrete answer first, with its value, then the reason: "Option 2: add 100 USD, because ..."; never "decide A or B" or "set X"), which ends with "With no answer in 7 days: <what happens>"; template and examples: system standards/evals.md';
const BOSS_KEYS = ['Boss decides', 'Options', 'Recommendation'];
// A recommendation that hands the choice back to Boss: its first clause (to the first ".", ":", ";", "(" or "because")
// offers two things ("A or B"), starts with a word of choice, or says "set X" with no value.
export function recommendationVague(text) {
  const clause = String(text || '').replace(/[*_`]/g, '').trim().split(/\.\s|[:;(]|\bbecause\b/i)[0].trim();
  if (/^(?:boss\s+)?(?:decides?|chooses?|picks?|selects?|either|whether|confirm whether)\b/i.test(clause)) return `it starts with a word of choice: "${clause}"`;
  if (/\bor\b/i.test(clause)) return `it offers a choice: "${clause}"`;
  if (/^(?:boss\s+)?(?:sets?|defines?|determines?)\b/i.test(clause) && !/\d/.test(clause)) return `it names no value: "${clause}"`;
  return '';
}
// Reasons the part for Boss fails; an empty list passes (also for an issue of an agent).
export function bossMissing(body, boss = false) {
  const b = String(body || '');
  if (!boss && !bossOwned(b)) return [];
  const lines = b.split('\n');
  const out = [];
  const parts = Object.fromEntries(['What and why', ...BOSS_KEYS].map((k) => [k, part(lines, k)]));
  for (const k of BOSS_KEYS) if (!textOf(parts[k])) out.push(k);
  if (!/\bwith no answer in 7 days\s*:\s*\S/i.test(b)) out.push('"With no answer in 7 days: <what happens>" at the end of the Recommendation');
  if (textOf(parts.Options)) {
    const n = parts.Options.rest.filter((l) => /^\s*(?:\d+[.)]|[-*]|[A-C][.)])\s+\S/.test(l)).length;
    if (n < 2 || n > 3) out.push(`Options as a list of 2 or 3 (it has ${n})`);
  }
  const rec = parts.Recommendation;
  if (rec && (rec.first || rec.rest[0])) {
    const vague = recommendationVague(rec.first || rec.rest[0]);
    if (vague) out.push(`Recommendation as one concrete answer (${vague})`);
  }
  for (const k of ['What and why', 'Boss decides', 'Recommendation']) {
    const text = textOf(parts[k]);
    const hit = TITLE_TECH.slice(0, 2).find(([re]) => re.test(text));
    if (hit) { out.push(`plain words in "${k}:" (it has ${hit[1]}: "${text.match(hit[0])[0]}")`); break; }
  }
  return out;
}

// A public-content approval shows the full final text, not a summary or links (Boss, 11 Nov 2026; standard
// studio content/README.md, Drafts and approval; dhr#893, #904, #758, #880, #473 named only a summary and links to comments and previews).
export const TEXT_RULE = 'an issue with "Owner: Boss (public content)" shows the full final text of each item under a heading "## Full text" (current and new side by side where text is replaced), or names its piece file in a line "Draft: content/<brand>/<type>/<slug>/6-FINAL.md", or has one line "Approval page: <https link>" to the Boss page that shows all full texts and lets Boss edit them; a summary, the first lines or links to comments are not enough (rule: studio content/README.md, section "Drafts and approval")';
export function textMissing(body) {
  const b = String(body || '');
  if (!/^\W*owner\s*:\W*boss\s*\(\s*public content\b/im.test(b)) return false;
  if (/^\W*approval page\s*:\W*https?:\/\/\S+/im.test(b)) return false;
  if (/^\W*draft\s*:\s*`?\S*content\/[\w.-]+\/[\w.-]+\/[\w.-]+\/\S*\.md\b/im.test(b)) return false;   // the piece file Boss opens on the Mac
  const lines = b.split('\n');
  const i = lines.findIndex((l) => /^\s*#{1,6}\s*full texts?\b/i.test(l));
  if (i < 0) return true;
  const level = lines[i].match(/#+/)[0].length;
  const text = [];
  for (const l of lines.slice(i + 1)) {
    const h = l.match(/^\s*(#{1,6})\s/);
    if (h && h[1].length <= level) break;
    if (!h) text.push(l);
  }
  // Only the words of the text count: links, list marks and labels such as "Current:" are not the text.
  const words = text.join(' ').replace(/\[([^\]]*)\]\([^)]*\)/g, ' ').replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b(?:current|new|now|before|after|item \d+)\s*:/gi, ' ').match(/\p{L}[\p{L}\p{N}'’-]*/gu) || [];
  return words.length < 5;
}

const expand = p => String(p).replace(/^~(?=\/)/, process.env.HOME || '~').replace(/\$\{?(\w+)\}?/g, (m, v) => process.env[v] ?? m);
// The text a command writes to the body file with a here-doc (`cat > <path> <<'EOF' ... EOF` or `cat <<'EOF' > <path>`),
// or null. The guard runs before the command, so the file is not on the disk yet, or holds an older text: in 24 h
// 12 of 30 refusals were complete issues judged as an empty body (system#469). The last here-doc of the path counts;
// the path matches when it is the same or one is the tail of the other (a `cd` before the call).
export function writtenInCommand(command, p) {
  const quoted = `(?:"([^"]+)"|'([^']+)'|([^\\s<>;&|]+))`;
  const forms = [
    new RegExp(`\\bcat\\s*>\\s*${quoted}\\s*<<-?\\s*(['"]?)(\\w+)\\4[ \\t]*\\n([\\s\\S]*?)\\n[ \\t]*\\5(?=[ \\t]*(?:\\n|$))`, 'g'),
    new RegExp(`\\bcat\\s*<<-?\\s*(['"]?)(\\w+)\\1\\s*>\\s*${quoted}[ \\t]*\\n([\\s\\S]*?)\\n[ \\t]*\\2(?=[ \\t]*(?:\\n|$))`, 'g'),
  ];
  const same = (a, b) => a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
  let found = null, at = -1;
  for (const [i, re] of forms.entries()) {
    for (const m of command.matchAll(re)) {
      const target = expand(i === 0 ? (m[1] || m[2] || m[3]) : (m[3] || m[4] || m[5]));
      if (same(target, p) && m.index > at) { found = m[6]; at = m.index; }
    }
  }
  return found;
}

// A `Proof date:` line more than PROOF_DAYS_MAX days after today (UTC) is refused (system#204: 61 dhr review issues had
// proof dates up to 13 days ahead, so their defects waited unseen). Returns the first far date, or ''.
export const PROOF_DAYS_MAX = 2;
export const PROOF_RULE = `a "Proof date:" is at most ${PROOF_DAYS_MAX} days after today: run the proof now, or set the date of the first check that can run (the engineer re-checks it on that day and sets the next date), or split the issue into the part that can be proved now and the rest (engineers/README.md, end state 2; system#204)`;
export function proofDateFar(body, now = new Date()) {
  const limit = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + PROOF_DAYS_MAX));
  for (const m of String(body || '').matchAll(/Proof date:\W*(\d{4})-(\d{2})-(\d{2})/gi)) {
    if (new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) > limit) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return '';
}

// The body of a `gh issue create` command: --body-file/-F <path> is read, --body/-b "<text>" is taken as written.
export function bodyOf(command, cwd) {
  // The flag stands alone (not the end of another word); ~ and $VAR / ${VAR} are taken from the environment (system#139).
  const file = command.match(/(?<![\w-])(?:--body-file|-F)[ =](?:"([^"]+)"|'([^']+)'|([^\s;&|)]+))/);   // a path ends at ; & | ) (system#469)
  if (file) {
    let p = file[1] || file[2] || file[3];
    if (p === '-') return null;              // stdin: cannot be read here
    p = expand(p);
    if (p.includes('$')) return null;        // a shell variable the guard cannot see: do not block on a guess
    const written = writtenInCommand(command, p);
    if (written !== null) return written;
    const full = path.isAbsolute(p) ? p : path.join(cwd, p);
    return existsSync(full) ? readFileSync(full, 'utf8') : '';
  }
  // --body "$(cat <path>)": the same file rule (system#469).
  const viaCat = command.match(/(?<![\w-])(?:--body|-b)[ =]"\$\(\s*cat\s+(?:"([^"]+)"|'([^']+)'|([^\s)<]+))\s*\)"/);
  if (viaCat) {
    const p = expand(viaCat[1] || viaCat[2] || viaCat[3]);
    if (p.includes('$')) return null;
    const written = writtenInCommand(command, p);
    if (written !== null) return written;
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

// The REST create of an issue: `gh api -X POST repos/<owner>/<repo>/issues` (POST by default when a field is given), not
// /comments, /labels or /sub_issues. Returns { repo, command, assignees } where `command` is the same call as a
// `gh issue create --title ... --body ...` text, so the title, body and form checks are the ones of that command; null
// when the call is no REST create. `--input <file>` reads the JSON of the issue (title, body, assignees); `--input -`
// cannot be read here (returns { repo, command: null }).
export function restCreate(command, cwd) {
  const m = command.match(/(?<![\w/-])repos\/([\w.-]+)\/([\w.-]+)\/issues(?=["'\s;&|)]|$)/);
  if (!m) return null;
  const method = command.match(/(?<![\w-])(?:-X|--method)[ =]["']?([A-Za-z]+)/);
  const hasFields = /(?<![\w-])(?:-f|-F|--field|--raw-field|--input)(?![\w-])/.test(command);
  const verb = method ? method[1].toUpperCase() : (hasFields ? 'POST' : 'GET');
  if (verb !== 'POST') return null;
  const repo = `${m[1]}/${m[2]}`;
  const input = command.match(/(?<![\w-])--input[ =](?:"([^"]+)"|'([^']+)'|([^\s;&|)]+))/);
  const assignees = [...command.matchAll(/(?<![\w-])(?:-f|-F|--field|--raw-field)[ =]["']?assignees\[\][ =]*([\w.-]+)/g)].map((x) => x[1]);
  if (input) {
    let p = expand(input[1] || input[2] || input[3]);
    if (p === '-' || p.includes('$')) return { repo, command: null, assignees };
    const full = path.isAbsolute(p) ? p : path.join(cwd, p);
    let json = {};
    try { json = JSON.parse(writtenInCommand(command, p) ?? (existsSync(full) ? readFileSync(full, 'utf8') : '{}')); } catch { return { repo, command: null, assignees }; }
    const a = Array.isArray(json.assignees) ? json.assignees : assignees;
    const q = (x) => `"${String(x ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    return { repo, command: `gh issue create --title ${q(json.title)} --body ${q(json.body)}`, assignees: a };
  }
  const flag = '(?<![\\w-])(?:-f|-F|--field|--raw-field)[ =]';
  const rewritten = command
    .replace(new RegExp(`${flag}(["']?)body=@`), '--body-file $1')
    .replace(new RegExp(`${flag}(["']?)body=`), '--body $1')
    .replace(new RegExp(`${flag}(["']?)title=`), '--title $1');
  return { repo, command: rewritten, assignees };
}

// Duplicates of a new issue (system#736). Same cause: reopen, no second issue (standards/github.md, Issues).
const STOP = new Set('a an the and or of to in on at for from by with is are was were be been it its this that these those as not no do does did has have had can could will would should we you they he she i our your their new into out up down over under about after before when while then than so if but all any more most one two issue issues'.split(' '));
export const LEADING_CODE = /^\s*((?:\[[^\]]*\]\s*)+)/;
export function titleCode(title) { const m = String(title || '').match(LEADING_CODE); return m ? m[1].replace(/\s+/g, '').toLowerCase() : ''; }
// The significant words of a title: after the code, no stop words, no numbers, at least 2 letters.
export function titleWords(title) {
  const text = String(title || '').replace(LEADING_CODE, '').toLowerCase();
  const words = text.match(/[\p{L}][\p{L}\p{N}]*/gu) || [];
  return [...new Set(words.filter((w) => w.length >= 2 && !STOP.has(w)))];
}
// Similar = the same leading code and at least 60 % of the significant words of the shorter title shared (at least 2 words).
export const SIMILAR = 0.6;
export function similarTitle(a, b) {
  if (titleCode(a) !== titleCode(b)) return false;
  const x = titleWords(a), y = titleWords(b);
  if (!x.length || !y.length) return false;
  const set = new Set(y), shared = x.filter((w) => set.has(w)).length;
  return shared >= Math.min(2, x.length, y.length) && shared / Math.min(x.length, y.length) >= SIMILAR;
}
export const DAYS_CLOSED = 30, SEARCH_MS = 5000;
// The open issues and those closed in the last 30 days of the repository that look like the title: [{ number, title, state }].
// ISSUE_SEARCH_STUB (a JSON file; the word "error" makes the search fail) replaces GitHub in tests. A timeout or an error
// returns [] (the create passes; the sorter of the issue engineer stays the net).
export function searchSimilar(repo, title, now = new Date()) {
  try {
    let items;
    if (process.env.ISSUE_SEARCH_STUB) {
      const raw = readFileSync(process.env.ISSUE_SEARCH_STUB, 'utf8');
      if (raw.trim() === 'error') throw new Error('stub error');
      items = JSON.parse(raw);
    } else {
      const words = titleWords(title).sort((p, q) => q.length - p.length).slice(0, 5);
      if (!words.length) return [];
      const out = execFileSync('gh', ['api', '-X', 'GET', 'search/issues', '-f', `q=repo:${repo} is:issue ${words.join(' ')} in:title`, '-f', 'per_page=30', '--jq', '[.items[] | {number, title, state, closed_at, pull_request: (.pull_request != null)}]'],
        { encoding: 'utf8', timeout: SEARCH_MS, stdio: ['ignore', 'pipe', 'ignore'] });
      items = JSON.parse(out);
    }
    const since = now.getTime() - DAYS_CLOSED * 86400000;
    return items.filter((i) => i && !i.pull_request && similarTitle(title, i.title)
      && (i.state === 'open' || (i.closed_at ? new Date(i.closed_at).getTime() >= since : true)))
      .map((i) => ({ number: i.number, title: i.title, state: i.state }));
  } catch { return []; }
}
export const DUPLICATE_LINE = /^\W*not a duplicate of #\d+\s*:\s*\S/im;
export function duplicateOf(repo, title, body, now = new Date()) {
  if (!repo || !title || DUPLICATE_LINE.test(String(body || ''))) return [];
  return searchSimilar(repo, title, now);
}
export function duplicateRule(hits) {
  const list = hits.map((h) => `#${h.number} (${h.state}) "${h.title}"`).join('; ');
  const first = hits.map((h) => h.number).sort((a, b) => a - b)[0];
  return `Blocked: the same cause may already have an issue: ${list}. Comment on #${first}, or reopen #${first} if it is closed; open a new issue only for another cause, and then add the line "Not a duplicate of #${first}: <why>" to the body (standards/github.md, Issues, rule 1).`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {   // run as a hook, not imported
  // `node issue-format.mjs --text-missing < body`: the CAO owner check on an open issue; prints missing or ok, exit 1 or 0.
  if (process.argv[2] === '--text-missing') { const m = textMissing(readFileSync(0, 'utf8')); console.log(m ? 'missing' : 'ok'); process.exit(m ? 1 : 0); }
  // `node issue-format.mjs --missing [--boss] < body`: the form check for a script that opens issues (its test runs it
  // on each body it makes) and for an open issue; --boss when the label, not the body, names Boss. `--boss-missing` is
  // the same as `--missing --boss`. Prints the reasons or ok, exit 1 or 0.
  if (process.argv[2] === '--missing' || process.argv[2] === '--boss-missing') {
    const boss = process.argv[2] === '--boss-missing' || process.argv[3] === '--boss';
    const text = readFileSync(0, 'utf8');
    const m = [...missing(text, boss), ...bossMissing(text, boss)];
    console.log(m.length ? m.join(', ') : 'ok'); process.exit(m.length ? 1 : 0);
  }
  // `node issue-format.mjs --title-unclear [--boss] "<title>"`: the title check for a script that opens issues (its test
  // runs it on each title template); prints the reasons or ok, exit 1 or 0.
  if (process.argv[2] === '--title-unclear') {
    const boss = process.argv[3] === '--boss';
    const m = titleUnclear(process.argv[boss ? 4 : 3], boss);
    console.log(m.length ? m.join(', ') : 'ok'); process.exit(m.length ? 1 : 0);
  }
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
  const tool = String(input.tool_name || '');
  let body, title, repo, boss;
  try {
    if (tool === 'Bash') {
      const command = String(input.tool_input?.command || '');
      // Only a real call counts (8 Nov 2026): a here-doc body and text in quotes (a comment that names the command) are data.
      const { commandText } = await import('./forbidden-patterns.mjs');
      const bare = commandText(command).replace(/"(?:[^"\\]|\\.)*"|'[^']*'/gs, '""');
      if (/(?:^|\s)(?:--help|-h)(?:\s|$)/.test(bare) || /\bgh\s+help\b/.test(bare)) process.exit(0);   // help prints, creates nothing
      const create = /(?:^|[;&|(]\s*|\n\s*)gh\s+issue\s+create\b/.test(bare);
      const edit = /(?:^|[;&|(]\s*|\n\s*)gh\s+issue\s+edit\b/.test(bare);
      const comment = /(?:^|[;&|(]\s*|\n\s*)gh\s+(?:issue|pr)\s+comment\b/.test(bare);
      const rest = /(?:^|[;&|(]\s*|\n\s*)gh\s+api\b/.test(bare) && !create && !edit && !comment ? restCreate(command, String(input.cwd || process.cwd())) : null;
      if (!create && !edit && !comment && !rest) process.exit(0);
      if (rest) {   // `gh api -X POST repos/<o>/<r>/issues`: checked as the issue command it stands for
        if (rest.command === null) process.exit(0);
        const cwd = String(input.cwd || process.cwd());
        body = bodyOf(rest.command, cwd);
        if (body === null) process.exit(0);
        const t = rest.command.match(/(?<![\w-])--title[ =](?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/);
        title = t ? (t[1] ?? t[2] ?? t[3]) : '';
        if (title.includes('$')) title = null;
        repo = rest.repo;
        boss = bossOwned(body, command, rest.assignees);
        const far = proofDateFar(body);
        if (far) { console.error(`Blocked: ${PROOF_RULE}. The text has Proof date: ${far}. Write it again.`); process.exit(2); }
      } else {
      body = bodyOf(command, String(input.cwd || process.cwd()));
      if (body === null) process.exit(0);
      const far = proofDateFar(body);
      if (far) { console.error(`Blocked: ${PROOF_RULE}. The text has Proof date: ${far}. Write it again.`); process.exit(2); }
      if (!create && !edit) process.exit(0);
      const t = command.match(/(?<![\w-])(?:--title|-t)[ =](?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/);
      title = t ? (t[1] ?? t[2] ?? t[3]) : '';
      if (title.includes('$')) title = null;   // a shell variable the guard cannot see: do not block on a guess
      if (edit && !create) {   // an edit: the title rule for a new title, the public-content rule for a new body
        const unclear = t && title !== null ? titleUnclear(title, bossOwned(body, command)) : [];
        if (unclear.length) { console.error(`Blocked: ${TITLE_RULE}. Missing: ${unclear.join(', ')}. Write the title again and edit the issue.`); process.exit(2); }
        if (body && textMissing(body)) { console.error(`Blocked: ${TEXT_RULE}. Add the full texts or the approval page and edit the issue again.`); process.exit(2); }
        process.exit(0);
      }
      boss = bossOwned(body, command);
      repo = repoOf(command, String(input.cwd || process.cwd()));
      }
    } else if (/add_issue_comment$/.test(tool)) {
      const far = proofDateFar(input.tool_input?.body);
      if (far) { console.error(`Blocked: ${PROOF_RULE}. The text has Proof date: ${far}. Write it again.`); process.exit(2); }
      process.exit(0);
    } else if (/issue_write$/.test(tool)) {
      const far = proofDateFar(input.tool_input?.body);
      if (far) { console.error(`Blocked: ${PROOF_RULE}. The text has Proof date: ${far}. Write it again.`); process.exit(2); }
      const method = String(input.tool_input?.method || '');
      if (method === 'update' && typeof input.tool_input?.title === 'string') {
        const unclear = titleUnclear(input.tool_input.title, bossOwned(input.tool_input?.body));
        if (unclear.length) { console.error(`Blocked: ${TITLE_RULE}. Missing: ${unclear.join(', ')}. Write the title again and update the issue.`); process.exit(2); }
      }
      if (method === 'update' && typeof input.tool_input?.body === 'string' && textMissing(input.tool_input.body)) {
        console.error(`Blocked: ${TEXT_RULE}. Add the full texts or the approval page and update the issue again.`); process.exit(2);
      }
      if (method !== 'create') process.exit(0);
      body = input.tool_input?.body;
      title = input.tool_input?.title;
      repo = input.tool_input?.owner && input.tool_input?.repo ? `${input.tool_input.owner}/${input.tool_input.repo}` : null;
      boss = bossOwned(body, '', input.tool_input?.assignees || []);
    } else process.exit(0);
    if (titleMissing(repo, title)) {
      console.error(`Blocked: an issue of ${repo} names its objective or initiative first in the title: [<AREA>.<objective>] or [<AREA>-n], for example "[SYS.2] ...". Find the code in the roadmap of the repository and create the issue again.`);
      process.exit(2);
    }
    const unclear = title === null ? [] : titleUnclear(title, boss);
    if (unclear.length) {
      console.error(`Blocked: ${TITLE_RULE}. Missing: ${unclear.join(', ')}. Write the title again and create the issue.`);
      process.exit(2);
    }
    const gaps = missing(body, boss);
    if (gaps.length) {
      console.error(`Blocked: ${RULE}. Missing: ${gaps.join(', ')}. Write the body in this form and create the issue again:\n${TEMPLATE}`);
      process.exit(2);
    }
    const lines = bossMissing(body, boss);
    if (lines.length) {
      console.error(`Blocked: ${BOSS_RULE}. Missing: ${lines.join(', ')}. Add the part for Boss between "What and why:" and "Done when:" and create the issue again. One access is one issue: never a list of accesses.`);
      process.exit(2);
    }
    if (textMissing(body)) {
      console.error(`Blocked: ${TEXT_RULE}. Add the full texts or the approval page and create the issue again.`);
      process.exit(2);
    }
    const dups = duplicateOf(repo, title, body);
    if (dups.length) { console.error(duplicateRule(dups)); process.exit(2); }
  } catch (e) {
    console.error(`Blocked: issue-format hook error (${e.message}). The rule: ${RULE}.`);
    process.exit(2);
  }
}
