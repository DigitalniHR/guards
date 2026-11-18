// PreToolUse hook for Bash and Monitor: blocks (exit 2) a command whose text
// matches a forbidden pattern anywhere. Any error blocks too (fail closed).
import fs, { readFileSync } from 'node:fs';

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
      let unmerged = names.filter((n) => !merged.includes(n) && !inMain(n));
      // A branch squash-merged on GitHub seconds before is not yet in the local origin/main (system#183):
      // fetch origin main once and judge again. A failed fetch keeps the local judgment (fail closed).
      if (unmerged.length && !noRepo) {
        try {
          execFileSync('git', ['-C', cwd, 'fetch', '-q', 'origin', 'main'], { stdio: 'ignore', timeout: 15000 });
          merged = git('branch', '--merged', 'origin/main', '--format=%(refname:short)').split('\n').map((x) => x.trim()).filter(Boolean);
          unmerged = unmerged.filter((n) => !merged.includes(n) && !inMain(n));
        } catch { /* keep the local judgment */ }
      }
      // A squash branch whose files main changed later conflicts in merge-tree (system#291: 18 studio branches).
      // GitHub is the proof: a merged PR of that branch whose head is the local tip. Later work, no PR or an error blocks.
      // The REST route, not `gh pr list` (GraphQL): the cloud sessions get 403 on GraphQL (system#293). The owner and the
      // repository come from the origin URL (github.com, ssh or the cloud git proxy), not from a gh lookup.
      const mergesFirst = /\b(gh\s+pr\s+merge|safe_merge\.sh)\b[\s\S]*\bbranch\b[^\n;&|]*?\s-[a-zA-Z]*D\b/.test(command);
      const onGitHub = (n) => {
        try {
          const m = git('remote', 'get-url', 'origin').match(/([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
          if (!m) return false;
          const route = `repos/${m[1]}/${m[2]}/pulls?state=closed&per_page=100&head=${encodeURIComponent(`${m[1]}:${n}`)}`;
          const prs = JSON.parse(execFileSync(process.env.FORBIDDEN_GH || 'gh', ['api', route],
            { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }));
          const tip = git('rev-parse', `refs/heads/${n}`);
          if (Array.isArray(prs) && prs.some((p) => p.merged_at && p.head?.sha === tip)) return true;
          // A command that merges and then deletes is judged before its merge runs (system#516: 8 refusals in 24 h).
          // With a merge step before the delete, an open PR whose head is the local tip is the proof: every local
          // commit is on GitHub in that PR, merged or not. Without a merge step an open PR does not pass.
          if (!mergesFirst) return false;
          const open = JSON.parse(execFileSync(process.env.FORBIDDEN_GH || 'gh', ['api', route.replace('state=closed', 'state=open')],
            { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }));
          return Array.isArray(open) && open.some((p) => p.state === 'open' && p.head?.sha === tip);
        } catch { return false; }
      };
      if (unmerged.length && !noRepo) unmerged = unmerged.filter((n) => !onGitHub(n));
      if (names.length && !unmerged.length) hit = undefined;
      else if (noRepo) hit = [hit[0], `git branch -D where the merge cannot be checked: ${cwd} is not a git repository with origin/main (${names.join(', ')})`, `run it in the repository (cd <repo> && ... or git -C <repo> ...)`];
      else if (unmerged.length) hit = [hit[0], `git branch -D of a branch not merged into origin/main (${unmerged.join(', ')})`, hit[2]];
    }
    // The system checkout on the Mac must stay on main: the SessionStart sync only fast-forwards main, so a branch
    // made there leaves every new session on old rules (system#862, #344; branch content-doc-link, 18 Nov 2026).
    // A branch-making command whose repository is that checkout (not a linked worktree) is blocked.
    if (!hit && /\bgit\b[^\n;&|]*\b(?:checkout|switch)\b/.test(command)) {
      const { execFileSync } = await import('node:child_process');
      const path = await import('node:path');
      const q = (re) => { const m = command.match(re); return m ? (m[1] ?? m[2] ?? m[3]) : null; };
      const dirArg = q(/\bgit\s+-C\s+(?:"([^"]+)"|'([^']+)'|((?:\\\s|[^\s;&|])+))/) || q(/(?:^|[;&|]\s*)cd\s+(?:"([^"]+)"|'([^']+)'|((?:\\\s|[^\s;&|])+))\s*&&/);
      const home = process.env.HOME || '~';
      const dir = path.resolve(String(input.cwd || process.cwd()), dirArg ? dirArg.replace(/\\ /g, ' ').replace(/^~(?=\/|$)/, home).replace(/\$\{?HOME\}?/g, home) : '.');
      try {
        const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        const top = g('rev-parse', '--show-toplevel');
        const main = path.resolve(dir, g('rev-parse', '--git-dir')) === path.resolve(dir, g('rev-parse', '--git-common-dir'));
        const guarded = process.env.FORBIDDEN_SYNC_REPO || path.join(home, 'Claude projects', 'system');
        if (main && fs.realpathSync(top) === fs.realpathSync(guarded)) {
          // A new branch, or a switch to any existing branch other than main (system#873: content-doc-link was switched to).
          const making = /\bgit\b[^\n;&|]*\b(?:checkout\s+[^\n;&|]*-[bB]\b|switch\b[^\n;&|]*(?:\s-[cC]\b|--(?:force-)?create\b))/.test(command);
          const seg = (command.match(/\bgit\b[^\n;&|]*\b(?:checkout|switch)\b([^\n;&|]*)/) || [])[1] || '';
          const words = seg.trim().split(/\s+/).filter(Boolean);
          const cut = words.indexOf('--');
          const target = (cut < 0 ? words : words.slice(0, cut)).filter((w) => !w.startsWith('-'))[0];
          const isBranch = target && target !== 'main' && ['refs/heads/', 'refs/remotes/origin/'].some((r) => { try { g('rev-parse', '--verify', '-q', r + target.replace(/^origin\//, '')); return true; } catch { return false; } });
          if (making || isBranch) hit = [/x/, 'a branch other than main in the system checkout (it must stay on main for the session sync, system#862, system#873)', 'work in your own worktree: git worktree add <path> -b <branch> origin/main'];
        }
      } catch { /* not a repository, or no guarded checkout here: nothing to protect */ }
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
