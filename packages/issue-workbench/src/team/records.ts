import type { SharedReceipt, TeamAnalysis, TeamIssue } from './types.js';

export interface TeamFeedback {
  verdict: 'accepted' | 'corrected' | 'rejected';
  reason: string;
  recordedAt: number;
  catId?: string;
  invocationId?: string;
  ownerMessageId?: string;
  ownerUserId?: string;
  ownerOperationId?: string;
}
export interface Job {
  kind: 'analysis';
  id: string;
  issue: TeamIssue;
  sourceVersion: string;
  features: string[];
  threadId: string;
  catId: string;
  sourceMessageId?: string;
  requester: string;
  requesterKind?: 'cat' | 'owner';
  ownerUserId?: string;
  ownerOperationId?: string;
  createdAt?: number;
  status: 'pending' | 'delivered' | 'analyzed';
  messageId?: string;
  error?: string;
  analysis?: TeamAnalysis;
  provenance?: { catId: string; invocationId: string; sourceMessageId: string; recordedAt: number };
  assignment?: { status: 'pending' | 'assigned' | 'needs-decision'; login?: string; reason?: string; commentAttempted?: boolean; commentId?: string; rulesHash?: string };
  feedback?: TeamFeedback;
  feedbackHistory?: TeamFeedback[];
}
export interface Inbox {
  kind: 'inbox'; id: string; issue: TeamIssue; assignmentId: string; login: string;
  receivedAt: number;
  threadId: string; catId: string; score: number | null; reason: string;
  status: 'pending' | 'delivered' | 'inactive'; messageId?: string; error?: string;
  dispatchId?: string;
  deliveryEpoch?: number;
  receipt?: { value: SharedReceipt; commentAttempted?: boolean; commentId?: string };
  withdrawal?: { status: 'pending' | 'delivered'; messageId?: string; error?: string };
  withdrawalHistory?: NonNullable<Inbox['withdrawal']>[];
}
export type TeamRecord = Job | Inbox;
export type TeamRecordDetail = TeamRecord & {
  revision: number; currentIssue: TeamIssue; sourceStale: boolean; sharedReceipts: SharedReceipt[];
};
export function statistics(rows: TeamRecord[]) {
  const jobs = rows.filter((row): row is Job => row.kind === 'analysis' && !!row.analysis);
  const reviews = jobs.filter(job => job.feedback), accepted = reviews.filter(job => job.feedback!.verdict === 'accepted').length;
  const distribution: Record<string, number> = {};
  const scores: Record<string, number> = {}, assignments: Record<string, number> = {};
  for (const job of jobs) {
    const key = job.features.length ? '随 Feature 处理' : job.analysis!.category;
    distribution[key] = (distribution[key] ?? 0) + 1;
    const score = job.analysis!.score === null ? '未评分' : String(job.analysis!.score);
    scores[score] = (scores[score] ?? 0) + 1;
    if (job.assignment?.status === 'assigned' && job.assignment.login) {
      assignments[job.assignment.login] = (assignments[job.assignment.login] ?? 0) + 1;
    }
  }
  return { analyzed: jobs.length, uniqueIssues: new Set(jobs.map(job => job.issue.repo + ':' + job.issue.id)).size,
    feedback: reviews.length, accepted, corrected: reviews.filter(job => job.feedback!.verdict === 'corrected').length,
    rejected: reviews.filter(job => job.feedback!.verdict === 'rejected').length, acceptanceRate: reviews.length ? accepted / reviews.length : null,
    distribution, scores, assignments, method: 'cat-semantic-analysis-with-explicit-feedback', trainingPerformed: false as const };
}
export type TeamStatistics = ReturnType<typeof statistics>;
