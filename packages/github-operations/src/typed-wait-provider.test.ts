import assert from 'node:assert/strict';
import test from 'node:test';
import type { GitHubSnapshot } from './tracking-runtime.js';
import type { GitHubPrWaitBaseline, GitHubPrWaitPredicate, TaskItem, PrAutomationState } from './business/model/index.js';
import { prBaseline, waitObservation, waitEventSnapshot } from './typed-wait-provider.js';
import { matchGitHubWaitPredicates } from './business/domains/github-signals/GitHubWaitPredicateCatalog.js';
import {
  quietBaselineUpdate, renewPrWaitBaseline,
} from './business/domains/github-signals/GitHubWaitRenewalBaseline.js';

const head = 'a'.repeat(40), oldHead = 'b'.repeat(40);
const blank: GitHubSnapshot = { state: 'open', headSha: head, ci: 'pending', comments: [], reviews: [], commentsComplete: true };

for (const frontier of ['unknown', 'empty'] as const) {
  test(`a durable legacy verdict cannot block a fresh correlated result with ${frontier} submitted frontier`, async () => {
    const trigger = { id: 5, author: 'owner', body: '@codex review', commentType: 'conversation' as const,
      createdAt: '2026-10-09T00:00:02Z' };
    const older = { id: 10, author: 'human', state: 'APPROVED', commitId: head,
      submittedAt: '2026-10-09T00:00:01Z' };
    const result = { id: 11, author: 'cloud[bot]', state: 'COMMENTED', commitId: head,
      submittedAt: '2026-10-09T00:00:03Z' };
    const when: GitHubPrWaitPredicate[] = [{ kind: 'pr_review_result_available', triggerCommentId: trigger.id }];
    const registered = await task({ ...blank, comments: [trigger], reviews: [older] }, when);
    const automation = registered.automationState as PrAutomationState;
    const baseline = automation.await!.baseline;
    const tracked = { ...registered, automationState: { ...automation,
      review: { ...automation.review, observedReviews: { '10': 'PENDING' } },
      await: { ...automation.await!, baseline: { ...baseline,
        review: { ...baseline.review!, submittedReviewStates: frontier === 'empty' ? {} : undefined } } },
    } } as TaskItem;
    const observed = waitObservation(tracked, { ...blank, comments: [trigger], reviews: [result] },
      Date.parse('2026-10-09T00:00:04Z'), ['cloud[bot]']);
    assert.deepEqual(matchGitHubWaitPredicates(when, tracked.automationState!.await!.baseline,
      observed.observation.facts).map(match => match.sourceRef), ['review:11']);
    const renewed = renewPrWaitBaseline(tracked.automationState!.await!.baseline as GitHubPrWaitBaseline,
      observed.observation.collectorPatch as PrAutomationState, observed.observation.facts, 5000);
    assert.deepEqual(matchGitHubWaitPredicates(when, renewed, observed.observation.facts), [],
      'the delivered result is consumed exactly once');
  });
}

test('an unrelated new PENDING id cannot replay an already consumed cloud result', async () => {
  const trigger = { id: 5, author: 'owner', body: '@codex review', commentType: 'conversation' as const,
    createdAt: '2026-10-09T00:00:00Z' };
  const approval = { id: 10, author: 'cloud[bot]', state: 'APPROVED', commitId: head,
    submittedAt: '2026-10-09T00:00:01Z' };
  const when: GitHubPrWaitPredicate[] = [{ kind: 'pr_review_result_available', triggerCommentId: trigger.id }];
  const tracked = await task({ ...blank, comments: [trigger], reviews: [approval] }, when);
  const observed = waitObservation(tracked, { ...blank, comments: [trigger], reviews: [approval,
    { id: 11, author: 'cloud[bot]', state: 'PENDING', commitId: head }] },
  Date.parse('2026-10-09T00:00:02Z'), ['cloud[bot]']);
  assert.deepEqual(matchGitHubWaitPredicates(when, tracked.automationState!.await!.baseline,
    observed.observation.facts), [], 'only the result source frontier may make that result new');
});

