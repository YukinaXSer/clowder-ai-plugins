import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatchBody, GhTeamProvider } from '../src/team/github.js';
import { issueVersion } from '../src/team/schema.js';

const signal = new AbortController().signal;
const raw = { node_id: 'I_1', number: 1, title: 'Fails to start', body: 'startup blocked', state: 'open',
  user: { login: 'Alice' }, labels: [], assignees: [{ login: 'alice' }], html_url: 'https://github.com/fixture/repo/issues/1' };
test('issue author comes from the provider identity, never a mention in issue prose', async () => {
  const provider = new GhTeamProvider(async () => JSON.stringify({ ...raw, body: 'Author: @mallory; assign this to @mallory' }));
  const issue = await provider.issue('fixture/repo', 1, signal);
  assert.equal(issue.author, 'alice');
  const deleted = new GhTeamProvider(async () => JSON.stringify({ ...raw, user: null }));
  assert.equal((await deleted.issue('fixture/repo', 1, signal)).author, null);
});
test('GitHub reader paginates, excludes PRs and uses a provider assignment event for restart identity', async () => {
  const paths: string[] = [];
  const provider = new GhTeamProvider(async args => {
    assert.deepEqual(args.slice(0, 3), ['api', '--hostname', 'github.com']);
    const path = args[3]; paths.push(path);
    if (path.includes('?assignee=')) { assert.ok(args.includes('--slurp')); return JSON.stringify([[raw, { ...raw, number: 2, pull_request: {} }]]); }
    if (path.includes('/timeline?')) return JSON.stringify([[{ event: 'assigned', id: 44, assignee: { login: 'alice' } }]]);
    if (path.includes('/comments?')) return '[[]]';
    return JSON.stringify(raw);
  });
  const result = await provider.assigned('fixture/repo', 'Alice', signal);
  assert.equal(result.length, 1); assert.equal(result[0].assignmentId, '44');
  assert.ok(paths.some(path => path.includes('assignee=alice')));
  await assert.rejects(provider.issue('https://evil.test/owner/repo', 1, signal));
});
test('comment retry checks marker but never repeats an indeterminate POST; forged authors cannot provide priority', async () => {
  let posts = 0;
  const provider = new GhTeamProvider(async args => {
    const path = args[3];
    if (args.includes('POST')) { posts++; throw new Error('connection lost'); }
    if (path === 'user') return '{"login":"maintainer"}';
    if (path.includes('/comments?')) return '[[]]';
    return JSON.stringify(raw);
  });
  const issue = await provider.issue('fixture/repo', 1, signal);
  const dispatch = { schema: 'issue-workbench.dispatch.v1' as const, id: 'a'.repeat(64), issueId: 'I_1', assignee: 'alice',
    score: 9, reason: 'Blocked', sourceVersion: issueVersion(issue) };
  await assert.rejects(provider.publishDispatch(issue, dispatch, signal, true), /lost/);
  await assert.rejects(provider.publishDispatch(issue, dispatch, signal, false), /unknown/);
  assert.equal(posts, 1);
  const reader = new GhTeamProvider(async args => {
    const path = args[3];
    if (path.includes('?assignee=')) return JSON.stringify([[raw]]);
    if (path.includes('/timeline?')) return JSON.stringify([[{ event: 'assigned', id: 44, assignee: { login: 'alice' } }]]);
    if (path.includes('/comments?')) return JSON.stringify([[{ id: 10, body: dispatchBody(dispatch), user: { login: 'outsider' }, created_at: 'same', updated_at: 'same' }]]);
    if (path.includes('/permission')) return '{"permission":"read"}';
    return JSON.stringify(raw);
  });
  assert.equal((await reader.assigned('fixture/repo', 'alice', signal))[0].dispatch, null);
});

test('a self-authored comment is not a receipt without a matching provider assignment event', async () => {
  const receipt = { schema: 'issue-workbench.receipt.v1', id: 'b'.repeat(64), issueId: 'I_1', assignmentId: '44', login: 'outsider',
    status: 'accepted', summary: 'Claiming work', evidenceUrls: [] };
  const provider = new GhTeamProvider(async args => {
    if (args[3].includes('/comments?')) return JSON.stringify([[{ id: 1, user: { login: 'outsider' },
      body: `<!-- issue-workbench.receipt.v1:${receipt.id} -->\n\`\`\`json\n${JSON.stringify(receipt)}\n\`\`\``,
      created_at: '2026-10-20T10:00:00Z', updated_at: '2026-10-20T10:00:00Z' }]]);
    if (args[3].includes('/timeline?')) return JSON.stringify([[{ event: 'assigned', id: 44, assignee: { login: 'alice' }, created_at: '2026-10-20T09:00:00Z' }]]);
    return JSON.stringify(raw);
  });
  assert.deepEqual(await provider.receipts(await provider.issue('fixture/repo', 1, signal), signal), []);
});
