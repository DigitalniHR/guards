// node --test hooks/tests/issue-format.test.mjs  (system#122; the lite form of every issue: system#479)
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { bossMissing, recommendationVague, missing, results, doneWhen } from '../issue-format.mjs';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'issue-format.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'if-'));
const run = (tool_name, tool_input) => spawnSync('node', [hook], { input: JSON.stringify({ tool_name, tool_input, cwd: tmp }), encoding: 'utf8' });
const cli = (args, input) => spawnSync('node', [hook, ...args], { input, encoding: 'utf8' });
const inline = (body) => body.replace(/\n/g, '\\n');   // the body as a bash --body "..." argument

// The lite form: What and why, Done when (each line with its Proof), Owner, then the detail under Details.
const WHY = '**What and why:** The page shows an old number, so readers see a wrong result.';
const DONE = '**Done when:**\n1. Boss opens the page and sees the new number. Proof: the page read at phone width.\n2. A reader can sign up. Proof: a test sign-up gets the e-mail.';
const AGENT = '**Owner:** Agent: the engineer of this repository takes it and first reads the page.';
const DETAILS = '## Details (for agents)\nUnit: web. Check ID: x.\n';
const lite = (done = DONE, owner = AGENT) => `${WHY}\n\n${done}\n\n${owner}\n\n${DETAILS}`;
const good = lite();
// An issue where Boss decides: Boss decides, Options, Recommendation with "With no answer in 7 days:", Owner Boss.
const BOSS_OWNER = '**Owner:** Boss (money): he answers on this page with a thumbs-up or the number of an option.';
const bossBody = (owner = BOSS_OWNER, rec = 'Option 1, pay 20 USD a month, because it removes the manual work. With no answer in 7 days: nothing is paid.') =>
  `**What and why:** The tool that makes the pictures costs 20 USD a month.\n\n**Boss decides:** Do we pay for the tool?\n\n**Options:**\n1. Pay: 20 USD a month, pictures in minutes.\n2. Do not pay: the pictures stay manual work.\n\n**Recommendation:** ${rec}\n\n${DONE}\n\n${owner}\n\n${DETAILS}`;
