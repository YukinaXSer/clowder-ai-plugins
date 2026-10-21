import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTeamClassifications } from '../src/team-ui/classification-overlay.js';
import { issueCategory, type CoordinationSnapshot } from '../src/model/issue-coordination.js';
import type { TeamClassification } from '../src/team/records.js';
import { setup } from './helpers/team-fixture.js';

function fixture() {
  const s = setup(), issue = s.issues[0];
  const result: TeamClassification = { id: 'result', issue, analysis: s.analysis, catId: 'selected-cat', recordedAt: Date.now(), bodySha256: 'body-digest' };
  const snapshot: CoordinationSnapshot = { relations: [], sources: [{
    profile: { id: 'github', provider: 'github', instance: 'https://github.com', repositoryId: 'repo-id', repository: issue.repo, name: 'Repo', visibility: 'public' },
    preference: { revision: 1, value: { name: 'Repo', enabled: true, branch: '', base: '' } }, work: [],
    issues: [{ id: issue.id, number: issue.number, title: issue.title, state: 'OPEN', labels: [], updatedAt: issue.updatedAt!, url: issue.url }],
  }] };
  return { snapshot, result };
}
test('one persisted cat result projects into queue categories and detail without altering source or local records', () => {
  const { snapshot, result } = fixture(), before = structuredClone(snapshot);
  const source = withTeamClassifications(snapshot, [result]).sources[0];
  assert.equal(issueCategory({ source, fact: source.issues[0] }).label, 'runtime');
  assert.equal(source.classifications![0].evidence, result.analysis.evidence);
  assert.equal(source.classifications![0].source.bodySha256, result.bodySha256);
  assert.match(source.classifications![0].model, /selected-cat/);
  assert.deepEqual(snapshot, before);
  source.issues[0].labels = ['feature:F123'];
  assert.equal(issueCategory({ source, fact: source.issues[0] }).label, '随 Feature 处理');
});
test('classification projection cannot cross provider, instance, repository, source revision or denied access', () => {
  for (const change of [
    (s: CoordinationSnapshot) => { s.sources[0].profile.provider = 'internal'; },
    (s: CoordinationSnapshot) => { s.sources[0].profile.instance = 'https://enterprise.test'; },
    (s: CoordinationSnapshot) => { s.sources[0].profile.repository = 'another/repo'; },
    (s: CoordinationSnapshot) => { s.sources[0].issues[0].id = 'another-issue'; },
    (s: CoordinationSnapshot) => { s.sources[0].issues[0].updatedAt = '2026-10-15T00:00:00Z'; },
    (s: CoordinationSnapshot) => { s.sources[0].issues[0].body = 'Changed body'; },
    (s: CoordinationSnapshot) => { s.sources[0].issues[0].unavailable = true; },
    (s: CoordinationSnapshot) => { s.sources[0].error = '来源未授权'; },
  ]) {
    const { snapshot, result } = fixture(); change(snapshot);
    assert.equal(withTeamClassifications(snapshot, [result]).sources[0].classifications, undefined);
  }
});
