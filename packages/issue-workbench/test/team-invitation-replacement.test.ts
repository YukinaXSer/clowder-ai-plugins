import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GhTeamProvider, dispatchBody } from '../src/team/github.js';
import { issueVersion } from '../src/team/schema.js';
import { setup } from './helpers/team-fixture.js';

const signal = new AbortController().signal;
const owner = () => ({ kind: 'owner-operation' as const, userId: 'owner', pluginInstanceId: 'isolated-test',
  operationKey: 'teamWorkbench', actionId: 'replaceInvitation', requestId: 'replace-1', signal, assertCurrent: async () => {} });

function github() {
  const raw: any = { node_id: 'I_1', number: 1, title: 'Fails', body: 'blocked', state: 'open',
    user: { login: 'reporter' }, labels: [], assignees: [], html_url: 'https://github.com/fixture/repo/issues/1' };
  let comment: any, patches = 0, loseResponse = false, editor = 'bob', extra: any[] = [];
  const provider = new GhTeamProvider(async args => {
    const path = args[3];
    if (path === 'user') return JSON.stringify({ login: 'bob' });
    if (path === 'graphql') return JSON.stringify({ data: { node: { id: 'IC_44', body: comment.body,
      author: { login: 'bob' }, editor: { login: editor }, updatedAt: comment.updated_at } } });
    if (args.includes('PATCH')) {
      assert.equal(path, 'repos/fixture/repo/issues/comments/44');
      patches++; comment.body = args.find(a => a.startsWith('body='))!.slice(5);
      comment.updated_at = '2026-10-29T01:00:00Z'; comment.node_id = 'IC_44';
      if (loseResponse) throw new Error('response lost');
      return JSON.stringify(comment);
    }
    assert.ok(!args.includes('POST'), 'replacement must never append another comment');
    if (path.includes('/comments?')) return JSON.stringify(args.includes('--slurp') ? [[comment, ...extra]] : [comment, ...extra]);
    assert.equal(path, 'repos/fixture/repo/issues/1');
    return JSON.stringify(raw);
  });
  return { provider, raw, set: (value: any) => { comment = value; }, comment: () => comment, editor: (value: string) => { editor = value; },
    patches: () => patches, lose: (value: boolean) => { loseResponse = value; }, extra: (value: any[]) => { extra = value; } };
}

test('original comment replacement withdraws old identity, receives new revision and reconciles a lost PATCH without a second write', async () => {
  const s = github(), issue = await s.provider.issue('fixture/repo', 1, signal);
  const previous = { schema: 'issue-workbench.dispatch.v1' as const, delivery: 'invitation' as const,
    id: 'a'.repeat(64), issueId: issue.id, assignee: 'alice', score: 8, reason: 'same module', sourceVersion: issueVersion(issue) };
  const next = { ...previous, assignee: 'bob', invitationRevision: { number: 1, previousAssignee: 'alice' } };
  s.set({ id: 44, body: dispatchBody(previous), user: { login: 'bob' },
    issue_url: 'https://api.github.com/repos/fixture/repo/issues/1', created_at: '2026-10-28T01:00:00Z', updated_at: '2026-10-28T01:00:00Z' });
  s.lose(true);
  await assert.rejects(s.provider.replaceInvitation(issue, '44', previous, next, signal, async () => {}), /response lost/);
  assert.equal(s.patches(), 1);
  s.lose(false);
  s.raw.assignees = [{ login: 'bob' }]; s.raw.body = 'edited after the successful PATCH';
  assert.equal(await s.provider.replaceInvitation(issue, '44', previous, next, signal, async () => { throw new Error('Read-only reconciliation must not request edit authority'); }), '44');
  assert.equal(s.patches(), 1);
  s.raw.assignees = []; s.raw.body = 'blocked';
  assert.equal(await s.provider.invitation(issue, 'invitation:44', 'alice', ['bob'], signal), null);
  const observations = (await s.provider.invitations('fixture/repo', 'bob', ['bob'], signal)).observations;
  assert.equal(observations.length, 1);
  assert.equal(observations[0].assignmentId, 'invitation:44:r1');
  assert.equal(observations[0].dispatch?.assignee, 'bob');
  s.editor('outsider');
  assert.deepEqual((await s.provider.invitations('fixture/repo', 'bob', ['bob'], signal)).observations, [],
    'an editor cannot forge a replacement under the original trusted author name');
  await assert.rejects(s.provider.replaceInvitation(issue, '44', previous, next, signal, async () => {}), /editor/i);
  s.editor('bob');
  s.raw.assignees = [{ login: 'alice' }];
  await assert.rejects(s.provider.replaceInvitation(issue, '44', next,
    { ...previous, invitationRevision: { number: 2, previousAssignee: 'bob' } }, signal, async () => {}), /assignee/i);
  assert.equal(s.patches(), 1);
});

