import assert from 'node:assert/strict';
import test from 'node:test';
import type { GitHubWaitOutcomeV1 } from './business/model/index.js';
import { renderGitHubWaitOutcome } from './business/domains/github-signals/github-wait-renderer.js';

function outcome(subjectRef: GitHubWaitOutcomeV1['subjectRef']): GitHubWaitOutcomeV1 {
  return {
    v: 1,
    outcomeId: `wait:${subjectRef}:g1:matched`,
    generation: 1,
    subjectRef,
    ownerFence: { kind: 'containing_task', generation: 1 },
    reason: 'matched',
    matched: [{ kind: 'pr_ci_terminal', delta: 'CI pending → pass (0 blockers)' }],
    renewal: 'rearmed',
    at: 1,
    delivery: 'pending',
  };
}

test('PR wait title links its existing subject text without adding a second navigation line', () => {
  const rendered = renderGitHubWaitOutcome(outcome('pr:owner/repo#7'));
  assert.equal(
    rendered.split('\n')[0],
    '🔔 **PR wait satisfied** — [owner/repo#7](https://github.com/owner/repo/pull/7)',
  );
  assert.equal(rendered.match(/https:\/\/github\.com\//gu)?.length, 1);
  assert.doesNotMatch(rendered, /在 GitHub 查看|View on GitHub/u);
});

test('Issue wait title links its existing subject text to the issue', () => {
  const rendered = renderGitHubWaitOutcome(outcome('issue:owner/repo-name#19'));
  assert.equal(
    rendered.split('\n')[0],
    '🔔 **Issue wait satisfied** — [owner/repo-name#19](https://github.com/owner/repo-name/issues/19)',
  );
});