for (const returned of ['older-only', 'none'] as const) {
  test(`renewal retains the latest consumed decision when a snapshot returns ${returned}`, async () => {
    const older = { id: 10, author: 'maintainer', state: 'APPROVED', commitId: head,
      submittedAt: '2026-10-09T00:00:01Z' };
    const latest = { id: 11, author: 'maintainer', state: 'CHANGES_REQUESTED', commitId: head,
      submittedAt: '2026-10-09T00:00:02Z' };
    const tracked = await task({ ...blank, reviews: [older, latest] }, [
      { kind: 'pr_review_decision_changed' }, { kind: 'pr_ci_terminal' },
    ]);
    const baseline = tracked.automationState!.await!.baseline as GitHubPrWaitBaseline;
    const observed = waitObservation(tracked, { ...blank, ci: 'pass',
      reviews: returned === 'older-only' ? [older] : [] }, 2000, []);
    const renewed = renewPrWaitBaseline(baseline, observed.observation.collectorPatch as PrAutomationState,
      observed.observation.facts, 2000);
    assert.equal(renewed.review?.decision, 'CHANGES_REQUESTED', 'omission is not a revocation');
    assert.equal(renewed.review?.decisionCursor, 11);
    const nextTask = { ...tracked, automationState: { ...tracked.automationState,
      await: { ...tracked.automationState!.await!, baseline: renewed } } } as TaskItem;
    const next = waitObservation(nextTask,
    { ...blank, reviews: [older, { ...latest, state: 'DISMISSED' }] }, 3000, []);
    const afterDismissal = renewPrWaitBaseline(renewed, next.observation.collectorPatch as PrAutomationState,
      next.observation.facts, 3000);
    assert.equal(afterDismissal.review?.decision, 'APPROVED', 'explicit dismissal still revokes the latest decision');
  });
}

test('a consumed legacy verdict cannot make an unrelated CI notification trigger the review-loop brake', async () => {
  const reviews = [1, 2, 3, 4].map(id => ({ id, author: 'maintainer', state: 'CHANGES_REQUESTED', commitId: head }));
  const tracked = await task({ ...blank, reviews }, [{ kind: 'pr_review_decision_changed' }, { kind: 'pr_ci_terminal' }]);
  const automation = tracked.automationState as PrAutomationState;
  const baseline = automation.await!.baseline as GitHubPrWaitBaseline;
  const polluted = { ...tracked, automationState: { ...automation,
    review: { ...automation.review, observedReviews: { '1': 'CHANGES_REQUESTED', '2': 'CHANGES_REQUESTED',
      '3': 'CHANGES_REQUESTED', '4': 'PENDING' } },
    await: { ...automation.await!, baseline: { ...baseline, review: { ...baseline.review!, submittedReviewStates: {} } } },
  } } as TaskItem;
  const observed = waitObservation(polluted, { ...blank, ci: 'pass', reviews }, 2000, []);
  assert.deepEqual(matchGitHubWaitPredicates(automation.await!.continuation.when,
    polluted.automationState!.await!.baseline, observed.observation.facts).map(match => match.kind), ['pr_ci_terminal']);
  assert.equal(observed.observation.reviewLoopBrake?.kind, 'continue', 'durable verdicts are consumed evidence for every consumer');
});
async function task(snapshot: GitHubSnapshot, when: readonly GitHubPrWaitPredicate[]): Promise<TaskItem> {
  const first = await prBaseline(snapshot, 'owner/repo', 1, when, () => 1000);
  return { id: 'task', kind: 'pr_tracking', subjectKey: 'pr:owner/repo#1', threadId: 'thread', ownerCatId: 'cat',
    status: 'doing', title: 'PR', why: '', createdBy: 'system', createdAt: 1000, updatedAt: 1000,
    automationState: { ...first.collectorState, await: { v: 1, generation: 1,
      subjectRef: 'pr:owner/repo#1', ownerFence: { kind: 'containing_task', generation: 1 },
      baseline: first.baseline, continuation: { when, then: 'Continue' }, createdAt: 1000, provenance: 'explicit_registration' } } };
}