test('replacement refuses foreign comments, changed body, stale source and revoked owner before PATCH', async () => {
  const s = github(), issue = await s.provider.issue('fixture/repo', 1, signal);
  const previous = { schema: 'issue-workbench.dispatch.v1' as const, delivery: 'invitation' as const,
    id: 'a'.repeat(64), issueId: issue.id, assignee: 'alice', score: 8, reason: 'same module', sourceVersion: issueVersion(issue) };
  const next = { ...previous, assignee: 'bob', invitationRevision: { number: 1, previousAssignee: 'alice' } };
  const original = { id: 44, body: dispatchBody(previous), user: { login: 'bob' }, created_at: '2026-10-28T01:00:00Z', updated_at: '2026-10-28T01:00:00Z' };
  for (const bad of [{ ...original, user: { login: 'alice' } }, { ...original, body: 'edited by human' }]) {
    s.set(bad);
    await assert.rejects(s.provider.replaceInvitation(issue, '44', previous, next, signal, async () => {}));
  }
  s.set(original); s.raw.body = 'new source';
  await assert.rejects(s.provider.replaceInvitation(issue, '44', previous, next, signal, async () => {}), /source/i);
  s.raw.body = 'blocked';
  await assert.rejects(s.provider.replaceInvitation(issue, '44', previous, next, signal, async () => { throw new Error('revoked'); }), /revoked/);
  assert.equal(s.patches(), 0);
  s.extra([{ ...original, id: 45 }]);
  await assert.rejects(s.provider.replaceInvitation(issue, '44', previous, next, signal, async () => {}), /marker/);
  s.extra([{ ...original, id: 45, body: `A quoted marker: <!-- issue-workbench.dispatch.v1:${previous.id} -->`, user: { login: 'outsider' } }]);
  assert.equal(await s.provider.replaceInvitation(issue, '44', previous, next, signal, async () => {}), '44');
  assert.equal(s.patches(), 1, 'an outsider quoting the marker must not block the verified owner comment');
});

test('owner replacement persists its intent/history, fences changed owner and membership, and reconciles after restart', async () => {
  const s = setup(); s.login('bob'); s.config.automaticAssignment = false;
  const runtime = s.runtime();
  const original: any = await runtime.invokeOwner('assignIssue', { repo: 'fixture/repo', number: 1,
    requestId: 'invite', sourceVersion: issueVersion(s.issues[0]), login: 'alice', delivery: 'invitation' }, { ...owner(), actionId: 'assignIssue' });
  let calls = 0;
  s.provider.replaceInvitation = async (_issue, commentId, previous, next, _signal, authorized) => {
    calls++;
    assert.equal(previous.assignee, 'alice'); assert.equal(next.assignee, 'bob');
    if (calls === 1) { await authorized(); s.dispatches[0] = next; throw new Error('response lost'); }
    assert.deepEqual(s.dispatches[0], next);
    return commentId;
  };
  const detail: any = await runtime.invokeOwner('get', { id: original.id }, { ...owner(), actionId: 'get' });
  const input = { id: original.id, expectedRevision: detail.revision, login: 'bob' };
  await assert.rejects(runtime.invokeOwner('replaceInvitation', input, { ...owner(), userId: 'stranger' }), /owner/i);
  s.issues[0].assignees = ['alice'];
  await assert.rejects(runtime.invokeOwner('replaceInvitation', input, owner()), /assignee/i);
  s.issues[0].assignees = []; s.members.splice(s.members.indexOf('bob'), 1);
  await assert.rejects(runtime.invokeOwner('replaceInvitation', input, owner()));
  s.members.push('bob');
  const pending: any = await runtime.invokeOwner('replaceInvitation', input, owner());
  assert.equal(pending.assignment.replacement.next.assignee, 'bob');
  assert.equal(pending.assignment.login, 'alice');
  await assert.rejects(runtime.invokeOwner('replaceInvitation', input, owner()), /changed/i);
  await runtime.stop();
  const restarted = s.runtime(); await restarted.recover(); assert.equal(calls, 1);
  const read: any = await restarted.invokeOwner('get', { id: original.id }, { ...owner(), actionId: 'get' });
  s.issues[0].assignees = ['bob']; s.issues[0].body = 'changed after the successful PATCH';
  const done: any = await restarted.invokeOwner('replaceInvitation', { ...input, expectedRevision: read.revision }, owner());
  assert.equal(done.assignment.login, 'bob'); assert.equal(done.assignment.commentId, original.assignment.commentId);
  assert.equal(done.assignment.invitationRevision.number, 1);
  assert.equal(done.assignment.replacement, undefined);
  assert.equal(done.assignment.replacementHistory[0].previous.assignee, 'alice');
  assert.equal(done.id, original.id); assert.deepEqual(s.writes, []);
  await restarted.stop();
});

