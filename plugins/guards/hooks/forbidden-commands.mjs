// PreToolUse hook for Bash and Monitor: blocks (exit 2) a command whose text
// matches a forbidden pattern anywhere. Any error blocks too (fail closed).
import { readFileSync } from 'node:fs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const tool = input.tool_name || '';
  if (tool === 'Bash' || tool === 'Monitor') {
    const { DENY, commandText, deletedBranches } = await import('./forbidden-patterns.mjs');
    const command = commandText(String(input.tool_input?.command || ''));
    let hit = DENY.find(([re]) => re.test(command));
    if (hit && hit[1] === 'git branch -D') {
      // The hook, not the agent, knows a merged branch (system#97): every name after -D merged into origin/main passes.
      const { execFileSync } = await import('node:child_process');
      const names = deletedBranches(command);
      // The repository is where the command runs: `git -C <dir>` or a leading `cd <dir> &&`, else the session folder
      // (8 Nov 2026: `cd <repo> && git branch -D` from a session outside the repository failed with "not a git repository").
      const quoted = (re) => { const m = command.match(re); return m ? (m[1] ?? m[2] ?? m[3]) : null; };
      // An unquoted path may carry escaped spaces ("Claude\ projects").
      const dirArg = quoted(/\bgit\s+-C\s+(?:"([^"]+)"|'([^']+)'|((?:\\\s|[^\s;&|])+))[^;&|]*\bbranch\b/) || quoted(/(?:^|[;&|]\s*)cd\s+(?:"([^"]+)"|'([^']+)'|((?:\\\s|[^\s;&|])+))\s*&&[^;|]*\bbranch\b/);
      const expand = (p) => p.replace(/^~(?=\/|$)/, process.env.HOME || '~').replace(/\$\{?HOME\}?/g, process.env.HOME || '$HOME');
      const base = String(input.cwd || process.cwd());
      const cwd = dirArg ? (await import('node:path')).resolve(base, expand(dirArg.replace(/\\ /g, ' '))) : base;
      // A folder that is not a repository is not a crash: no branch there is proved merged (system#151).
      let merged = [], noRepo = false;
      try {
        merged = execFileSync('git', ['-C', cwd, 'branch', '--merged', 'origin/main', '--format=%(refname:short)'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
          .split('\n').map((x) => x.trim()).filter(Boolean);
      } catch { noRepo = true; }
      // A squash merge leaves the branch out of --merged: its content is in main when a merge into origin/main
      // changes no file (merge-tree gives the tree of origin/main). A conflict or an error counts as unmerged.
      const git = (...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      const inMain = (n) => {
        try { return git('merge-tree', '--write-tree', 'origin/main', n).split('\n')[0] === git('rev-parse', 'origin/main^{tree}'); } catch { return false; }
      };
      const unmerged = names.filter((n) => !merged.includes(n) && !inMain(n));
      if (names.length && !unmerged.length) hit = undefined;
      else if (noRepo) hit = [hit[0], `git branch -D where the merge cannot be checked: ${cwd} is not a git repository with origin/main (${names.join(', ')})`, `run it in the repository (cd <repo> && ... or git -C <repo> ...)`];
      else if (unmerged.length) hit = [hit[0], `git branch -D of a branch not merged into origin/main (${unmerged.join(', ')})`, hit[2]];
    }
    if (hit) {
      console.error(`Blocked by Boss policy: ${hit[1]}. Safe way: ${hit[2]}. Do not retry the blocked command.`);
      process.exit(2);
    }
  }
} catch (e) {
  console.error(`Blocked: forbidden-commands hook error (${e.message}).`);
  process.exit(2);
}
