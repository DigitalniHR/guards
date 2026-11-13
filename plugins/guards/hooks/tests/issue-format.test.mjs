// node --test hooks/tests/issue-format.test.mjs  (system#122)
import test from 'node:test'; import assert from 'node:assert'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { bossMissing, recommendationVague } from '../issue-format.mjs';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';

const hook = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'issue-format.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'if-'));
const run = (tool_name, tool_input) => spawnSync('node', [hook], { input: JSON.stringify({ tool_name, tool_input, cwd: tmp }), encoding: 'utf8' });
// The block that opens an issue where Boss decides (standards/evals.md rule 9, system#463).
const BLOCK = 'What happens: The tool that makes the pictures costs 20 USD a month.\nBoss decides: Do we pay for the tool?\nOptions:\n1. Pay: 20 USD a month, pictures in minutes.\n2. Do not pay: the pictures stay manual work.\nRecommendation: Option 1, pay 20 USD a month, because it removes the manual work.\n';
const good = 'Objective: x\n\n## Done when (all true)\n\n1. Boss opens the page and sees y.\n2. The page shows z.\n3. A reader can sign up.\n\nProof: the page read at phone width.\n';
fs.writeFileSync(path.join(tmp, 'good.md'), good);
fs.writeFileSync(path.join(tmp, 'good3.md'), 'Done when (all true):\n1. Boss sees a.\n2. Boss sees b.\n3. Boss sees c.\nProof:\n1. x\n2. y\n3. z\n');
fs.writeFileSync(path.join(tmp, 'bad.md'), 'Objective: x\n\n## Steps\n- [ ] do it\n');