test('complete registration baselines suppress historical journal events even with a CI-only wait', async () => {
  const first = { ...blank, comments: [{ id: 4, author: 'reviewer', body: 'history', commentType: 'inline' as const, commitId: head }],
    reviews: [{ id: 3, author: 'reviewer', state: 'APPROVED', commitId: head }] };
  const registered = await task(first, [{ kind: 'pr_ci_terminal' }]);
  const events = waitEventSnapshot(registered, { ...first, comments: [...first.comments,
    { id: 5, author: 'reviewer', body: 'late old commit', commentType: 'inline', commitId: oldHead },
    { id: 6, author: 'reviewer', body: 'new', commentType: 'inline', commitId: head }],
    reviews: [{ ...first.reviews[0]!, state: 'DISMISSED' }] });
  assert.deepEqual(events.comments.map(row => row.id), [6]);
  assert.deepEqual(events.reviews.map(row => row.state), ['DISMISSED']);
  await assert.rejects(prBaseline({ ...first, commentsComplete: false }, 'owner/repo', 1, [], () => 1000), /Complete/);
});

test('late review of an old HEAD is not a current review result or decision', async () => {
  const when: GitHubPrWaitPredicate[] = [{ kind: 'pr_review_result_available' }, { kind: 'pr_review_decision_changed' }];
  const registered = await task(blank, when);
  const observe = (commitId: string) => waitObservation(registered, { ...blank,
    reviews: [{ id: 7, author: 'reviewer', state: 'APPROVED', commitId }] }, 2000, []);
  assert.deepEqual(matchGitHubWaitPredicates(when, registered.automationState!.await!.baseline, observe(oldHead).observation.facts), []);
  assert.equal(matchGitHubWaitPredicates(when, registered.automationState!.await!.baseline, observe(head).observation.facts).length, 2);
});

test('COMMENTED reviews advance collection without replacing or emitting a formal decision', async () => {
  const when: GitHubPrWaitPredicate[] = [{ kind: 'pr_review_decision_changed' }];
  const changes = { id: 3, author: 'maintainer', state: 'CHANGES_REQUESTED', commitId: head };
  const replied = { id: 4, author: 'author', state: 'COMMENTED', commitId: head };
  const registered = await task({ ...blank, reviews: [changes, replied] }, when);
  const baseline = registered.automationState!.await!.baseline;
  assert.ok('headSha' in baseline);
  assert.equal(baseline.review?.decisionCursor, 4);
  assert.equal(baseline.review?.decision, 'CHANGES_REQUESTED');

  const beforeReply = await task({ ...blank, reviews: [changes] }, when);
  const observed = waitObservation(beforeReply, { ...blank, reviews: [changes, replied] }, 2000, []);
  assert.deepEqual(observed.observation.facts.review?.decisions?.map(row => row.id), [3]);
  assert.deepEqual(matchGitHubWaitPredicates(when, beforeReply.automationState!.await!.baseline,
    observed.observation.facts), []);
  assert.equal((observed.observation.collectorPatch as PrAutomationState).review?.lastDecisionCursor, 4);

  const renewed = renewPrWaitBaseline(beforeReply.automationState!.await!.baseline as GitHubPrWaitBaseline,
    observed.observation.collectorPatch as PrAutomationState, observed.observation.facts, 3000);
  assert.equal(renewed.review?.decisionCursor, 4);
  assert.equal(renewed.review?.decision, 'CHANGES_REQUESTED');
});

test('a COMMENTED reply and approval in one observation emit only the formal decision', async () => {
  const when: GitHubPrWaitPredicate[] = [{ kind: 'pr_review_decision_changed' }];
  const changes = { id: 3, author: 'maintainer', state: 'CHANGES_REQUESTED', commitId: head };
  const replied = { id: 4, author: 'author', state: 'COMMENTED', commitId: head };
  const approval = { id: 5, author: 'maintainer', state: 'APPROVED', commitId: head };
  const registered = await task({ ...blank, reviews: [changes] }, when);
  const baseline = registered.automationState!.await!.baseline as GitHubPrWaitBaseline;
  const observed = waitObservation(registered, { ...blank, reviews: [changes, replied, approval] }, 4000, []);

  assert.deepEqual(matchGitHubWaitPredicates(when, baseline, observed.observation.facts)
    .map(match => match.sourceRef), ['review:5']);
  const renewed = renewPrWaitBaseline(baseline, observed.observation.collectorPatch as PrAutomationState,
    observed.observation.facts, 5000);
  assert.equal(renewed.review?.decisionCursor, 5);
  assert.equal(renewed.review?.decision, 'APPROVED');
  assert.deepEqual(matchGitHubWaitPredicates(when, renewed, observed.observation.facts), [],
    'the consumed approval is not replayed after renewal');
});