const BOSS = bossBody();
fs.writeFileSync(path.join(tmp, 'good.md'), good);
fs.writeFileSync(path.join(tmp, 'good3.md'), lite('**Done when:**\n1. Boss sees a. Proof: x.\n2. Boss sees b. Proof: y.\n3. Boss sees c. Proof: z.'));
fs.writeFileSync(path.join(tmp, 'bad.md'), 'Objective: x\n\n## Steps\n- [ ] do it\n');
const T = '--title "The page shows the new number"';
const doneOf = (...lines) => `**Done when:**\n${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;
const create = (body, title = 'The page shows the new number') => run('Bash', { command: `gh issue create --title "${title}" --body "${inline(body)}"` });

test('other commands pass', () => { assert.equal(run('Bash', { command: 'git status' }).status, 0); });
test('a comment passes', () => { assert.equal(run('Bash', { command: 'gh issue comment 5 --body "no lines"' }).status, 0); });
test('a body file in the lite form passes', () => { assert.equal(run('Bash', { command: 'gh issue create -R a/b --title "The page shows the new number" --body-file good.md' }).status, 0); });
test('a body file in the old form is blocked and names the parts', () => {
  const r = run('Bash', { command: `gh issue create -R a/b --title "The page shows the new number" --body-file "${path.join(tmp, 'bad.md')}"` });
  assert.equal(r.status, 2); assert.match(r.stderr, /Missing: What and why, Done when\./);
  assert.match(r.stderr, /\*\*What and why:\*\*/);   // the template is shown
});
test('an inline lite body passes', () => { assert.equal(create(good).status, 0); });
test('no body at all is blocked', () => { assert.equal(run('Bash', { command: 'gh issue create --title "The page shows the new number"' }).status, 2); });
test('a body without What and why is blocked', () => {
  const r = create(`${DONE}\n\n${AGENT}\n`);
  assert.equal(r.status, 2); assert.match(r.stderr, /Missing: What and why/);
});
test('What and why must be the first line; an HTML comment before it is fine', () => {
  const r = create(`Objective: x\n\n${good}`);
  assert.equal(r.status, 2); assert.match(r.stderr, /"What and why:" as the first line/);
  assert.equal(create(`<!-- marker: 1 -->\n${good}`).status, 0);
});
test('a Done when line without Proof is blocked', () => {
  const r = create(lite(doneOf('Boss sees a. Proof: x.', 'Boss sees b.')));
  assert.equal(r.status, 2); assert.match(r.stderr, /"Proof:" with its check in each line of Done when \(1 of 2 have none\)/);
});
test('a Proof with no text after it does not count', () => {
  assert.equal(create(lite(doneOf('Boss sees a. Proof:'))).status, 2);
});
test('one result passes; five pass; six are blocked', () => {
  const n = (k) => lite(doneOf(...Array.from({ length: k }, (_, i) => `Boss sees ${i}. Proof: check ${i}.`)));
  assert.equal(create(n(1)).status, 0);
  assert.equal(create(n(5)).status, 0);
  const r = create(n(6));
  assert.equal(r.status, 2); assert.match(r.stderr, /1 to 5 results \(it has 6\)/);
});
test('a Done when written as one sentence is one result', () => {
  assert.equal(create(lite('**Done when:** Boss sees the number on the page. Proof: the page read at phone width.')).status, 0);
  assert.deepEqual(results(lite('**Done when:** Boss sees a. Proof: x.')).length, 1);
});
test('a body without Owner passes: the assignee says who acts next (system#526)', () => {
  assert.equal(create(`${WHY}\n\n${DONE}\n`).status, 0);
});
test('help of gh issue create passes', () => {
  assert.equal(run('Bash', { command: 'gh issue create --help | grep -i assignee' }).status, 0);
});
test('both the plain and the bold owner line count', () => {
  assert.equal(create(lite(DONE, 'Owner: Agent: the engineer takes it and first reads the page.')).status, 0);
  assert.equal(create(`${WHY}\n\n${DONE}\n\nOwner: Agent\n`).status, 0);
});
test('MCP create without the lines is blocked, with the lite form passes', () => {
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: 'The page shows the new number', body: 'no lines' }).status, 2);
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: 'The page shows the new number', body: good }).status, 0);
});
test('a Decision title has no exemption: the lite form is needed (system#479)', () => {
  const r = run('Bash', { command: 'gh issue create --title "[WEB.1] Decision: offer a or b" --body "Recommendation: y"' });
  assert.equal(r.status, 2); assert.match(r.stderr, /Missing: What and why, Done when\./);
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: '[WEB.1] Decision: offer a or b', body: 'Recommendation: y' }).status, 2);
});

// An issue where Boss decides.
test('a Boss issue with the block, the 7-day answer and a bold owner line passes', () => {
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: '[WEB.1] Decision: offer a or b', body: BOSS }).status, 0);
  assert.equal(create(BOSS, '[CNT.1] Boss pays the new tool').status, 0);
});
test('a plain "Owner: Boss" line is a Boss issue as well', () => {
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: '[WEB.1] Decision: offer a or b', body: bossBody('Owner: Boss (money): he answers.') }).status, 0);
  const r = run('mcp__github__issue_write', { method: 'create', title: '[WEB.1] Decision: offer a or b', body: lite(DONE, 'Owner: Boss (money): he answers.') });
  assert.equal(r.status, 2); assert.match(r.stderr, /Boss decides, Options, Recommendation/);
});
test('a Boss issue without "With no answer in 7 days:" is blocked (dhr#761)', () => {
  const r = create(bossBody(BOSS_OWNER, 'Option 1, pay 20 USD a month, because it removes the manual work.'), '[CNT.1] Boss pays the new tool');
  assert.equal(r.status, 2); assert.match(r.stderr, /With no answer in 7 days/);
});
test('a Boss issue without the block is blocked and names the parts', () => {
  const r = run('mcp__github__issue_write', { method: 'create', title: '[WEB.1] Decision: offer a or b', body: lite(DONE, BOSS_OWNER) });
  assert.equal(r.status, 2); assert.match(r.stderr, /Missing: Boss decides, Options, Recommendation/);
});
test('an Agent issue needs no block and no 7-day answer', () => { assert.equal(create(good).status, 0); });
test('the assignee DigitalniHR makes it a Boss issue (system#526)', () => {
  const r = run('mcp__github__issue_write', { method: 'create', title: '[WEB.1] Decision: offer a or b', assignees: ['DigitalniHR'], body: good });
  assert.equal(r.status, 2); assert.match(r.stderr, /Boss decides/);
  const g = run('Bash', { command: `gh issue create -R a/b --title "[WEB.1] Decision: offer a or b" --assignee DigitalniHR --body "${good.replace(/"/g, '\\"')}"` });
  assert.equal(g.status, 2); assert.match(g.stderr, /Boss decides/);
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: 'The page shows the new number', assignees: ['Agent-digihr'], body: good }).status, 0);
});

