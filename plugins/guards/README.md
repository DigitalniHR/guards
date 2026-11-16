# guards

The guards of the DigitalniHR system for Claude Code: a goal file with the cause, the research and the one design before work, blocked destructive commands, a permission gate, an event log, a compaction guard, a claim guard (one engineer per issue: a label write of the GitHub connector needs a fresh read and never removes the Mac claim, system#386), a label guard (a label write outside the one list `labels.json`, an old name or a label delete is blocked, system#515). At the end of a turn only two checks block, each once per message of Boss: an open step of the goal file (`goal-stop`) and a "done" with no proof (the prompt hook of the Mac settings); format checks of the end message do not block (system#670). One set for the Mac and for every cloud session. One code check for the CI of every repository: `checks/house_rules.py` (cleaning rules R4 and R6, system#699), run from this public copy with `git clone -q --depth 1 https://github.com/DigitalniHR/guards "$RUNNER_TEMP/guards" && python3 -I "$RUNNER_TEMP/guards/plugins/guards/checks/house_rules.py"`.

This public repository is a read-only copy of `plugins/guards` of the private system repository, pushed by its workflow `Guards sync`. Do not edit it here.

Install into a settings file:

    node plugins/guards/install.mjs ~/.claude/settings.json

Cloud: the setup script of every environment clones this repository to /opt/guards and runs the same line; if the
clone fails it installs one hook that blocks every tool ("guards missing"), so a session never runs without guards.
The installer also sets `claudeMdExcludes` (`excludes.mjs`): when `~/.claude/CLAUDE.md` is a symlink to a checkout (the Mac),
the copies of that file in the worktrees of the same repository do not load again, so a session reads the global rules
one time (system#673). With no symlink (the cloud) it sets no pattern.
It also sets `autoCompactWindow` to 200,000 tokens when the settings have none, so a session compacts its history there and not at about 967 k (system#707); a value already in the settings stays.
The hook refresh.mjs pulls and reinstalls at every session start. So every session in every repository (the Mac once, the cloud by the setup script of each environment) has them; the problem issue template asks for `Cause:` and `Research:` too.
