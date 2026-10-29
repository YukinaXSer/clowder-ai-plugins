import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { setup } from './helpers/team-fixture.ts';
import { issueVersion } from '../src/team/schema.ts';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
for (const uncertain of [false, true]) test(`packed owner journey replaces original invitation and preserves history${uncertain ? ' after lost response and immediate claim' : ''}`, { timeout: 90000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'issue-replacement-browser-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const [pack] = JSON.parse(execFileSync(process.execPath, ['scripts/pack-publish-artifact.mjs', 'packages/issue-workbench', directory], { cwd: repo, encoding: 'utf8' }));
  execFileSync('tar', ['-xzf', join(directory, pack.filename), '-C', directory]);
  const { createIssueTeamModule } = await import(pathToFileURL(join(directory, 'package/dist/team-plugin.js')).href);
  const { coordinationPreview, fixtureBindings } = await import(pathToFileURL(join(directory, 'package/dist/coordination-host.mjs')).href);
  const s = setup(); s.login('bob'); s.config.automaticAssignment = false; s.config.analysisThreadId = 'analysis';
  let replacements = 0, operations = 0;
  s.provider.replaceInvitation = async (_issue, commentId, previous, next, _signal, authorized) => {
    assert.equal(commentId, 'comment-1'); assert.equal(previous.assignee, 'alice');
    if (s.dispatches[0].invitationRevision?.number === next.invitationRevision.number) return commentId;
    await authorized(); replacements++; s.dispatches[0] = next;
    if (uncertain) { s.issues[0].assignees = ['bob']; throw new Error('PATCH response lost; Bob claimed the issue'); }
    return commentId;
  };
  const start = () => createIssueTeamModule(s.provider).create({ pluginId: 'dev.clowder.issue-workbench', runtime: { entrypoint: 'dist/team-plugin.js' } }).start({
    ...s.context, dataPath: directory,
    messaging: { ...s.context.messaging, send: ({ threadId, ...draft }) => s.context.messaging.send(threadId, draft) },
  });
  let active = await start(); t.after(() => active.stop());
  const authority = method => ({ kind: 'owner-operation', pluginInstanceId: 'isolated-test', userId: 'owner', operationKey: 'teamWorkbench',
    actionId: method, requestId: 'browser-' + ++operations, signal: new AbortController().signal, assertCurrent: async () => {} });
  const original = (await active.actions['issue.workbench.assignIssue']({ input: { payload: JSON.stringify({
    repo: 'fixture/repo', number: 1, sourceVersion: issueVersion(s.issues[0]), requestId: 'original', login: 'alice', delivery: 'invitation',
  }) } }, undefined, authority('assignIssue'))).data;
  const binding = fixtureBindings()[0];
  binding.profile = { ...binding.profile, provider: 'github', instance: 'https://github.com', repository: 'fixture/repo', synthetic: false };
  const catalog = await binding.catalog();
  const fact = () => ({ ...catalog.issues[0], id: 'issue-1', number: 1, title: s.issues[0].title,
    body: s.issues[0].body, updatedAt: s.issues[0].updatedAt, state: 'OPEN', assignees: [...s.issues[0].assignees] });
  binding.catalog = async () => ({ ...catalog, issues: [fact()] }); binding.detail = async () => ({ fact: { ...fact(), comments: [] } });
  const server = coordinationPreview({ dataRoot: join(directory, 'data'), dist: join(directory, 'package/dist'), bindings: [binding],
    teamAction: async (method, payload, confirmed) => {
      if (method === 'replaceInvitation') assert.equal(confirmed, true);
      return active.actions['issue.workbench.' + method]({ input: { payload: JSON.stringify(payload) } }, undefined, authority(method));
    } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } }); page.setDefaultTimeout(8000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.getByLabel('派工方式', { exact: true }).selectOption('invitation');
  await page.getByLabel('指派给组员', { exact: true }).selectOption('bob');
  await page.getByRole('button', { name: '覆盖原邀请', exact: true }).click();
  await page.getByText('覆盖原评论：@alice → @bob。旧邀请失效；保留原链接与历史，不新增第二条邀请。', { exact: true }).waitFor();
  assert.equal(replacements, 0);
  await mkdir('artifacts/invitation-replacement-2026-10-29', { recursive: true });
  await page.screenshot({ path: `artifacts/invitation-replacement-2026-10-29/confirmation${uncertain ? '-uncertain' : ''}.png`, fullPage: true });
  await page.getByRole('button', { name: '确认覆盖邀请', exact: true }).click();
  if (uncertain) {
    await page.getByRole('button', { name: '核对覆盖结果', exact: true }).click();
    await page.getByText('GitHub 当前负责人：@bob。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '确认核对覆盖结果', exact: true }).click();
  }
  await page.getByText('当前邀请：@bob', { exact: false }).waitFor();
  await page.getByText('邀请变更历史', { exact: true }).click();
  await page.getByText('第 1 次调整：@alice → @bob', { exact: false }).waitFor();
  const row = Object.values(await s.context.storage.list()).map(v => v.value).find(v => v.id === original.id);
  assert.equal(row.assignment.commentId, original.assignment.commentId); assert.equal(s.dispatches.length, 1);
  assert.equal(replacements, 1); assert.deepEqual(s.writes, []);
  await page.screenshot({ path: `artifacts/invitation-replacement-2026-10-29/replaced${uncertain ? '-uncertain' : ''}.png`, fullPage: true });
  await active.stop(); active = await start(); await page.reload();
  await page.getByText('当前邀请：@bob', { exact: false }).waitFor(); assert.equal(replacements, 1);
  s.issues[0].assignees = ['alice'];
  await page.getByRole('button', { name: '刷新团队结果', exact: true }).click();
  await page.getByRole('link', { name: '在 GitHub 退回或改派', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '覆盖原邀请', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
});
