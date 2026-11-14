# guards

The guards of the DigitalniHR system for Claude Code: a goal file with the cause, the research and the one design before work, blocked destructive commands, a permission gate, an event log, a compaction guard, a claim guard (one engineer per issue: a label write of the GitHub connector needs a fresh read and never removes the Mac claim, system#386), a context guard (a reminder to hand off from 200 k tokens of context), a label guard (a label write outside the one list `labels.json`, an old name or a label delete is blocked, system#515). One set for the Mac and for every cloud session.

This public repository is a read-only copy of `plugins/guards` of the private system repository, pushed by its workflow `Guards sync`. Do not edit it here.

Install into a settings file:

    node plugins/guards/install.mjs ~/.claude/settings.json

Cloud: the setup script of every environment clones this repository to /opt/guards and runs the same line; if the
clone fails it installs one hook that blocks every tool ("guards missing"), so a session never runs without guards.
The hook refresh.mjs pulls and reinstalls at every session start. So every session in every repository (the Mac once, the cloud by the setup script of each environment) has them; the problem issue template asks for `Cause:` and `Research:` too.
