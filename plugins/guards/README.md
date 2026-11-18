# guards

The guards of the DigitalniHR system for Claude Code: blocked destructive commands and patterns (`forbidden-commands`, `forbidden-patterns`), a permission gate, an event log, a claim guard (one engineer per issue: it keeps the engineer lock on Status In progress) and `refresh`. One set for the Mac and for every cloud session. One code check for the CI of every repository: `checks/house_rules.py`, run from this public copy with `git clone -q --depth 1 https://github.com/DigitalniHR/guards "$RUNNER_TEMP/guards" && python3 -I "$RUNNER_TEMP/guards/plugins/guards/checks/house_rules.py"`.

This public repository is a read-only copy of `plugins/guards` of the private system repository, pushed by its workflow `Guards sync`. Do not edit it here.

Install into a settings file:

    node plugins/guards/install.mjs ~/.claude/settings.json

Cloud: the setup script of every environment clones this repository to /opt/guards and runs the same line; if the clone fails it installs one hook that blocks every tool ("guards missing"), so a session never runs without guards.
The installer also sets `claudeMdExcludes` (`excludes.mjs`): when `~/.claude/CLAUDE.md` is a symlink to a checkout (the Mac), the copies of that file in the worktrees of the same repository do not load again. With no symlink (the cloud) it sets no pattern.
It caps `autoCompactWindow` at 200,000 tokens, and sets `env.CLAUDE_CODE_SUBAGENT_MODEL` to `sonnet` when the settings have none (or `inherit`); the cloud ignores this variable from settings.
The hook `refresh.mjs` pulls and reinstalls at every session start.