test('a quiet submitted review advances the wait frontier without blocking a later cloud result', async () => {
  const trigger = { id: 5, author: 'owner', body: '@codex review', commentType: 'conversation' as const,
    createdAt: '2026-10-09T00:00:00Z' };
  const registered = await task({ ...blank, comments: [trigger] }, [
    { kind: 'pr_review_result_available', triggerCommentId: trigger.id },
  ]);
  const automation = registered.automationState as PrAutomationState;
  const quiet = waitObservation(registered, { ...blank, comments: [trigger], reviews: [
    { id: 10, author: 'human', state: 'COMMENTED', commitId: head,
      submittedAt: '2026-10-09T00:00:01Z' },
  ] }, Date.parse('2026-10-09T00:00:02Z'), ['cloud[bot]']);
  assert.deepEqual(matchGitHubWaitPredicates(automation.await!.continuation.when,
    automation.await!.baseline, quiet.observation.facts), []);
  const advanced = quietBaselineUpdate(automation.await!, quiet.observation.collectorPatch as PrAutomationState,
    quiet.observation.facts, Date.parse('2026-10-09T00:00:02Z'));
  assert.equal(advanced?.baseline.review?.submittedReviewStates?.['10']?.state, 'COMMENTED');

  const tracked = { ...registered, automationState: { ...automation,
    ...quiet.observation.collectorPatch as PrAutomationState,
    await: { ...automation.await!, baseline: advanced!.baseline },
  } } as TaskItem;
  const result = waitObservation(tracked, { ...blank, comments: [trigger], reviews: [
    { id: 11, author: 'cloud[bot]', state: 'COMMENTED', commitId: head,
      submittedAt: '2026-10-09T00:00:03Z' },
  ] }, Date.parse('2026-10-09T00:00:04Z'), ['cloud[bot]']);
  assert.equal(result.observation.facts.review?.resultSourceRef, 'review:11',
    'a consumed review omitted by a later complete page does not block the requested result');
});

test('renewal prefers a newly submitted lower review id over an older higher-id decision', async () => {
  const pending = { id: 10, author: 'maintainer', state: 'PENDING', commitId: head };
  const approval = { id: 11, author: 'maintainer', state: 'APPROVED', commitId: head,
    submittedAt: '2026-10-09T00:00:01Z' };
  const when: GitHubPrWaitPredicate[] = [{ kind: 'pr_review_decision_changed' }];
  const registered = await task({ ...blank, reviews: [pending, approval] }, when);
  const baseline = registered.automationState!.await!.baseline as GitHubPrWaitBaseline;
  const observed = waitObservation(registered, { ...blank, reviews: [
    { ...pending, state: 'CHANGES_REQUESTED', submittedAt: '2026-10-09T00:00:02Z' }, approval,
  ] }, Date.parse('2026-10-09T00:00:03Z'), []);

  assert.deepEqual(matchGitHubWaitPredicates(when, baseline, observed.observation.facts)
    .map(match => match.sourceRef), ['review:10']);
  const renewed = renewPrWaitBaseline(baseline, observed.observation.collectorPatch as PrAutomationState,
    observed.observation.facts, Date.parse('2026-10-09T00:00:04Z'));
  assert.equal(renewed.review?.decision, 'CHANGES_REQUESTED',
    'renewal follows the newly submitted decision rather than review creation-id order');
});

