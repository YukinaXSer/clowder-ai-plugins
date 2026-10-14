import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { IssueCoordinationStore } from '../../src/source/IssueCoordinationStore.js';
import {
  IssueCoordinationService,
  type CoordinationBinding,
} from '../../src/source/IssueCoordinationService.js';
import { newInvestigation, issueRef } from '../../src/model/issue-coordination.js';
import type { IssueSourceFact, IssueSourceSnapshot } from '../../src/model/issue-source.js';

test('durable isolated partitions survive a new Host and stale/concurrent edits cannot overwrite', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'issue-coordination-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const a = new IssueCoordinationStore(root),
    b = new IssueCoordinationStore(root);
  await a.put('public', '88', { notes: 'public plan' }, 0);
  await a.put('internal', '88', { notes: 'internal evidence' }, 0);
  assert.equal((await b.read<{ notes: string }>('public', '88'))?.value.notes, 'public plan');
  assert.equal((await b.read<{ notes: string }>('internal', '88'))?.value.notes, 'internal evidence');
  await assert.rejects(b.put('public', '88', { notes: 'stale' }, 0), /其他页面/);
  const writes = await Promise.allSettled([
    a.put('public', '88', { notes: 'one' }, 1),
    b.put('public', '88', { notes: 'two' }, 1),
  ]);
  assert.equal(writes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await a.read('public', '88'))?.revision, 2);
});

test('two sources: failure, revocation, restart and independent verification never imply shared resolution', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'issue-coordination-sources-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let internalGrant = true,
    failInternal = false;
  let noCatalog = false,
    deniedByProvider = false;
  const fact = (id: string, state: string): IssueSourceFact => ({
    id,
    number: 88,
    state,
    title: id,
    labels: [],
    url: 'https://example.test/issues/88',
    updatedAt: '2026-10-14T00:00:00Z',
    body: 'private body',
    comments: [],
  });
  const pub = fact('p88', 'CLOSED'),
    internal = fact('i88', 'OPEN');
  const bind = (id: string, f: IssueSourceFact): CoordinationBinding => ({
    profile: {
      id,
      provider: 'test',
      instance: 'https://' + id + '.test',
      repositoryId: 'repo-id',
      repository: 'team/repo',
      name: id,
      visibility: id === 'public' ? 'public' : 'internal',
    },
    authorize: async () => id !== 'internal' || internalGrant,
    catalog: async (refresh) => {
      if (id === 'internal' && noCatalog) throw new Error('no cache available');
      if (refresh && id === 'internal' && failInternal) throw new Error('offline');
      return {
        repo: 'team/repo',
        revision: 1,
        fetchedAt: f.updatedAt,
        lastCompleteAt: f.updatedAt,
        issues: [f],
        failures:
          id === 'internal' && deniedByProvider ? [{ kind: 'auth' as const, message: 'credentials revoked' }] : [],
        summary: { added: 0, changed: 0, closed: 0, reopened: 0 },
      } satisfies IssueSourceSnapshot;
    },
    detail: async () => ({ fact: f }),
  });
  const service = new IssueCoordinationService(
    new IssueCoordinationStore(root),
    [bind('public', pub), bind('internal', internal)],
    'owner',
  );
  const a = issueRef('public', pub),
    b = issueRef('internal', internal);
  const pref = { name: '', enabled: true, branch: 'main', base: 'abc123' };
  const p = newInvestigation(a, pub.title, pub.updatedAt, pref),
    i = newInvestigation(b, internal.title, internal.updatedAt, pref);
  p.verification = 'passed';
  p.verificationEvidence = 'tests on abc123';
  p.adoption = 'applied';
  await service.saveWork(p, 0);
  await service.saveWork(i, 0);
  await service.saveRelation(
    {
      refs: [a, b],
      kind: 'port',
      reason: 'same reproducer',
      conclusion: 'internal sensitive finding',
      sourceVersions: [pub.updatedAt, internal.updatedAt],
      createdBy: 'spoofed',
      active: true,
    },
    0,
  );
  failInternal = true;
  const result = await service.load(true);
  assert.equal(result.sources[0].work[0].value.verification, 'passed');
  assert.equal(result.sources[1].work[0].value.verification, 'pending');
  assert.equal(result.sources[1].issues[0].body, undefined);
  assert.match(result.sources[1].error!, /更新失败/);
  assert.equal(result.relations[0].value.createdBy, 'owner');
  internalGrant = false;
  const denied = await service.load();
  assert.deepEqual(denied.sources[1].issues, []);
  assert.deepEqual(denied.sources[1].work, []);
  assert.deepEqual(denied.relations, []);
  await assert.rejects(service.detail(b), /未授权/);
  await assert.rejects(service.saveWork(i, 1), /未授权/);
  internalGrant = true;
  i.verification = 'passed';
  await assert.rejects(service.saveWork(i, 1), /验证证据/);
  assert.equal((await service.load()).relations.length, 1);
  noCatalog = true;
  assert.equal((await service.load()).sources[1].work[0]?.value.notes, i.notes);
  noCatalog = false;
  deniedByProvider = true;
  const providerDenied = await service.load();
  assert.deepEqual(providerDenied.sources[1].work, []);
  assert.deepEqual(providerDenied.relations, []);
});
