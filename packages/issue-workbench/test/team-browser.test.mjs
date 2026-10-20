import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { setup } from './helpers/team-fixture.ts';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
test('packed workbench: owner click, cat result, feedback, stale source and denied access', { timeout: 90000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'issue-team-browser-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const [pack] = JSON.parse(execFileSync(process.execPath, ['scripts/pack-publish-artifact.mjs', 'packages/issue-workbench', directory], { cwd: repo, encoding: 'utf8' }));
  execFileSync('tar', ['-xzf', join(directory, pack.filename), '-C', directory]);
  const { createIssueTeamModule } = await import(pathToFileURL(join(directory, 'package/dist/team-plugin.js')).href);
  const { coordinationPreview, fixtureBindings } = await import(pathToFileURL(join(directory, 'package/dist/coordination-host.mjs')).href);
  const s = setup();
  s.config.analysisThreadId = 'analysis'; s.config.automaticAssignment = false;
  const active = await createIssueTeamModule(s.provider).create({ pluginId: 'dev.clowder.issue-workbench', runtime: { entrypoint: 'dist/team-plugin.js' } }).start({
    ...s.context, dataPath: directory,
    messaging: { ...s.context.messaging, send: ({ threadId, ...draft }) => s.context.messaging.send(threadId, draft) },
  });
  t.after(() => active.stop());
  const binding = fixtureBindings()[0];
  binding.profile = { ...binding.profile, provider: 'github', repository: 'fixture/repo', synthetic: false };
  const originalCatalog = await binding.catalog();
  const fact = () => ({ ...originalCatalog.issues[0], id: 'issue-1', number: 1,
    title: s.issues[0].title, body: s.issues[0].body, state: s.issues[0].state.toUpperCase() });
  binding.catalog = async () => ({ ...originalCatalog, issues: [fact()] });
  binding.detail = async () => ({ fact: { ...fact(), comments: [] } });
  let granted = true, operations = 0;
  const server = coordinationPreview({ dataRoot: join(directory, 'data'), dist: join(directory, 'package/dist'), bindings: [binding],
    teamAction: async (method, payload, confirmed) => {
      if (!granted) throw Object.assign(new Error('来源未授权'), { status: 403 });
      if (method === 'republish' && !confirmed) throw Object.assign(new Error('Confirm first'), { status: 400 });
      return active.actions['issue.workbench.' + method]({ input: { payload: JSON.stringify(payload) } }, undefined, {
        kind: 'owner-operation', pluginInstanceId: 'isolated-test', userId: 'owner', operationKey: 'teamWorkbench',
        actionId: method, requestId: 'browser-' + ++operations, signal: new AbortController().signal,
        assertCurrent: async () => { if (!granted) throw new Error('revoked'); },
      });
    } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(6000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.getByRole('button', { name: '请猫分析', exact: true }).click();
  await page.getByText('已发送，等待研判', { exact: true }).waitFor();
  const [job] = Object.values(await s.context.storage.list()).map(entry => entry.value);
  assert.equal(job.requesterKind, 'owner');
  assert.equal(s.sends.size, 1);
  await active.actions['issue.team.submit']({ id: job.id, analysis: s.analysis }, s.caller());
  await page.getByRole('button', { name: '刷新团队结果', exact: true }).click();
  await page.getByText('9 / 10', { exact: true }).waitFor();
  await page.getByLabel('反馈理由', { exact: true }).fill('已人工复现，启动受阻');
  await page.getByRole('button', { name: '采纳研判', exact: true }).click();
  await page.getByText('反馈已保存', { exact: true }).waitFor();
  await page.getByRole('button', { name: '团队记录', exact: true }).click();
  await page.getByRole('button', { name: '反馈统计', exact: true }).click();
  await page.getByText('已反馈 1', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  s.login('alice'); s.issues[0].assignees = ['alice']; s.config.shareProgress = true;
  const received = (await active.actions['issue.team.receive']({}, s.caller('receiver', 'inbox'))).data;
  const inbox = received.find(row => row.kind === 'inbox');
  const publications = [];
  s.provider.publishReceipt = async (_issue, _receipt, _signal, create) => {
    publications.push(create);
    if (publications.length < 3 || !create) throw new Error('Previous comment outcome unknown');
    return 'recovered-receipt';
  };
  await assert.rejects(active.actions['issue.team.report']({ id: inbox.id, status: 'accepted', summary: 'Taking this issue', evidenceUrls: [] }, s.caller('receiver', 'inbox')), /unknown/);
  await page.getByRole('button', { name: '团队记录', exact: true }).click();
  await page.getByRole('dialog', { name: '团队记录', exact: true }).getByRole('button', { name: /fixture\/repo#1/ }).click();
  await page.getByRole('button', { name: '重试此记录', exact: true }).click();
  await page.getByRole('alert').getByText('Previous comment outcome unknown', { exact: true }).waitFor();
  // Reopen to fetch the new revision consumed by the failed marker-only retry.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '团队记录', exact: true }).click();
  await page.getByRole('dialog', { name: '团队记录', exact: true }).getByRole('button', { name: /fixture\/repo#1/ }).click();
  await page.getByRole('button', { name: '核对并重新发布', exact: true }).click();
  assert.deepEqual(publications, [true, false], 'opening confirmation cannot publish');
  await page.getByRole('button', { name: '确认重新发布', exact: true }).click();
  await page.getByText('回执已发布', { exact: true }).waitFor();
  assert.deepEqual(publications, [true, false, true]);
  await page.keyboard.press('Escape');
  s.issues[0].body += ' New information.';
  await page.getByRole('button', { name: '刷新团队结果', exact: true }).click();
  await page.getByText('原文已更新，请重新研判', { exact: true }).waitFor();
  await mkdir('artifacts/team-ui-2026-10-20', { recursive: true });
  await page.screenshot({ path: 'artifacts/team-ui-2026-10-20/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^研判/ }).click();
  await page.screenshot({ path: 'artifacts/team-ui-2026-10-20/mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'artifacts/team-ui-2026-10-20/dark.png', fullPage: true });
  granted = false;
  await page.getByRole('button', { name: '刷新团队结果', exact: true }).click();
  await page.getByText('团队操作未获授权，请在插件设置中检查授权', { exact: true }).waitFor();
  assert.equal(await page.getByText('9 / 10', { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  assert.equal(s.writes.length, 0, 'no real or fixture GitHub assignment enabled by opening the workbench');
});
