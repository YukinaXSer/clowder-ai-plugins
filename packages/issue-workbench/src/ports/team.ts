import type { TeamRecord, TeamRecordDetail, TeamStatistics } from '../team/records.js';

export interface TeamSummary {
  rows: TeamRecord[];
  total: number;
  nextOffset: number | null;
  statistics: TeamStatistics;
  settings: { repositories?: string; analysisCatId?: string; analysisThreadId?: string;
    automaticAssignment?: boolean; receiveAssignments?: boolean; shareProgress?: boolean;
    teamOrganization?: string };
  group?: { organization?: string; members: string[]; error?: string };
  configurationError?: string;
}
export interface TeamHost {
  summary(input?: { repo?: string; number?: number; kind?: 'analysis' | 'inbox'; offset?: number }): Promise<TeamSummary>;
  get(id: string): Promise<TeamRecordDetail>;
  analyze(input: { repo: string; number: number; requestId: string }): Promise<TeamRecord>;
  retry(id: string): Promise<TeamRecord>;
  assign(input: { id: string; expectedRevision: number; login: string }): Promise<TeamRecord>;
  republish(id: string, expectedRevision: number): Promise<TeamRecord>;
  feedback(input: { id: string; expectedRevision: number; verdict: 'accepted' | 'corrected' | 'rejected'; reason: string }): Promise<TeamRecord>;
  settingsUrl?: string;
}
export class TeamAccessError extends Error { constructor(message: string, readonly status: number) { super(message); } }
/** Uses the existing owner-authenticated Host Settings route. The embedding Host
 * supplies its authenticated request function; this client never supplies identity. */
export function createTeamClient(request: (path: string, options?: RequestInit) => Promise<Response>, settingsUrl?: string): TeamHost {
  async function call<T>(action: string, payload: unknown, confirmed = false): Promise<T> {
    const response = await request('/api/plugins/dev.clowder.issue-workbench/actions/teamWorkbench/' + action, {
      method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json',
        ...(confirmed ? { 'x-cat-cafe-owner-confirmed': 'true' } : {}) },
      body: JSON.stringify({ payload: JSON.stringify(payload) }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new TeamAccessError([401, 403].includes(response.status) ? '团队操作未获授权，请在插件设置中检查授权'
        : [404, 503].includes(response.status) ? '团队模块尚未接入此工作台'
        : response.status === 409 ? '记录或插件状态已变化，请刷新后重试'
        : typeof result?.error === 'string' ? result.error.slice(0, 300) : '团队操作失败，请刷新后重试', response.status);
    }
    if (!result || result.render !== 'status' || !('data' in result)) throw new Error('团队模块返回了无法识别的结果');
    return result.data as T;
  }
  return {
    summary: input => call('summary', input ?? {}),
    get: id => call('get', { id }),
    analyze: input => call('analyze', input),
    retry: id => call('retry', { id }),
    assign: input => call('assign', input, true),
    republish: (id, expectedRevision) => call('republish', { id, expectedRevision }, true),
    feedback: input => call('feedback', input),
    settingsUrl,
  };
}