// Done when at Boss level: no code, file name or output words before Proof; technical words after Proof are fine.
test('a technical Done when is blocked (Boss level), also a file name', () => {
  const r = create(lite(doneOf('PR merged and tests pass. Proof: CI.')));
  assert.equal(r.status, 2); assert.match(r.stderr, /Boss level/);
  assert.equal(create(lite(doneOf('app/x.py reads the source. Proof: run.'))).status, 2);
  assert.equal(create(lite(doneOf('The script `run` reads the source. Proof: run.'))).status, 2);
});
test('an empty Done when heading is blocked', () => {
  assert.equal(create(`${WHY}\n\n## Done when\n\nProof: run\n\n${AGENT}\n`).status, 2);
});
test('technical words after Proof are fine', () => {
  assert.equal(create(lite(doneOf('The form is on every article. Proof: pytest green, the PR merged, app/x.py reads the page.', 'The report shows the funnel. Proof: CI passes, commit read.'))).status, 0);
});
test('a time window before Proof is blocked, after Proof it is fine', () => {
  const r = create(lite(doneOf('Direct is under 40 % for two weeks. Proof: report.')));
  assert.equal(r.status, 2); assert.match(r.stderr, /time window: "for two weeks"/);
  assert.equal(create(lite(doneOf('Direct is under 40 %. Proof: the report of the next two weeks, read after the baseline.'))).status, 0);
});
test('names of system parts in Done when pass (system#138); output words stay blocked', () => {
  assert.equal(create(lite(doneOf('The script writes the eval and the routine reads it. Proof: run.', 'The hook passes it. Proof: run.'))).status, 0);
  assert.equal(create(lite(doneOf('PR merged. Proof: CI.', 'tests pass. Proof: CI.', 'commit made. Proof: log.'))).status, 2);
});

// No word cap: context may be long (Boss, 13 Nov 2026: "Zruš pravidlo na počet slov, zbytečný").
test('a long top part passes', () => {
  assert.equal(create(`**What and why:** The page shows an old number. ${Array.from({ length: 500 }, () => 'word').join(' ')}\n\n${DONE}\n\n${AGENT}\n`).status, 0);
});

test('a comment whose text names the create command passes', () => {
  assert.equal(run('Bash', { command: 'gh issue comment 5 --body "a gh issue create with PR merged was blocked"' }).status, 0);
});
test('a here-doc that names the create command passes', () => {
  assert.equal(run('Bash', { command: "cat > f.py <<'EOF'\nold = 'gh issue create'\nEOF" }).status, 0);
});
test('a create after cd && is still checked', () => {
  assert.equal(run('Bash', { command: 'cd /tmp && gh issue create --title "The page shows the new number" --body "no lines"' }).status, 2);
});
test('MCP update passes', () => { assert.equal(run('mcp__github__issue_write', { method: 'update', body: 'x' }).status, 0); });