test('other commands pass', () => { assert.equal(run('Bash', { command: 'git status' }).status, 0); });
test('a comment passes', () => { assert.equal(run('Bash', { command: 'gh issue comment 5 --body "no lines"' }).status, 0); });
test('body file with both lines passes', () => { assert.equal(run('Bash', { command: 'gh issue create -R a/b --title "The page shows the new number" --body-file good.md' }).status, 0); });
test('body file without the lines is blocked and names both', () => {
  const r = run('Bash', { command: `gh issue create -R a/b --title "The page shows the new number" --body-file "${path.join(tmp, 'bad.md')}"` });
  assert.equal(r.status, 2); assert.match(r.stderr, /Missing: Done when, Proof/);
});
test('inline body without Proof is blocked', () => {
  const r = run('Bash', { command: 'gh issue create --title "The page shows the new number" --body "Done when:\n1. Boss sees a\n2. Boss sees b\n3. Boss sees c"' });
  assert.equal(r.status, 2); assert.match(r.stderr, /Missing: Proof/);
});
test('inline body with both lines passes', () => {
  assert.equal(run('Bash', { command: 'gh issue create --title "The page shows the new number" --body "Done when:\n1. Boss sees a\n2. Boss sees b\n3. Boss sees c\nProof: test green"' }).status, 0);
});
test('no body at all is blocked', () => { assert.equal(run('Bash', { command: 'gh issue create --title "The page shows the new number"' }).status, 2); });
test('a decision issue passes', () => { assert.equal(run('Bash', { command: 'gh issue create --title "[WEB.1] Decision: offer a or b" --body "Recommendation: y"' }).status, 0); });
test('a Boss issue without Default is blocked (dhr#761)', () => {
  const r = run('Bash', { command: `gh issue create --title "[CNT.1] Boss pays the new tool" --body "${BLOCK.replace(/\n/g, '\\n')}Owner: Boss (money)\\nDone when:\\n1. Boss sees a\\n2. Boss sees b\\n3. Boss sees c\\nProof: run"` });
  assert.equal(r.status, 2); assert.match(r.stderr, /Missing: Default/);
});
test('a Boss decision without Recommendation and Default is blocked', () => {
  const r = run('mcp__github__issue_write', { method: 'create', title: '[WEB.1] Decision: offer a or b', body: 'Owner: Boss (direction)\nQuestion: a or b' });
  assert.equal(r.status, 2); assert.match(r.stderr, /Missing: What happens, Boss decides, Options, Recommendation, Default/);
});
test('a Boss decision with the block and Default passes', () => {
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: '[WEB.1] Decision: offer a or b', body: BLOCK + 'Owner: Boss (direction)\nDefault: a after 7 days' }).status, 0);
});
test('an Agent issue needs no Default', () => {
  assert.equal(run('Bash', { command: 'gh issue create --title "The page shows the new number" --body "Owner: Agent\\nDone when:\\n1. Boss sees a\\n2. Boss sees b\\n3. Boss sees c\\nProof: run"' }).status, 0);
});
test('MCP create without the lines is blocked', () => {
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: 'The page shows the new number', body: 'no lines' }).status, 2);
});
test('MCP create of a decision passes', () => {
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: '[WEB.1] Decision: offer a or b', body: 'Recommendation: y' }).status, 0);
});
test('a technical Done when is blocked (Boss level)', () => {
  const r = run('Bash', { command: 'gh issue create --title "The page shows the new number" --body "Done when: PR merged and tests pass\nProof: CI"' });
  assert.equal(r.status, 2); assert.match(r.stderr, /Boss level/);
});
test('a file name in Done when is blocked', () => {
  assert.equal(run('Bash', { command: 'gh issue create --title "The page shows the new number" --body "Done when: app/x.py reads the source\nProof: run"' }).status, 2);
});
test('an empty Done when heading is blocked', () => {
  assert.equal(run('Bash', { command: 'gh issue create --title "The page shows the new number" --body "## Done when\n\nProof: run"' }).status, 2);
});
test('technical words in Proof are fine', () => {
  assert.equal(run('Bash', { command: 'gh issue create --title "The page shows the new number" --body "Done when:\n1. The form is on every article\n2. A test sign-up gets the e-mail\n3. The report shows the funnel\nProof: pytest green, report read"' }).status, 0);
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
test('one criterion is blocked (3 to 8)', () => {
  const r = run('Bash', { command: 'gh issue create --title "The page shows the new number" --body "Done when: Boss sees it\nProof: run"' });
  assert.equal(r.status, 2); assert.match(r.stderr, /3 to 8 criteria \(it has 1\)/);
});
test('nine criteria are blocked', () => {
  const list = Array.from({ length: 9 }, (_, i) => `${i + 1}. Boss sees ${i}`).join('\n');
  assert.equal(run('Bash', { command: `gh issue create --title "The page shows the new number" --body "Done when:\n${list}\nProof: run"` }).status, 2);
});
test('a time window is blocked', () => {
  const r = run('Bash', { command: 'gh issue create --title "The page shows the new number" --body "Done when:\n1. Direct is under 40 % for two weeks\n2. a\n3. b\nProof: report"' });
  assert.equal(r.status, 2); assert.match(r.stderr, /time window: "for two weeks"/);
});
test('the standard example passes', () => {
  const body = 'Done when (all true):\n1. The content wiki follows three X accounts.\n2. The wiki shows at least 10 posts of each.\n3. Each post has a summary.\nNot done when: the wiki has no posts.\nProof:\n1. sources list\n2. count\n3. query';
  assert.equal(run('Bash', { command: `gh issue create --title "The page shows the new number" --body "${body}"` }).status, 0);
});
test('MCP update passes', () => { assert.equal(run('mcp__github__issue_write', { method: 'update', body: 'x' }).status, 0); });

// system#138: names of system parts are fine in a Done when; output words stay blocked.
const L3 = '1. The script writes the eval.\n2. The routine reads it.\n3. The hook passes it.';
test('names of system parts in Done when pass (system#138)', () => {
  assert.equal(run('Bash', { command: `gh issue create --title "The page shows the new number" --body "Done when:\n${L3}\nProof: run"` }).status, 0);
});
test('output words in Done when stay blocked (system#138)', () => {
  assert.equal(run('Bash', { command: 'gh issue create --title "The page shows the new number" --body "Done when:\n1. PR merged\n2. tests pass\n3. commit made\nProof: CI"' }).status, 2);
});

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
  const cmd = 'gh issue create -R a/b --title "The page shows the new number" --body "$(cat <<\'EOF\'\nOwner: Agent\nObjective: the API said "disabled" and "not found".\n\nDone when:\n- Boss sees a.\n- Boss sees b.\n- Boss sees c.\n\nProof:\n- x\n- y\n- z\nEOF\n)"';
  assert.equal(run('Bash', { command: cmd }).status, 0);
});
test('a here-doc body with quoted words and no Done when is still blocked', () => {
  const cmd = 'gh issue create -R a/b --title "The page shows the new number" --body "$(cat <<\'EOF\'\nObjective: the API said "disabled".\nSteps: none\nEOF\n)"';
  const r = run('Bash', { command: cmd }); assert.equal(r.status, 2); assert.match(r.stderr, /Done when/);
});