test('renewal compares a same-id transition with a newer review submitted in the same poll', async () => {
  const pending = { id: 10, author: 'maintainer', state: 'PENDING', commitId: head };
  const when: GitHubPrWaitPredicate[] = [{ kind: 'pr_review_decision_changed' }];
  const registered = await task({ ...blank, reviews: [pending] }, when);
  const baseline = registered.automationState!.await!.baseline as GitHubPrWaitBaseline;
  const observed = waitObservation(registered, { ...blank, reviews: [
    { ...pending, state: 'CHANGES_REQUESTED', submittedAt: '2026-10-09T00:01:00Z' },
    { id: 12, author: 'maintainer', state: 'APPROVED', commitId: head,
      submittedAt: '2026-10-09T00:02:00Z' },
  ] }, Date.parse('2026-10-09T00:03:00Z'), []);

  const renewed = renewPrWaitBaseline(baseline, observed.observation.collectorPatch as PrAutomationState,
    observed.observation.facts, Date.parse('2026-10-09T00:04:00Z'));
  assert.equal(renewed.review?.decision, 'APPROVED',
    'the latest submission wins even when another review transitioned in the same observation');
});

test('legacy verdict evidence prevents replay after an empty submitted frontier was persisted', async () => {
  const approval = { id: 10, author: 'maintainer', state: 'APPROVED', commitId: head };
  const when: GitHubPrWaitPredicate[] = [{ kind: 'pr_review_result_available' }];
  const registered = await task({ ...blank, reviews: [approval] }, when);
  const automation = registered.automationState as PrAutomationState;
  const baseline = automation.await!.baseline as GitHubPrWaitBaseline;
  const { submittedReviewStates: _missing, ...legacyReview } = baseline.review!;
  const legacyBaseline: GitHubPrWaitBaseline = { ...baseline, review: legacyReview };
  const legacy = { ...registered, automationState: { ...automation,
    review: { ...automation.review, observedReviews: { '10': 'PENDING' } },
    await: { ...automation.await!, baseline: legacyBaseline },
  } } as TaskItem;

  const pending = waitObservation(legacy, { ...blank, reviews: [
    { ...approval, state: 'PENDING' },
  ] }, Date.parse('2026-10-09T00:01:00Z'), []);
  assert.equal(quietBaselineUpdate({ ...automation.await!, baseline: legacyBaseline },
    pending.observation.collectorPatch as PrAutomationState,
    pending.observation.facts, Date.parse('2026-10-09T00:01:00Z')), null,
  'a PENDING-only observation must not turn a legacy unknown submitted frontier into an empty one');

  const pollutedBaseline: GitHubPrWaitBaseline = { ...legacyBaseline, review: {
    ...legacyBaseline.review!, submittedReviewStates: {},
  } };
  const polluted = { ...legacy, automationState: { ...legacy.automationState!,
    await: { ...automation.await!, baseline: pollutedBaseline },
  } } as TaskItem;
  const recovered = waitObservation(polluted, { ...blank, reviews: [approval] },
    Date.parse('2026-10-09T00:02:00Z'), []);
  assert.deepEqual(matchGitHubWaitPredicates(when, pollutedBaseline, recovered.observation.facts), [],
    'the durable verdict prevents a previously consumed formal result from replaying');
});

test('a persisted legacy COMMENTED decision baseline converges on the next formal approval', async () => {
  const when: GitHubPrWaitPredicate[] = [{ kind: 'pr_review_decision_changed' }];
  const changes = { id: 3, author: 'maintainer', state: 'CHANGES_REQUESTED', commitId: head };
  const replied = { id: 4, author: 'author', state: 'COMMENTED', commitId: head };
  const approval = { id: 5, author: 'maintainer', state: 'APPROVED', commitId: head };
  const registered = await task({ ...blank, reviews: [changes] }, when);
  const automation = registered.automationState as PrAutomationState;
  const cleanBaseline = automation.await!.baseline as GitHubPrWaitBaseline;
  const legacyBaseline: GitHubPrWaitBaseline = { ...cleanBaseline, review: {
    ...cleanBaseline.review!, decisionCursor: 4, decision: 'COMMENTED',
  } };
  const legacy = { ...registered, automationState: { ...automation,
    review: { ...automation.review, lastDecisionCursor: 4,
      observedReviews: { ...automation.review?.observedReviews, '4': 'COMMENTED' } },
    await: { ...automation.await!, baseline: legacyBaseline },
  } } as TaskItem;
  const observed = waitObservation(legacy, { ...blank, reviews: [changes, replied, approval] }, 6000, []);

  assert.deepEqual(matchGitHubWaitPredicates(when, legacyBaseline, observed.observation.facts)
    .map(match => match.sourceRef), ['review:5']);
  const renewed = renewPrWaitBaseline(legacyBaseline, observed.observation.collectorPatch as PrAutomationState,
    observed.observation.facts, 7000);
  assert.equal(renewed.review?.decisionCursor, 5);
  assert.equal(renewed.review?.decision, 'APPROVED');
  assert.deepEqual(matchGitHubWaitPredicates(when, renewed, observed.observation.facts), [],
    'the legacy polluted baseline converges without replaying the approval');
});