// system#139: a body file given by a variable or ~ is read; an unreadable one does not block.
function runEnv(command, env) {
  return spawnSync('node', [hook], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: tmp }), env: { ...process.env, ...env }, encoding: 'utf8' });
}
test('body file by a known variable is checked on its real text (system#139)', () => {
  assert.equal(runEnv('gh issue create --title "The page shows the new number" --body-file "$EVF"', { EVF: path.join(tmp, 'good3.md') }).status, 0);
  assert.equal(runEnv('gh issue create --title "The page shows the new number" --body-file "$EVF"', { EVF: path.join(tmp, 'bad.md') }).status, 2);
});
test('body file with ~ is read (system#139)', () => {
  assert.equal(runEnv('gh issue create --title "The page shows the new number" --body-file ~/good3.md', { HOME: tmp }).status, 0);
});
test('an unknown variable does not block (system#139)', () => {
  assert.equal(runEnv('gh issue create --title "The page shows the new number" --body-file "$NOPE_UNSET_X"', {}).status, 0);
});
test('a flag inside another word is not read as the body flag', () => {
  assert.equal(run('Bash', { command: 'gh issue create --title "web-b shows the new number" --body-file good3.md' }).status, 0);
});

test('a dhr issue without an objective code in the title is blocked (dhr#717)', () => {
  const r = run('Bash', { command: 'gh issue create -R DigitalniHR/dhr --title "CMO state of dhr is red" --body-file good.md' });
  assert.equal(r.status, 2); assert.match(r.stderr, /objective or initiative/);
});
test('a dhr issue with [SYS.2] or [WEB-15] passes; another repository needs no code', () => {
  assert.equal(run('Bash', { command: 'gh issue create -R DigitalniHR/dhr --title "[SYS.2] The page shows the new number" --body-file good.md' }).status, 0);
  assert.equal(run('Bash', { command: 'gh issue create --repo DigitalniHR/dhr --title "[WEB-15] The page shows the new number" --body-file good.md' }).status, 0);
  assert.equal(run('Bash', { command: 'gh issue create -R DigitalniHR/system --title "The page shows the new number" --body-file good.md' }).status, 0);
});
test('the MCP create of a dhr issue without a code is blocked', () => {
  assert.equal(run('mcp__github__issue_write', { method: 'create', owner: 'DigitalniHR', repo: 'dhr', title: 'The page shows the new number', body: good }).status, 2);
});
test('a here-doc body with quoted words is read whole (owner run, 8 Nov 2026)', () => {
  const body = lite().replace('an old number', 'the API said "disabled" and "not found"');
  const cmd = `gh issue create -R a/b --title "The page shows the new number" --body "$(cat <<'EOF'\n${body}EOF\n)"`;
  assert.equal(run('Bash', { command: cmd }).status, 0);
});
test('a here-doc body with quoted words and no Done when is still blocked', () => {
  const cmd = 'gh issue create -R a/b --title "The page shows the new number" --body "$(cat <<\'EOF\'\n**What and why:** the API said "disabled".\n\n' + AGENT + '\nEOF\n)"';
  const r = run('Bash', { command: cmd }); assert.equal(r.status, 2); assert.match(r.stderr, /Done when/);
});