// Boss, 11 Nov 2026 (CLAUDE.md, Only Boss decides): a public-content approval shows the full text or one approval page.
const PC = BLOCK + 'Owner: Boss (public content)\nDefault: none, public text waits for Boss\n';
const FULL = '\n## Full text\n\n### Item 1: homepage title\nCurrent: Personální agentura pro IT a digitál\nNew: Najdeme vám lidi do IT a digitálu do 30 dní\n';
test('a public-content Decision with only a summary and links is blocked (dhr#893)', () => {
  const r = run('mcp__github__issue_write', { method: 'create', title: '[WEB.1] Decision: new texts of the home page', body: PC + 'Summary: 5 new titles, see https://github.com/DigitalniHR/dhr/issues/931#issuecomment-6762831255' });
  assert.equal(r.status, 2); assert.match(r.stderr, /Full text/);
});
test('a public-content Decision that names its piece file passes (studio content/README.md)', () => {
  const r = run('mcp__github__issue_write', { method: 'create', title: '[WEB.1] Decision: offer a or b', body: PC + 'Draft: `content/dhr/web/homepage-hero/7-FINAL.md`\n' });
  assert.equal(r.status, 0);
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: '[WEB.1] Decision: offer a or b', body: PC + 'Draft: see the chat\n' }).status, 2);
});
test('a public-content Decision whose Full text is only links is blocked', () => {
  const r = run('mcp__github__issue_write', { method: 'create', title: '[WEB.1] Decision: offer a or b', body: PC + '\n## Full text\n- https://github.com/a/b/issues/1#issuecomment-2\n- [preview](https://claude.ai/code/artifact/x)\n' });
  assert.equal(r.status, 2);
});
test('a public-content Decision with the full text passes', () => {
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: '[WEB.1] Decision: offer a or b', body: PC + FULL }).status, 0);
});
test('a public-content Decision with an approval page passes', () => {
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: '[WEB.1] Decision: offer a or b', body: PC + 'Approval page: https://claude.ai/code/artifact/abc\n' }).status, 0);
});
test('an edit that sets Owner: Boss (public content) without the text is blocked', () => {
  const r = run('Bash', { command: `gh issue edit 893 -R DigitalniHR/dhr --body "${PC.replace(/\n/g, '\\n')}Summary: new texts"` });
  assert.equal(r.status, 2); assert.match(r.stderr, /public content/);
  assert.equal(run('mcp__github__issue_write', { method: 'update', body: PC + 'Summary only' }).status, 2);
});
test('an edit with the full text, an edit without a body and another Boss class pass', () => {
  assert.equal(run('mcp__github__issue_write', { method: 'update', body: PC + FULL }).status, 0);
  assert.equal(run('Bash', { command: 'gh issue edit 893 --add-label status:review' }).status, 0);
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: '[WEB.1] Decision: offer a or b', body: BLOCK + 'Owner: Boss (money)\nDefault: a after 7 days' }).status, 0);
});
test('the CAO check mode prints missing or ok', () => {
  const m = spawnSync('node', [hook, '--text-missing'], { input: PC + 'Summary only', encoding: 'utf8' });
  assert.equal(m.status, 1); assert.equal(m.stdout.trim(), 'missing');
  assert.equal(spawnSync('node', [hook, '--text-missing'], { input: PC + FULL, encoding: 'utf8' }).stdout.trim(), 'ok');
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
  const body = BLOCK.replace(/\n/g, '\\n') + 'Owner: Boss (money)\\nDefault: z\\nDone when:\\n1. Boss sees a\\n2. Boss sees b\\n3. Boss sees c\\nProof: run';
  const bad = run('Bash', { command: `gh issue create --title "[model-cost] The OpenRouter balance lasts 13 days" --body "${body}"` });
  assert.equal(bad.status, 2); assert.match(bad.stderr, /the act of Boss/);
  assert.equal(run('Bash', { command: `gh issue create --title "[model-cost] AI credit ends in 13 days: add 100 USD" --body "${body}"` }).status, 0);
  assert.equal(run('mcp__github__issue_write', { method: 'create', title: 'The credit of the tool is low', labels: ['owner:boss'], body: body.replace(/\\n/g, '\n') }).status, 2);
});
test('a new title in an edit is checked; an edit without a title passes', () => {
  assert.equal(run('Bash', { command: 'gh issue edit 5 -R a/b --title "Accesses agents need"' }).status, 2);
  assert.equal(run('Bash', { command: 'gh issue edit 5 -R a/b --title "Boss grants 10 accesses that block agent work"' }).status, 0);
  assert.equal(run('Bash', { command: 'gh issue edit 5 -R a/b --add-label repeat' }).status, 0);
  assert.equal(run('Bash', { command: 'gh issue edit 5 -R a/b --title "$title"' }).status, 0);
  assert.equal(run('mcp__github__issue_write', { method: 'update', issue_number: 5, title: 'Short label' }).status, 2);
});

