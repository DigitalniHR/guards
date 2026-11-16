// The global rules load one time (system#673). On the Mac ~/.claude/CLAUDE.md is a symlink to CLAUDE.md of the main
// checkout of the system repository. Claude Code loads it as the user file and, in a worktree of that repository, loads
// the worktree copy again as the project file: a different path, so no dedupe (about 4,000 tokens per session). These
// claudeMdExcludes patterns skip the worktree copies (docs: code.claude.com/docs/en/memory, "Exclude specific CLAUDE.md
// files"). The main checkout is not in the patterns: there the loader dedupes the one real path itself. With no
// symlinked user file (a cloud session), the project copy is the only copy, so no pattern applies.
import fs from 'node:fs'; import path from 'node:path';

// A session compacts its history at this many tokens (system#707). Without the setting a 1M model compacts at about
// 967 k, and every request re-reads the whole history: in the week 9 to 15 Nov 2026 the tokens above 200 k cost 288 USD.
// Docs: code.claude.com/docs/en/model-config, "Set the auto-compact window" (`autoCompactWindow`, for every model).
// From the first compaction compaction-guard.mjs tells the session to finish and hand off.
export const WINDOW = 200_000;

// The patterns for a settings file in dir (the folder of ~/.claude/settings.json), or [] when its CLAUDE.md is no link.
export function ruleExcludes(dir) {
  let link; try { if (!fs.lstatSync(path.join(dir, 'CLAUDE.md')).isSymbolicLink()) return []; link = fs.realpathSync(path.join(dir, 'CLAUDE.md')); } catch { return []; }
  const repo = path.basename(path.dirname(link));   // "system": its worktrees are <repo>-<n> and <repo>/.claude/worktrees/<n>
  return [`**/${repo}-*/CLAUDE.md`, `**/${repo}/.claude/worktrees/*/CLAUDE.md`];
}

// Our patterns of an older run (they end in /CLAUDE.md and name a worktree form) leave; the patterns of the owner stay.
export function withExcludes(settings, dir) {
  const own = (p) => /^\*\*\/[^/]+(-\*|\/\.claude\/worktrees\/\*)\/CLAUDE\.md$/.test(p);
  const list = [...(settings.claudeMdExcludes || []).filter((p) => !own(p)), ...ruleExcludes(dir)];
  const out = { ...settings }; if (list.length) out.claudeMdExcludes = list; else delete out.claudeMdExcludes;
  if (out.autoCompactWindow == null) out.autoCompactWindow = WINDOW;   // a value of the owner stays
  return out;
}
