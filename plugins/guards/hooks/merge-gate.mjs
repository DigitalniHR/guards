// PreToolUse hook for Bash and the GitHub MCP merge tool: blocks (exit 2) a merge of a PR whose checks are red or
// still running (system#169). The repositories have no branch protection (the agent account has no admin right), so
// `gh pr merge` went through with the PR gate red (dhr#831, 8 Nov 2026). This hook makes the check the agent's gate.
// A PR with no checks passes once it is older than FRESH_MS (before that its checks may not have started). An error of gh blocks (fail closed): the merge waits, nothing is lost.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Every merge in a command: { ref, repo, dir }. ref is a number, URL or branch; repo from -R/--repo; dir from `cd <dir> &&`.
export function merges(command) {
  const out = [];
  const unq = (s) => (s || '').replace(/^["']|["']$/g, '');
  const cd = command.match(/(?:^|[;&|]\s*)cd\s+("[^"]+"|'[^']+'|(?:\\\s|[^\s;&|])+)\s*&&/);
  const dir = cd ? unq(cd[1]).replace(/\\ /g, ' ') : null;
  for (const m of command.matchAll(/\bgh\s+pr\s+merge\b([^\n;&|]*)/g)) {
    const args = m[1].trim().split(/\s+/).filter(Boolean);
    let ref = null, repo = null;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-R' || a === '--repo') { repo = unq(args[++i]); continue; }
      if (a.startsWith('--repo=')) { repo = unq(a.slice(7)); continue; }
      if (/^(-t|-b|--subject|--body|--body-file|-F|--match-head-commit|--author-email|-A)$/.test(a)) { i++; continue; }
      if (a.startsWith('-')) continue;
      if (/^\d*>/.test(a)) break;
      if (!ref) ref = unq(a);
    }
    out.push({ ref, repo, dir });
  }
  for (const m of command.matchAll(/\bgh\s+api\b[^\n;&|]*\brepos\/([\w.-]+\/[\w.-]+)\/pulls\/(\d+)\/merge\b/g)) {
    out.push({ ref: m[2], repo: m[1], dir });
  }
  return out;
}

// Verdict from `gh pr checks --json name,bucket`: the names of red and running checks.
export function verdict(checks) {
  const red = checks.filter((c) => c.bucket === 'fail' || c.bucket === 'cancel').map((c) => c.name);
  const running = checks.filter((c) => c.bucket === 'pending').map((c) => c.name);
  return { red, running };
}

function checksOf({ ref, repo, dir }, cwd) {
  const gh = process.env.MERGE_GATE_GH || 'gh';
  const args = ['pr', 'checks', ...(ref ? [ref] : []), ...(repo ? ['-R', repo] : []), '--json', 'name,bucket'];
  const home = process.env.HOME || '~';
  const where = dir ? path.resolve(cwd, dir.replace(/^~(?=\/|$)/, home).replace(/\$\{?HOME\}?/g, home)) : cwd;
  let stdout = '', stderr = '';
  try {
    stdout = execFileSync(gh, args, { cwd: where, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
  } catch (e) {
    // gh exits 1 on a red check and 8 on a running one, but still prints the JSON.
    stdout = String(e.stdout || ''); stderr = String(e.stderr || e.message || '');
  }
  if (/no checks reported/i.test(stderr)) return [];
  try { return JSON.parse(stdout); } catch {
    // `gh pr checks` reads GraphQL, which cloud sessions cannot reach; the REST check runs give the same verdict.
    if (/graphql/i.test(stderr) && repo && /^\d+$/.test(String(ref))) return restChecks(gh, repo, ref, where);
    throw new Error(`gh pr checks gave no result (${stderr.trim().split('\n')[0] || 'no output'})`);
  }
}

// The bucket of one REST check run, as `gh pr checks` names it.
export function bucketOf(run) {
  if (run.status !== 'completed') return 'pending';
  if (['failure', 'timed_out', 'action_required', 'startup_failure', 'stale'].includes(run.conclusion)) return 'fail';
  if (run.conclusion === 'cancelled') return 'cancel';
  if (run.conclusion === 'skipped' || run.conclusion === 'neutral') return 'skipping';
  return 'pass';
}

// A PR whose checks GitHub has not listed yet looks like a PR with no checks: studio#500 and studio#456 were merged
// 6 seconds after `gh pr create`, before their checks started (CAO, 12 Nov 2026). For FRESH_MS after the PR opens or
// its last commit, "no checks" means "not started yet".
export const FRESH_MS = 120000;
export function freshFor(times, now = Date.now()) {
  const last = Math.max(0, ...times.map((t) => Date.parse(t)).filter((n) => !Number.isNaN(n)));
  return last ? Math.max(0, FRESH_MS - (now - last)) : 0;
}

// Milliseconds a PR with no checks must still wait. A failed read blocks through the caller (fail closed).
function waitOf({ ref, repo, dir }, cwd) {
  const gh = process.env.MERGE_GATE_GH || 'gh';
  const home = process.env.HOME || '~';
  const where = dir ? path.resolve(cwd, dir.replace(/^~(?=\/|$)/, home).replace(/\$\{?HOME\}?/g, home)) : cwd;
  const run = (args) => execFileSync(gh, args, { cwd: where, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
  try {
    const pr = JSON.parse(run(['pr', 'view', ...(ref ? [ref] : []), ...(repo ? ['-R', repo] : []), '--json', 'createdAt,commits']));
    return freshFor([pr.createdAt, ...(pr.commits || []).map((c) => c.committedDate)]);
  } catch (e) {
    if (!(/graphql/i.test(String(e.stderr || '')) && repo && /^\d+$/.test(String(ref)))) throw new Error(`gh pr view gave no result (${String(e.stderr || e.message).trim().split('\n')[0]})`);
    const pr = JSON.parse(run(['api', `repos/${repo}/pulls/${ref}`]));
    return freshFor([pr.created_at, JSON.parse(run(['api', `repos/${repo}/commits/${pr.head.sha}`])).commit?.committer?.date]);
  }
}

function restChecks(gh, repo, ref, where) {
  const api = (route) => JSON.parse(execFileSync(gh, ['api', route], { cwd: where, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }));
  const sha = api(`repos/${repo}/pulls/${ref}`).head.sha;
  return (api(`repos/${repo}/commits/${sha}/check-runs?per_page=100`).check_runs || []).map((r) => ({ name: r.name, bucket: bucketOf(r) }));
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
    const tool = String(input.tool_name || '');
    const cwd = String(input.cwd || process.cwd());
    let targets = [];
    if (tool === 'Bash') {
      const { commandText } = await import('./forbidden-patterns.mjs');
      targets = merges(commandText(String(input.tool_input?.command || '')));
    } else if (/merge_pull_request$/.test(tool)) {
      const t = input.tool_input || {};
      targets = [{ ref: String(t.pullNumber ?? t.pull_number ?? ''), repo: `${t.owner}/${t.repo}`, dir: null }];
    }
    for (const t of targets) {
      const checks = checksOf(t, cwd);
      const { red, running } = verdict(checks);
      const name = `${t.repo ? t.repo + '#' : 'PR '}${t.ref || '(this branch)'}`;
      const wait = checks.length ? 0 : waitOf(t, cwd);
      if (wait) {
        console.error(`Blocked: ${name} has no checks yet and was opened or pushed under ${FRESH_MS / 1000} s ago: its checks may not have started. Wait ${Math.ceil(wait / 1000)} s, read gh pr checks, then merge (system#169).`);
        process.exit(2);
      }
      if (red.length) {
        console.error(`Blocked: ${name} has red checks (${red.join(', ')}). Fix the cause (for the PR gate: a line 'Cause:' and a line 'Research:' in the PR body), let the checks pass, then merge (system#169).`);
        process.exit(2);
      }
      if (running.length) {
        console.error(`Blocked: ${name} has checks still running (${running.join(', ')}). Wait for them: gh pr checks ${t.ref || ''} ${t.repo ? '-R ' + t.repo : ''} --watch, then merge (system#169).`);
        process.exit(2);
      }
    }
  } catch (e) {
    console.error(`Blocked: merge-gate hook error (${e.message}). Read the checks with gh pr checks, then merge again.`);
    process.exit(2);
  }
}