test('a same-id pending submission participates in the fourth-review loop brake', async () => {
  const prior = Array.from({ length: 3 }, (_, index) => ({
    id: index + 1,
    author: 'maintainer',
    state: 'CHANGES_REQUESTED',
    commitId: head,
  }));
  const pending = { id: 4, author: 'maintainer', state: 'PENDING', commitId: head };
  const registered = await task({ ...blank, authorLogin: 'owner', reviews: [...prior, pending] }, [
    { kind: 'pr_review_decision_changed' },
  ]);
  const observed = waitObservation(registered, {
    ...blank,
    authorLogin: 'owner',
    reviews: [...prior, { ...pending, state: 'CHANGES_REQUESTED' }],
  }, 7500, []);

  assert.equal(observed.observation.reviewLoopBrake?.kind, 'pause_once');
});

test('a legacy consumed same-id submission does not retrigger the fourth-review loop brake', async () => {
  const reviews = Array.from({ length: 4 }, (_, index) => ({
    id: index + 1,
    author: 'maintainer',
    state: 'CHANGES_REQUESTED',
    commitId: head,
  }));
  const registered = await task({ ...blank, authorLogin: 'owner', reviews }, [
    { kind: 'pr_review_decision_changed' },
  ]);
  const automation = registered.automationState as PrAutomationState;
  const baseline = automation.await!.baseline as GitHubPrWaitBaseline;
  const { submittedReviewStates: _legacyMissing, ...legacyReview } = baseline.review!;
  const legacy = { ...registered, automationState: {
    ...automation,
    review: { ...automation.review, observedReviews: {
      ...automation.review?.observedReviews, '4': 'PENDING',
    } },
    await: { ...automation.await!, baseline: { ...baseline, review: legacyReview } },
  } } as TaskItem;

  const observed = waitObservation(legacy, { ...blank, authorLogin: 'owner', reviews }, 7600, []);
  assert.notEqual(observed.observation.reviewLoopBrake?.kind, 'pause_once',
    'legacy history is quietly adopted instead of counting the same formal review twice');
});

test('a newly observed review dismissed between polls remains reportable', async () => {
  const when: GitHubPrWaitPredicate[] = [{ kind: 'pr_review_decision_changed' }];
  const registered = await task(blank, when);
  const dismissed = { id: 3, author: 'maintainer', state: 'DISMISSED', commitId: head };
  const observed = waitObservation(registered, { ...blank, reviews: [dismissed] }, 8000, []);

  assert.deepEqual(matchGitHubWaitPredicates(when, registered.automationState!.await!.baseline,
    observed.observation.facts).map(match => match.sourceRef), ['review:3']);
  assert.equal((observed.observation.collectorPatch as PrAutomationState).review?.lastDecisionCursor, 3);
  const renewed = renewPrWaitBaseline(registered.automationState!.await!.baseline as GitHubPrWaitBaseline,
    observed.observation.collectorPatch as PrAutomationState, observed.observation.facts, 8500);
  assert.equal(renewed.review?.decision, undefined);
  assert.deepEqual(matchGitHubWaitPredicates(when, renewed, observed.observation.facts), [],
    'the newly dismissed review is delivered once and not replayed after renewal');
});

