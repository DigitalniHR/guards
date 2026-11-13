// PreToolUse hook: a new GitHub issue names its end state for Boss (Boss, 8 Nov 2026, system#122: 96 of 213 open
// issues had a "Done when" line; work was closed half done). Blocks (exit 2) `gh issue create` and the GitHub MCP
// issue_write create when the body does not have the lite form (missing): What and why, Done when with the proof in
// each line, Owner. A comment or an edit is not a new piece of work and is not checked for the form.
// An issue with "Owner: Boss" also has Boss decides, Options and Recommendation with "With no answer in 7 days:" (bossMissing).
// An issue with "Owner: Boss (public content)" needs the full text or an approval page (textMissing), also on an edit.
// The title of a new or renamed issue is a plain sentence, and for a Boss issue it names his act (titleUnclear).
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
export function bossOwned(body, command = '') {
  return /^\W*owner\s*:\W*boss\b/im.test(String(body || '')) || /(?:--label|-l)[ =]["']?[^"'\s]*owner:boss\b/.test(String(command));
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
// when with the proof in each line, Owner; an issue where Boss decides also has Boss decides, Options, Recommendation.
export const TEMPLATE = '**What and why:** <1 to 3 sentences in business words; each internal term with its meaning>\n\n**Done when:**\n1. <a result Boss or a customer sees, true or false>. Proof: <the check, and where to open it>.\n(1 to 5 lines)\n\n**Owner:** <who acts next and the first act: "Agent: the engineer of this repository takes it and first ..." or "Boss (<class>): he answers on this page with a thumbs-up or the number of an option">\n\n## Details (for agents)\n<optional: steps, links, times, markers>';
export const RULE = 'a new issue has the lite form: "What and why:" opens it (1 to 3 sentences in business words), "Done when:" is a list of 1 to 5 results, each true or false, checkable when the work ends (no time window such as "for two weeks"), in Boss words (no code, file or "merged/PR/tests" words) and each with its check after "Proof:" in the same line, and "Owner:" names who acts next and the first act; detail only an agent needs goes under "## Details (for agents)" (template and examples: system standards/evals.md)';

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
  if (!/^\W*owner\s*:\W*\S/im.test(b)) out.push('Owner');
  return out;
}

// The part for Boss of an issue where he decides (Boss, 13 Nov 2026, on dhr#34: "I do not understand it at all"):
// Boss decides, Options (2 or 3), Recommendation (one concrete answer, never the choice again, and what happens with
// no answer in 7 days, so the engineer can apply it: system#59).
export const BOSS_RULE = 'an issue where Boss decides ("Owner: Boss (<class>)") also has, in plain business words: "Boss decides:" (the one question), "Options:" (a list of 2 or 3, each with what it causes) and "Recommendation:" (ONE concrete answer first, with its value, then the reason: "Option 2: add 100 USD, because ..."; never "decide A or B" or "set X"), which ends with "With no answer in 7 days: <what happens>"; template and examples: system standards/evals.md';
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
export const TEXT_RULE = 'an issue with "Owner: Boss (public content)" shows the full final text of each item under a heading "## Full text" (current and new side by side where text is replaced), or names its piece file in a line "Draft: content/<brand>/<type>/<slug>/7-FINAL.md", or has one line "Approval page: <https link>" to the Boss page that shows all full texts and lets Boss edit them; a summary, the first lines or links to comments are not enough (rule: studio content/README.md, section "Drafts and approval")';
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
      const create = /(?:^|[;&|(]\s*|\n\s*)gh\s+issue\s+create\b/.test(bare);
      const edit = /(?:^|[;&|(]\s*|\n\s*)gh\s+issue\s+edit\b/.test(bare);
      if (!create && !edit) process.exit(0);
      body = bodyOf(command, String(input.cwd || process.cwd()));
      if (body === null) process.exit(0);
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
    } else if (/issue_write$/.test(tool)) {
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
      boss = bossOwned(body) || (input.tool_input?.labels || []).includes('owner:boss');
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
  } catch (e) {
    console.error(`Blocked: issue-format hook error (${e.message}). The rule: ${RULE}.`);
    process.exit(2);
  }
}
