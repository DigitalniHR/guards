#!/usr/bin/env node
// UserPromptSubmit: one sentence before each task, so the session splits work and uses the smallest model (Boss, 18 Nov 2026).
process.stdout.write('Split the task into smaller parts when you can. Give each independent part to a helper agent or a parallel session on the smallest model that does the job (Haiku: search, read, count, classify; Sonnet: scoped edits). Keep design, review and writing for Boss in this session.\n');