test('renewal clears a formal decision after its review is dismissed', async () => {
  const when: GitHubPrWaitPredicate[] = [{ kind: 'pr_review_decision_changed' }];
  const approval = { id: 3, author: 'maintainer', state: 'APPROVED', commitId: head };
  const registered = await task({ ...blank, reviews: [approval] }, when);
  const baseline = registered.automationState!.await!.baseline as GitHubPrWaitBaseline;
  const observed = waitObservation(registered, { ...blank,
    reviews: [{ ...approval, state: 'DISMISSED' }] }, 9000, []);

  assert.equal(matchGitHubWaitPredicates(when, baseline, observed.observation.facts)[0]?.delta,
    'review APPROVED → DISMISSED (maintainer)');
  const renewed = renewPrWaitBaseline(baseline, observed.observation.collectorPatch as PrAutomationState,
    observed.observation.facts, 10000);
  assert.equal(renewed.review?.decision, undefined);

  const automation = registered.automationState as PrAutomationState;
  const renewedTask = { ...registered, automationState: { ...automation,
    ...observed.observation.collectorPatch as PrAutomationState,
    await: { ...automation.await!, baseline: renewed } } } as TaskItem;
  const next = waitObservation(renewedTask,
  { ...blank, reviews: [{ ...approval, state: 'DISMISSED' },
    { id: 4, author: 'maintainer', state: 'APPROVED', commitId: head }] }, 11000, []);
  assert.equal(matchGitHubWaitPredicates(when, renewed, next.observation.facts)[0]?.delta,
    'review pending → APPROVED (maintainer)');
});

test('explicit result uses the real trigger timestamp and complete provider evidence, never a supplied verdict', async () => {
  const trigger = { id: 5, author: 'owner', body: '@codex review', commentType: 'conversation' as const,
    createdAt: '2026-10-09T00:00:00Z' };
  const first = { ...blank, comments: [trigger] };
  const registered = await task(first, [{ kind: 'pr_review_result_available', triggerCommentId: 5 }]);
  const snapshot = { ...first, reviews: [{ id: 9, author: 'cloud[bot]', state: 'COMMENTED', commitId: head,
    submittedAt: '2026-10-09T00:00:01Z' }], cloudObservation: { headSha: head, status: 'clean' as const } };
  const read = (snapshot: GitHubSnapshot) => waitObservation(registered, snapshot, Date.parse('2026-10-09T00:00:02Z'), ['cloud[bot]']);
  const observed = read(snapshot);
  assert.equal(observed.observation.facts.review?.resultSourceRef, 'review:9');
  assert.equal(observed.snapshot.cloudObservation?.status, 'clean');
  assert.equal(read({ ...snapshot, comments: [] }).snapshot.cloudObservation, undefined);
  assert.throws(() => read({ ...snapshot, commentsComplete: false }), /Complete/);
  assert.equal(read({ ...snapshot, reviews: [{ ...snapshot.reviews[0]!, submittedAt: '2026-10-08T23:59:59Z' }] })
    .observation.facts.review?.resultSourceRef, undefined);
  // Once observed, even a comment-only review must remain accounted for.
  const advanced = { ...registered, automationState: { ...registered.automationState,
    ...observed.observation.collectorPatch } } as TaskItem;
  const regressed = waitObservation(advanced, { ...snapshot, reviews: [] }, Date.now(), ['cloud[bot]']);
  assert.equal(regressed.snapshot.cloudObservation, undefined);
});

test('dismissal stays final across regressed provider snapshots and does not produce another journal entry', async () => {
  const first = { ...blank, reviews: [{ id: 3, author: 'reviewer', state: 'DISMISSED', commitId: head }] };
  const registered = await task(first, [{ kind: 'pr_review_decision_changed' }]);
  const observed = waitObservation(registered, { ...first, reviews: [{ ...first.reviews[0]!, state: 'APPROVED' }] }, 2000, []);
  assert.equal(observed.snapshot.reviews[0]?.state, 'DISMISSED');
  assert.deepEqual(waitEventSnapshot(registered, observed.snapshot).reviews, []);
  assert.equal((observed.observation.collectorPatch as PrAutomationState).review?.observedReviews?.['3'], 'DISMISSED');
});