// Boss, 11 Nov 2026 (CLAUDE.md, Only Boss decides): a public-content approval shows the full text or one approval page.
const PC = bossBody('**Owner:** Boss (public content): he answers on this page with a thumbs-up or the number of an option.').replace(DETAILS, '');
const FULL = '\n## Full text\n\n### Item 1: homepage title\nCurrent: Personální agentura pro IT a digitál\nNew: Najdeme vám lidi do IT a digitálu do 30 dní\n';
const DEC = '[WEB.1] Decision: offer a or b';
test('a public-content Decision with only a summary and links is blocked (dhr#893)', () => {
  const r = run('mcp__github__issue_write', { method: 'create', title: DEC, body: PC + 'Summary: 5 new titles, see https://github.com/DigitalniHR/dhr/issues/931#issuecomment-6762831255' });
  assert.equal(r.status, 2); assert.match(r.stderr, /Full text/);
});
test('a public-content Decision that names its piece file passes (studio content/README.md)', () => {
  const r = run('mcp__github__issue_write', { method: 'create', title: DEC, body: PC + 'Draft: `content/dhr/web/homepage-hero/7-FINAL.md`\n' });
  assert.equal(r.status, 0);
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: DEC, body: PC + 'Draft: see the chat\n' }).status, 2);
});
test('a public-content Decision whose Full text is only links is blocked', () => {
  const r = run('mcp__github__issue_write', { method: 'create', title: DEC, body: PC + '\n## Full text\n- https://github.com/a/b/issues/1#issuecomment-2\n- [preview](https://claude.ai/code/artifact/x)\n' });
  assert.equal(r.status, 2);
});
test('a public-content Decision with the full text passes', () => {
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: DEC, body: PC + FULL }).status, 0);
});
test('a public-content Decision with an approval page passes', () => {
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: DEC, body: PC + 'Approval page: https://claude.ai/code/artifact/abc\n' }).status, 0);
});
test('an edit that sets Owner: Boss (public content) without the text is blocked', () => {
  const r = run('Bash', { command: `gh issue edit 893 -R DigitalniHR/dhr --body "${inline(PC)}Summary: new texts"` });
  assert.equal(r.status, 2); assert.match(r.stderr, /public content/);
  assert.equal(run('mcp__github__issue_write', { method: 'update', body: PC + 'Summary only' }).status, 2);
});
test('an edit with the full text, an edit without a body and another Boss class pass', () => {
  assert.equal(run('mcp__github__issue_write', { method: 'update', body: PC + FULL }).status, 0);
  assert.equal(run('Bash', { command: 'gh issue edit 893 --add-label status:review' }).status, 0);
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: DEC, body: BOSS }).status, 0);
});
test('the CAO check mode prints missing or ok', () => {
  const m = cli(['--text-missing'], PC + 'Summary only');
  assert.equal(m.status, 1); assert.equal(m.stdout.trim(), 'missing');
  assert.equal(cli(['--text-missing'], PC + FULL).stdout.trim(), 'ok');
});

// The title rule (Boss, 13 Nov 2026; standards/evals.md rule 8).
const { titleUnclear, titleText } = await import(hook);
test('a clear title passes, with and without a leading code', () => {
  assert.deepEqual(titleUnclear('[SYS.2] Engineer runs stop when the Mac sleeps'), []);
  assert.deepEqual(titleUnclear('Routines of the Claude app do not start'), []);
  assert.equal(titleText('[model-cost] [SYS.2] The balance is low'), 'The balance is low');
});
test('a noun label under 4 words is blocked (dhr#713)', () => {
  assert.match(titleUnclear('[SYS.2] Accesses agents need').join(), /at least 4 words/);
  const r = run('Bash', { command: 'gh issue create -R a/b --title "[SYS.2] Accesses agents need" --body-file good.md' });
  assert.equal(r.status, 2); assert.match(r.stderr, /Blocked: the title is one plain sentence/);
});
test('an internal marker, an internal name, a file name or a long title is blocked', () => {
  assert.match(titleUnclear('worker-audit: studio-accounting:failed_items').join(), /at least 4 words|plain words/);
  assert.match(titleUnclear('The check failed_items of accounting is red').join(), /an internal name/);
  assert.match(titleUnclear('The script run.py stops at the start').join(), /a file name/);
  assert.match(titleUnclear('The page ' + 'shows a number '.repeat(8)).join(), /at most 90 characters/);
  assert.deepEqual(titleUnclear('The backup of 8 Nov did not run at 13:00'), []);
});
test('a Boss issue names his act in the title (system#381)', () => {
  assert.match(titleUnclear('[model-cost] The OpenRouter balance lasts 13 days', true).join(), /the act of Boss/);
  assert.deepEqual(titleUnclear('[model-cost] AI credit ends in 13 days: add 100 USD', true), []);
  assert.deepEqual(titleUnclear('[SYS.2] Boss grants 10 accesses that block agent work', true), []);
  assert.deepEqual(titleUnclear('[EDU.1] Decision: offer the advanced course again or drop it', true), []);
  const bad = create(BOSS, '[model-cost] The OpenRouter balance lasts 13 days');
  assert.equal(bad.status, 2); assert.match(bad.stderr, /the act of Boss/);
  assert.equal(create(BOSS, '[model-cost] AI credit ends in 13 days: add 100 USD').status, 0);
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: 'The credit of the tool is low', assignees: ['DigitalniHR'], body: BOSS }).status, 2);
});
test('a new title in an edit is checked; an edit without a title passes', () => {
  assert.equal(run('Bash', { command: 'gh issue edit 5 -R a/b --title "Accesses agents need"' }).status, 2);
  assert.equal(run('Bash', { command: 'gh issue edit 5 -R a/b --title "Boss grants 10 accesses that block agent work"' }).status, 0);
  assert.equal(run('Bash', { command: 'gh issue edit 5 -R a/b --add-label repeat' }).status, 0);
  assert.equal(run('Bash', { command: 'gh issue edit 5 -R a/b --title "$title"' }).status, 0);
  assert.equal(run('mcp__github__issue_write', { method: 'update', issue_number: 5, title: 'Short label' }).status, 2);
});

