// SessionStart (startup|resume): in a cloud session, pulls the public copy of the guards (/opt/guards, cloned by the
// setup script of the environment) and installs it again, so a guard fix reaches the cloud at the next session start,
// not after the environment cache expires (CCO review, 8 Nov 2026). On the Mac bin/checkout_sync.sh --hook keeps the files current,
// but a new guard in hooks.json is not in the settings until install.mjs runs (system#169: merge-gate): when a hook of
// hooks.json is missing from the settings, it installs again. Never blocks a session start.
import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The hook commands of hooks.json (with the hooks dir) that the settings text does not hold.
export function missing(hooksJson, settingsText, dir) {
  return Object.values(hooksJson.hooks || {}).flat().flatMap((g) => g.hooks || [])
    .map((h) => String(h.command || '').replaceAll('${CLAUDE_PLUGIN_ROOT}/hooks', dir))
    .filter((c) => !settingsText.includes(JSON.stringify(c).slice(1, -1)));
}

const ROOT = '/opt/guards';
try {
  if (process.env.CLAUDE_CODE_REMOTE && fs.existsSync(path.join(ROOT, '.git'))) {
    execFileSync('git', ['-C', ROOT, 'pull', '--ff-only', '-q'], { stdio: 'ignore', timeout: 20000 });
    execFileSync('node', [path.join(ROOT, 'plugins', 'guards', 'install.mjs'), path.join(os.homedir(), '.claude', 'settings.json')], { stdio: 'ignore', timeout: 20000 });
  } else if (!process.env.CLAUDE_CODE_REMOTE && process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const target = process.env.GUARDS_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
    let text = ''; try { text = fs.readFileSync(target, 'utf8'); } catch { /* no settings yet: install makes them */ }
    if (missing(JSON.parse(fs.readFileSync(path.join(dir, 'hooks.json'), 'utf8')), text, dir).length) {
      execFileSync('node', [path.join(dir, '..', 'install.mjs'), target, dir], { stdio: 'ignore', timeout: 20000 });
    }
  }
} catch { /* an old copy of the guards still runs; the CAO check sees a stale sync */ }
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) process.exit(0);