// The block for Boss (Boss, 13 Nov 2026, on dhr#34: "I do not understand it at all"; standards/evals.md rule 9; system#463).
const OLD34 = 'Owner: Boss (money, direction)\nRecommendation: set the threshold of the demand test (seats or CZK) and the price, or move EDU-16 to Later (Decision #14 closed by its Default).\nDefault: no presale or waiting-list page; no course production starts.\n\n## Problem\nEarlier online courses did not sell.\n';
test('a Boss issue without the block is blocked (dhr#34)', () => {
  const r = run('mcp__github__issue_write', { method: 'create', title: '[EDU-16] Boss sets the threshold and price of the demand test', body: OLD34 });
  assert.equal(r.status, 2); assert.match(r.stderr, /Missing: What happens, Boss decides, Options/); assert.match(r.stderr, /it names no value|it offers a choice/);
  const cli = run('Bash', { command: `gh issue create -R a/b --title "Boss sets the price of the new course" --body "${OLD34.replace(/\n/g, '\\n')}"` });
  assert.equal(cli.status, 2); assert.match(cli.stderr, /What happens/);
});
test('a Boss issue with the block passes, and the block must open the issue', () => {
  const tail = 'Owner: Boss (money)\nDefault: nothing is paid.\n';
  assert.deepEqual(bossMissing(BLOCK + tail), []);
  assert.deepEqual(bossMissing('**What happens:** The tool costs 20 USD a month.\n\n**Boss decides:** Do we pay?\n\n**Options:**\n1. Pay 20 USD a month.\n2. Do not pay.\n\n**Recommendation:** Yes, pay 20 USD a month: it removes the manual work.\n\n' + tail), []);
  assert.match(bossMissing(tail + BLOCK).join(), /first lines/);
  assert.deepEqual(bossMissing('Owner: Agent\nno block'), []);
  assert.match(bossMissing('no owner line, the label names Boss', true).join(), /What happens/);
});
test('a recommendation that only repeats the choice is blocked', () => {
  for (const bad of ['set the threshold of the demand test and the price, or move it to Later', 'Decide between the waiting list and the presale', 'Boss chooses A or B', 'offer the course again or drop its link', 'Set the price', 'Either option works'])
    assert.notEqual(recommendationVague(bad), '', bad);
  for (const ok of ['Option 3, not now. The live course sells 5 seats in 30 days.', 'Yes: add 100 USD, or the agents stop in 13 days.', 'Set the limit to 50 USD a week, the same as the other keys.', 'No, keep the free plan (the paid one adds nothing we use or need).', '**Option 1**, pay 20 USD a month.'])
    assert.equal(recommendationVague(ok), '', ok);
  const body = BLOCK.replace(/Recommendation: .*/, 'Recommendation: pay the tool or keep the manual work') + 'Owner: Boss (money)\nDefault: nothing is paid.\n';
  const r = run('mcp__github__issue_write', { method: 'create', title: '[CNT.1] Boss pays the new picture tool', body });
  assert.equal(r.status, 2); assert.match(r.stderr, /one concrete answer \(it offers a choice/);
});
test('the block has 2 or 3 options and plain words', () => {
  const tail = 'Owner: Boss (money)\nDefault: nothing is paid.\n';
  assert.match(bossMissing(BLOCK.replace(/2\. Do not pay.*\n/, '') + tail).join(), /list of 2 or 3 \(it has 1\)/);
  assert.match(bossMissing(BLOCK.replace('The tool that', 'The script `run.py` that') + tail).join(), /plain words in "What happens:"/);
});
test('the check mode for an open Boss issue prints the reasons or ok', () => {
  const bad = spawnSync('node', [hook, '--boss-missing'], { input: OLD34, encoding: 'utf8' });
  assert.equal(bad.status, 1); assert.match(bad.stdout, /What happens/);
  assert.equal(spawnSync('node', [hook, '--boss-missing'], { input: BLOCK + 'Owner: Boss (money)\nDefault: x\n', encoding: 'utf8' }).stdout.trim(), 'ok');
});
