#!/usr/bin/env node
// Installs the guards (plugins/guards/hooks/hooks.json) into a Claude Code settings file, so the same hooks run on the
// Mac and in every cloud session without a Team or Enterprise plan (Boss, 8 Nov 2026). The cloud setup script of each
// environment runs it after the repositories are cloned; the Mac runs it once. Idempotent: hooks it installed before
// are replaced, other hooks of the file stay.
// Usage: node install.mjs <settings.json> [hooks dir]   (also bin/install_guards.mjs in DigitalniHR/system; the public copy
// DigitalniHR/guards has this file at its root, so a cloud session without the system repository installs it too)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2];
const dir = path.resolve(process.argv[3] || path.join(fs.realpathSync(here), 'hooks'));
if (!target) { console.error('usage: install_guards.mjs <settings.json> [hooks dir]'); process.exit(1); }
const plugin = JSON.parse(fs.readFileSync(path.join(dir, 'hooks.json'), 'utf8')).hooks;
let settings = {};
try { settings = JSON.parse(fs.readFileSync(target, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const MARK = '/plugins/guards/hooks/';
const hooks = settings.hooks || {};
for (const ev of Object.keys(hooks)) {   // drop what an earlier run installed
  hooks[ev] = hooks[ev].map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !String(h.command || '').includes(MARK)) })).filter(g => g.hooks.length);
  if (!hooks[ev].length) delete hooks[ev];
}
for (const [ev, groups] of Object.entries(plugin)) {
  const fixed = groups.map(g => ({ ...g, hooks: g.hooks.map(h => ({ ...h, command: h.command.replaceAll('${CLAUDE_PLUGIN_ROOT}/hooks', dir) })) }));
  hooks[ev] = [...(hooks[ev] || []), ...fixed];
}
settings.hooks = hooks;
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(settings, null, 2) + '\n');
console.log(`guards: ${Object.values(plugin).flat().length} hook groups installed into ${target} from ${dir}`);
