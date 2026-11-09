// Forbidden command patterns. One list, used by forbidden-commands.mjs
// (PreToolUse, blocks) and permission-gate.mjs (PermissionRequest, denies).
// Each entry: [regex, reason, safe way]. A regex matches anywhere in the command text,
// also inside bash -c, eval, here-docs, python3 -c, and after && ; |.
const G = String.raw`\bgit(?:\s+(?:-[Cc]\s+(?:"[^"]*"|'[^']*'|\S+)|--[\w-]+(?:=\S+)?))*\s+`; // git + global options
const S = String.raw`[^\n;&|]*`; // rest of the same command segment
const END = String.raw`(?=\s|["']|$)`;
const re = (s) => new RegExp(s);

// Key files. A command is blocked when it reads or copies the content of one
// (read verb before the path in the same segment, a "< path" redirect, or
// python -c / node -e code that names it). Loading forms (source, ., set -a),
// ls and test -f pass. ~/.railway/config.json is left out on purpose.
const KEY = String.raw`(?:(?:~|\$\{?HOME\}?|/Users/[^/\s]+|/home/[^/\s]+)/\.(?:ssh|aws|gnupg|config/gh)(?=/|\s|["';&|]|$)|\.claude/\.env\b|\.credentials\.json)`;
const READ_VERB = String.raw`(?<![\w./-])(?:cat|less|more|head|tail|grep|egrep|fgrep|rg|sed|awk|cut|cp|scp|rsync|base64|xxd|od|strings|curl)(?![\w-])`;
const READ_CALL = String.raw`(?:\bopen\(|read_text|read_bytes|readFileSync)`;
const KEY_READ = [
  `${READ_VERB}${S}${KEY}`,
  `${READ_CALL}${S}${KEY}`,
  `(?<!<)<\\s*${KEY}`,
  `\\bpython[\\w.]*\\s+-c\\s+(?:"[^"]*|'[^']*)${KEY}`,
  `\\bnode\\s+-e\\s+(?:"[^"]*|'[^']*)${KEY}`,
].join('|');

export const DENY = [
  [re(`${G}push\\b${S}\\s(?:--force\\b|-[a-zA-Z]*f[a-zA-Z]*${END})`), 'force push', 'push a new branch and open a new PR'],
  [re(`${G}push\\b${S}\\s\\+[\\w./-]`), 'force push (+refspec)', 'push a new branch and open a new PR'],
  [re(`${G}reset\\b${S}\\s--hard\\b`), 'git reset --hard', 'make a new worktree from origin/main'],
  [re(`${G}branch\\b${S}\\s-[a-zA-Z]*D\\b`), 'git branch -D', 'a branch merged into origin/main passes this hook by itself (system#97); an unmerged branch stays: push it and open a PR, or leave it'],
  [re(String.raw`\bgh\s+(repo|release)\s+delete\b`), 'GitHub repo/release delete', 'Boss does this himself. Stop and report'],
  [re(String.raw`\brailway\s+(down|delete|(service|environment|project|variables?|volume|redis|database)\s+delete)\b`), 'Railway delete', 'Boss does this himself. Stop and report'],
  [re(String.raw`\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)+(--\s+)?("|')?(\/|~|\$HOME)("|')?\/?(\*)?(\s|;|&|\||$)`), 'rm -r on / or home', 'delete the exact folder by its full path'],
  [re(String.raw`\brailway\s+ssh\b[^\n]*(?<![\w./-])(?:env|printenv)(?![\w-])`), 'prints the server variables (keys) over railway ssh', 'for the names only use compgen -e'],
  [re(String.raw`\brailway\s+ssh\b[^\n]*\brm\s[^\n]*\/data\b`), 'deletes on the server volume /data over railway ssh', 'Boss does this himself. Stop and report'],
  // A command that reads or copies a key file (the Read deny covers the Read tool only).
  [re(KEY_READ), 'reads a key file', 'load the keys inside the command that needs them (source the file, never print it)'],
  // Lose uncommitted work of a parallel agent.
  [re(`${G}checkout\\b${S}\\s--${END}`), 'git checkout -- <path> (loses uncommitted work of a parallel agent)', 'work in your own worktree from origin/main; to set your own change aside use git stash push -m <tag>'],
  [re(`${G}restore\\b(?!${S}(?:--staged\\b|\\s-S\\b))`), 'git restore without --staged (loses uncommitted work of a parallel agent)', 'work in your own worktree from origin/main; to set your own change aside use git stash push -m <tag>'],
  [re(`${G}restore\\b${S}(?:--worktree\\b|\\s-[a-zA-Z]*W)`), 'git restore --worktree (loses uncommitted work of a parallel agent)', 'work in your own worktree from origin/main; to set your own change aside use git stash push -m <tag>'],
  [re(`${G}clean\\b${S}\\s(?:--force\\b|-[a-zA-Z]*[fd][a-zA-Z]*${END})`), 'git clean -f/-d (loses uncommitted work of a parallel agent)', 'work in your own worktree from origin/main; to set your own change aside use git stash push -m <tag>'],
  [re(`${G}stash\\s+(?:drop|clear)\\b`), 'git stash drop/clear (loses uncommitted work of a parallel agent)', 'Boss does this himself. Stop and report'],
];

// The body of a quoted here-doc that only writes a file (cat or tee into a file) is data, not a command: the words of a
// rule in a report or a log do not block (CCO deep audit, 28 Oct 2026). Any other here-doc stays checked.
export function commandText(command) {
  // A here-doc body is data (an issue body, a commit message), not a command: it leaves the text before matching
  // (system#97). Any verb, the tag quoted or not; the closing tag on its own line.
  return command.replace(/<<-?\s*(["']?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\s*\n|\s*\)|$)/g, (m, q, tag) => m.split('\n')[0] + '\n' + tag);
}

// Branch names after `git branch -D` (one or several). Empty when none.
export function deletedBranches(command) {
  // A redirect ("2>&1", "> log") ends the names (system#150).
  const m = /\bbranch\b[^\n;&|]*?\s-[a-zA-Z]*D\b((?:\s+(?!-)(?!\d*>)[\w./-]+(?![\w./-]*>))+)/.exec(command);
  return m ? m[1].trim().split(/\s+/) : [];
}
