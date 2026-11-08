# guards

The guards of the DigitalniHR system for Claude Code: a goal file with the cause and the research before work, blocked destructive commands, a permission gate, an event log, a compaction guard. One set for the Mac and for every cloud session.

This public repository is a read-only copy of `plugins/guards` of the private system repository, pushed by its workflow `Guards sync`. Do not edit it here.

Install into a settings file:

    node plugins/guards/install.mjs ~/.claude/settings.json

Cloud: the setup script of every environment clones this repository to /opt/guards and runs the same line; if the
clone fails it installs one hook that blocks every tool ("guards missing"), so a session never runs without guards.
The hook refresh.mjs pulls and reinstalls at every session start.
