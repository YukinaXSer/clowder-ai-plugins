import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

/** Plugin-owned HTTP test bridge. Every team action crosses the real Host route.
 * This is a browser integration fixture, not an installed Host page contribution.
 */
export async function verifyInstalledHostBrowser({ root, unpacked, sender, githubState, analysis }) {
  const { coordinationPreview, fixtureBindings } = await import(pathToFileURL(join(unpacked, 'dist/coordination-host.mjs')).href);
  const binding = fixtureBindings()[0];
  binding.profile = { ...binding.profile, provider: 'github', instance: 'https://github.com', repository: 'fixture/repo', synthetic: false };
  const original = await binding.catalog();
  const fact = async () => {
    const issue = (await githubState()).issues[0];
    return { ...original.issues[0], id: issue.node_id, number: issue.number,
      title: issue.title, body: issue.body, updatedAt: issue.updated_at, state: issue.state.toUpperCase() };
  };
  binding.catalog = async () => ({ ...original, issues: [await fact()] });
  binding.detail = async () => ({ fact: { ...await fact(), comments: [] } });
  const server = coordinationPreview({ dataRoot: join(root, 'browser-data'), dist: join(unpacked, 'dist'), bindings: [binding],
    teamAction: async (method, input, confirmed) => {
      const response = await sender.request(method, input, { confirmed });
      if (response.statusCode !== 200) throw Object.assign(new Error(response.json().error), { status: response.statusCode });
      return response.json();
    } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.getByRole('region', { name: '团队研判' }).getByText('GitHub 组织：fixture-org · 2 位成员', { exact: true }).waitFor();
    await page.getByLabel('本仓方案', { exact: true }).fill('Isolated Host integration: keep this owner-authored plan.');
    const saved = page.waitForResponse(response => response.url().endsWith('/work'));
    await page.getByRole('button', { name: '保存本仓记录', exact: true }).click();
    assert.ok((await saved).ok());
    await page.reload();
    assert.equal(await page.getByLabel('本仓方案', { exact: true }).inputValue(), 'Isolated Host integration: keep this owner-authored plan.');
    const wakes = sender.wakes.length;
    await page.getByRole('group', { name: '研判方式', exact: true }).getByRole('button', { name: '猫猫研判', exact: true }).click();
    await page.getByRole('button', { name: '请猫分析', exact: true }).click();
    await page.getByText('已发送，等待研判', { exact: true }).waitFor();
    assert.equal(sender.wakes.length, wakes + 1);
    const job = (await sender.action('summary', { kind: 'analysis' })).rows.find(row => !row.analysis);
    assert.ok(job, 'browser request persisted in real Host storage');
    await sender.native('submit', { id: job.id, analysis });
    await page.getByText('9 / 10', { exact: true }).waitFor();
    await page.screenshot({ path: join(root, 'host-browser.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  }
}