test('actual revised invitation discovery withdraws the old inbox and a round-trip never reuses prior acceptance', async () => {
  const s = setup(), g = github(); s.config.automaticAssignment = false;
  s.issues[0] = await g.provider.issue('fixture/repo', 1, signal);
  s.provider.invitations = g.provider.invitations.bind(g.provider);
  s.provider.invitation = g.provider.invitation.bind(g.provider);
  const previous = { schema: 'issue-workbench.dispatch.v1' as const, delivery: 'invitation' as const,
    id: 'a'.repeat(64), issueId: s.issues[0].id, assignee: 'alice', score: 8, reason: 'same module', sourceVersion: issueVersion(s.issues[0]) };
  g.set({ id: 44, body: dispatchBody(previous), user: { login: 'bob' },
    issue_url: 'https://api.github.com/repos/fixture/repo/issues/1', created_at: '2026-10-28T01:00:00Z', updated_at: '2026-10-28T01:00:00Z' });
  const runtime = s.runtime(); s.login('alice');
  const first: any = await runtime.invoke('receive', {}, s.caller());
  const detail: any = await runtime.invokeOwner('get', { id: first[0].id }, { ...owner(), actionId: 'get' });
  await runtime.invokeOwner('acceptInbox', { id: first[0].id, expectedRevision: detail.revision }, { ...owner(), actionId: 'acceptInbox' });
  const next = { ...previous, assignee: 'bob', invitationRevision: { number: 1, previousAssignee: 'alice' } };
  await g.provider.replaceInvitation(s.issues[0], '44', previous, next, signal, async () => {});
  const old: any = await runtime.invoke('receive', {}, s.caller());
  assert.equal(old[0].status, 'inactive'); assert.equal(old[0].withdrawal.status, 'delivered');
  s.login('bob'); const second: any = await runtime.invoke('receive', {}, s.caller());
  const bob = second.find((r: any) => r.login === 'bob');
  assert.equal(bob.assignmentId, 'invitation:44:r1'); assert.equal(bob.ownerAcceptance, undefined);
  const back = { ...previous, invitationRevision: { number: 2, previousAssignee: 'bob' } };
  await g.provider.replaceInvitation(s.issues[0], '44', next, back, signal, async () => {});
  s.login('alice'); const again: any = await runtime.invoke('receive', {}, s.caller());
  const active = again.find((r: any) => r.status === 'delivered');
  assert.equal(active.assignmentId, 'invitation:44:r2'); assert.notEqual(active.id, first[0].id);
  assert.equal(active.ownerAcceptance, undefined);
  const before = s.sends.size;
  await runtime.stop(); const restart = s.runtime(); await restart.recover();
  assert.equal(s.sends.size, before, 'restart does not duplicate delivery');
  await restart.stop();
});
