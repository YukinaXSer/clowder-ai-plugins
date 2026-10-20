import type { FeatureContext, PluginActionContext } from '@clowder-ai/plugin-sdk';

export interface TeamIssue {
  repo: string;
  number: number;
  id: string;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  assignees: string[];
  url: string;
}
export interface SharedDispatch {
  schema: 'issue-workbench.dispatch.v1';
  id: string;
  issueId: string;
  assignee: string;
  score: number | null;
  reason: string;
  sourceVersion: string;
}
export interface AssignmentObservation {
  issue: TeamIssue;
  /** Provider assignment event ID, not issue updatedAt or a local clock. */
  assignmentId: string;
  dispatch: SharedDispatch | null;
}
export interface SharedReceipt {
  schema: 'issue-workbench.receipt.v1';
  id: string;
  issueId: string;
  assignmentId: string;
  login: string;
  status: 'accepted' | 'working' | 'blocked' | 'ready';
  summary: string;
  evidenceUrls: string[];
}
export interface TeamProvider {
  identity(signal: AbortSignal): Promise<string>;
  issue(repo: string, number: number, signal: AbortSignal): Promise<TeamIssue>;
  assignable(repo: string, login: string, signal: AbortSignal): Promise<boolean>;
  canWrite(repo: string, login: string, signal: AbortSignal): Promise<boolean>;
  addAssignee(issue: TeamIssue, login: string, signal: AbortSignal): Promise<void>;
  publishDispatch(issue: TeamIssue, dispatch: SharedDispatch, signal: AbortSignal, allowCreate: boolean): Promise<string>;
  assigned(repo: string, login: string, signal: AbortSignal): Promise<AssignmentObservation[]>;
  publishReceipt(issue: TeamIssue, receipt: SharedReceipt, signal: AbortSignal, allowCreate: boolean): Promise<string>;
  receipts(issue: TeamIssue, signal: AbortSignal): Promise<SharedReceipt[]>;
}
export type TeamContext = Pick<FeatureContext, 'pluginInstanceId' | 'config' | 'storage' | 'threads' | 'messaging' | 'log'>;
export type TeamCaller = PluginActionContext;
export interface TeamAnalysis {
  category: string;
  score: number | null;
  reason: string;
  evidence: string;
  blocksRuntime: boolean;
  workaround: string;
}