// The part for Boss (Boss, 13 Nov 2026, on dhr#34: "I do not understand it at all"; standards/evals.md; system#463).
const OLD34 = 'Owner: Boss (money, direction)\nRecommendation: set the threshold of the demand test (seats or CZK) and the price, or move EDU-16 to Later (Decision #14 closed by its Default).\nDefault: no presale or waiting-list page; no course production starts.\n\n## Problem\nEarlier online courses did not sell.\n';
test('a Boss issue in the old form is blocked (dhr#34)', () => {
  const r = run('mcp__github__issue_write', { method: 'create', title: '[EDU-16] Boss sets the threshold and price of the demand test', body: OLD34 });
  assert.equal(r.status, 2); assert.match(r.stderr, /Missing: What and why, Done when\./);
  assert.match(bossMissing(OLD34).join(), /it names no value|it offers a choice/);
  const c = run('Bash', { command: `gh issue create -R a/b --title "Boss sets the price of the new course" --body "${inline(OLD34)}"` });
  assert.equal(c.status, 2); assert.match(c.stderr, /What and why/);
});
test('bossMissing: the block with the 7-day answer passes, in bold or plain', () => {
  assert.deepEqual(bossMissing(BOSS), []);
  assert.deepEqual(bossMissing(BOSS.replace(/\*\*/g, '')), []);
  assert.deepEqual(bossMissing(lite()), []);   // an agent issue: no block needed
  assert.match(bossMissing('no owner line, the label names Boss', true).join(), /Boss decides/);
  assert.match(bossMissing(bossBody(BOSS_OWNER, 'Option 1, pay 20 USD a month.')).join(), /With no answer in 7 days/);
});
test('a recommendation that only repeats the choice is blocked', () => {
  for (const bad of ['set the threshold of the demand test and the price, or move it to Later', 'Decide between the waiting list and the presale', 'Boss chooses A or B', 'offer the course again or drop its link', 'Set the price', 'Either option works'])
    assert.notEqual(recommendationVague(bad), '', bad);
  for (const ok of ['Option 3, not now. The live course sells 5 seats in 30 days.', 'Yes: add 100 USD, or the agents stop in 13 days.', 'Set the limit to 50 USD a week, the same as the other keys.', 'No, keep the free plan (the paid one adds nothing we use or need).', '**Option 1**, pay 20 USD a month.'])
    assert.equal(recommendationVague(ok), '', ok);
  const r = run('mcp__github__issue_write', { method: 'create', title: '[CNT.1] Boss pays the new picture tool', body: bossBody(BOSS_OWNER, 'pay the tool or keep the manual work. With no answer in 7 days: nothing is paid.') });
  assert.equal(r.status, 2); assert.match(r.stderr, /one concrete answer \(it offers a choice/);
});
test('the block has 2 or 3 options and plain words', () => {
  assert.match(bossMissing(BOSS.replace(/2\. Do not pay.*\n/, '')).join(), /list of 2 or 3 \(it has 1\)/);
  assert.match(bossMissing(BOSS.replace('The tool that', 'The script `run.py` that')).join(), /plain words in "What and why:"/);
});

// The check modes for a script that opens issues and for an open issue.
test('--missing prints ok or the reasons; --boss and --boss-missing use the label rule', () => {
  const ok = cli(['--missing'], good);
  assert.equal(ok.status, 0); assert.equal(ok.stdout.trim(), 'ok');
  const bad = cli(['--missing'], OLD34);
  assert.equal(bad.status, 1); assert.match(bad.stdout, /What and why, Done when, Boss decides, Options/);
  assert.equal(cli(['--missing'], BOSS).stdout.trim(), 'ok');
  const noBlock = cli(['--missing', '--boss'], good);   // the label names Boss, the body has no block
  assert.equal(noBlock.status, 1); assert.match(noBlock.stdout, /Boss decides/);
  assert.equal(cli(['--missing', '--boss'], BOSS).stdout.trim(), 'ok');
});
test('--boss-missing is the same as --missing --boss', () => {
  const bad = cli(['--boss-missing'], OLD34);
  assert.equal(bad.status, 1); assert.match(bad.stdout, /Boss decides/);
  assert.equal(cli(['--boss-missing'], BOSS).stdout.trim(), 'ok');
  assert.equal(cli(['--boss-missing'], good).status, 1);
});
test('--title-unclear prints ok or the reasons', () => {
  assert.equal(cli(['--title-unclear', 'The page shows the new number']).stdout.trim(), 'ok');
  assert.equal(cli(['--title-unclear', 'Accesses agents need']).status, 1);
  assert.equal(cli(['--title-unclear', '--boss', 'AI credit ends in 13 days: add 100 USD']).stdout.trim(), 'ok');
});
test('doneWhen reads the bold heading', () => { assert.match(doneWhen(good), /^1\. Boss opens the page/); });

// The body file is written by the same command: the guard reads the here-doc, not the disk (system#469).
test('a complete body written by a here-doc in the same command passes', () => {
  assert.equal(run('Bash', { command: `cat > /tmp/if-none/new.md <<'EOF'\n${good}EOF\ngh issue create -R a/b ${T} --body-file /tmp/if-none/new.md` }).status, 0);
});
test('a here-doc with a quoted path and a cd before the call passes', () => {
  assert.equal(run('Bash', { command: `cd /tmp/if-none && cat > "/tmp/if-none/i 1.md" <<EOF\n${good}EOF\ngh issue create -R a/b ${T} --body-file "i 1.md" | tail -1` }).status, 0);
});
test('cat <<EOF > path and --body "$(cat path)" pass', () => {
  assert.equal(run('Bash', { command: `cat <<'E' > /tmp/if-none/b.md\n${good}E\ngh issue create -R a/b ${T} --body "$(cat /tmp/if-none/b.md)"` }).status, 0);
});
test('an incomplete body written in the same command is blocked', () => {
  const r = run('Bash', { command: `cat > /tmp/if-none/new.md <<'EOF'\nObjective: x\nEOF\ngh issue create -R a/b ${T} --body-file /tmp/if-none/new.md` });
  assert.equal(r.status, 2); assert.match(r.stderr, /Missing: What and why, Done when\./);
});
test('the here-doc wins over an older file on the disk', () => {
  const r = run('Bash', { command: `cat > good.md <<'EOF'\nObjective: x\nEOF\ngh issue create -R a/b ${T} --body-file good.md` });
  assert.equal(r.status, 2);
});
test('a body file that does not exist and is not written is blocked', () => {
  assert.equal(run('Bash', { command: `cat > /tmp/if-none/other.md <<'EOF'\n${good}EOF\ngh issue create -R a/b ${T} --body-file /tmp/if-none/absent.md` }).status, 2);
});
test('a body file path followed by ; is read without the ;', () => {
  assert.equal(run('Bash', { command: `gh issue create -R a/b ${T} --body-file good.md; echo done` }).status, 0);
});
