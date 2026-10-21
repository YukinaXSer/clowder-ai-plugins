import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { dispatchSchema, issueInput, issueVersion, login, organization, receiptSchema, repository } from './schema.js';
import type { AssignmentObservation, SharedDispatch, SharedReceipt, TeamIssue, TeamProvider } from './types.js';

type GhCall = (args: string[], signal: AbortSignal) => Promise<string>;
const execute = promisify(execFile);
const issueSchema = z.object({
  node_id: z.string().min(1), number: z.number().int().positive(), title: z.string(),
  body: z.string().nullable(), state: z.enum(['open', 'closed']),
  updated_at: z.string().optional(),
  user: z.object({ login }).nullable(),
  labels: z.array(z.object({ name: z.string() })),
  assignees: z.array(z.object({ login })), html_url: z.string(), pull_request: z.unknown().optional(),
});
const commentSchema = z.object({
  id: z.number().int().positive(), body: z.string(), user: z.object({ login }),
  created_at: z.string(), updated_at: z.string(),
});
const marker = (id: string) => `<!-- issue-workbench.dispatch.v1:${id} -->`;
const escapeMention = (text: string) => text.replaceAll('@', '＠');
export const dispatchBody = (dispatch: SharedDispatch) =>
  `Issue Workbench · @${dispatch.assignee}\n\n优先级：${dispatch.score ?? '待研判'}${dispatch.score === null ? '' : '/10'}\n${escapeMention(dispatch.reason)}\n${dispatch.acceptanceSuggestedFor ? `\n建议合入前邀请 Issue 提交者 @${dispatch.acceptanceSuggestedFor} 参与验收；此建议不表示已验收，也不替代独立审查。\n` : ''}\n${marker(dispatch.id)}\n\`\`\`json\n${JSON.stringify(dispatch)}\n\`\`\``;

/** All paths are constructed here from validated repository/number/login.
 * No user-controlled URL, host, credential, executable or shell enters gh. */
export class GhTeamProvider implements TeamProvider {
  constructor(private readonly call: GhCall = async (args, signal) => {
    try {
      const { stdout } = await execute('gh', args, { signal, timeout: 45_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
      return stdout;
    } catch (error) {
      // Do not return CLI stderr (which can contain credential/config details).
      const status = /HTTP (\d{3})/.exec(String((error as { stderr?: string }).stderr ?? ''))?.[1];
      throw new Error(status ? `GitHub request failed (HTTP ${status})` : 'GitHub unavailable; check authentication and retry');
    }
  }) {}
  private async api(path: string, signal: AbortSignal, payload?: Record<string, unknown>, paged = false): Promise<unknown> {
    const args = ['api', '--hostname', 'github.com', path, '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2026-03-10'];
    if (paged) args.push('--paginate', '--slurp');
    if (payload) {
      args.push('--method', 'POST');
      for (const [key, value] of Object.entries(payload)) {
        for (const item of Array.isArray(value) ? value : [value]) args.push('-f', `${key}${Array.isArray(value) ? '[]' : ''}=${item}`);
      }
    }
    const raw = await this.call(args, signal); signal.throwIfAborted();
    const result: unknown = raw.trim() ? JSON.parse(raw) : null;
    if (!paged) return result;
    if (!Array.isArray(result) || result.some(page => !Array.isArray(page))) throw new Error('Incomplete GitHub pagination');
    return result.flat();
  }
  private path(repo: string, number?: number) {
    const parsed = repository.parse(repo);
    return number === undefined ? `repos/${parsed}` : `repos/${issueInput.parse({ repo: parsed, number }).repo}/issues/${number}`;
  }
  private decode(repo: string, value: unknown): TeamIssue {
    const raw = issueSchema.parse(value);
    if (raw.pull_request !== undefined) throw new Error('Pull request is not an Issue work item');
    const url = `https://github.com/${repo}/issues/${raw.number}`;
    if (raw.html_url.toLowerCase() !== url.toLowerCase()) throw new Error('GitHub issue repository mismatch');
    return { repo, number: raw.number, id: raw.node_id, title: raw.title, body: raw.body ?? '', state: raw.state,
      author: raw.user?.login ?? null, labels: raw.labels.map(label => label.name), assignees: raw.assignees.map(assignee => assignee.login), url,
      ...(raw.updated_at ? { updatedAt: raw.updated_at } : {}) };
  }
  async identity(signal: AbortSignal) {
    return z.object({ login }).parse(await this.api('user', signal)).login;
  }
  async organizationMembers(input: string, signal: AbortSignal) {
    const org = organization.parse(input);
    try {
      // A non-member can receive HTTP 200 with only public members. Verify the
      // authenticated user's active membership before treating this as a roster.
      const membership = z.object({ state: z.literal('active'), organization: z.object({ login }) })
        .parse(await this.api(`user/memberships/orgs/${org}`, signal));
      if (membership.organization.login !== org) throw new Error('Organization mismatch');
      const members = z.array(z.object({ login, type: z.string() })).parse(
        await this.api(`orgs/${org}/members?per_page=100&filter=all&role=all`, signal, undefined, true));
      return [...new Set(members.filter(member => member.type === 'User').map(member => member.login))].sort();
    } catch (error) {
      signal.throwIfAborted();
      const status = /HTTP (\d{3})/.exec(String(error))?.[1];
      throw new Error(`无法读取 GitHub Organization ${org} 的完整成员名单${status ? `（HTTP ${status}）` : ''}；请确认本机 gh 登录账号是该组织的有效成员，并具有组织成员读取权限（read:org / Members:read），然后刷新重试。`);
    }
  }
  async issue(repo: string, number: number, signal: AbortSignal) {
    return this.decode(repository.parse(repo), await this.api(this.path(repo, number), signal));
  }
  async openIssues(repo: string, signal: AbortSignal) {
    repo = repository.parse(repo);
    const rows = z.array(issueSchema).parse(await this.api(`${this.path(repo)}/issues?state=open&per_page=100`, signal, undefined, true));
    return rows.filter(row => row.pull_request === undefined && row.state === 'open').map(row => this.decode(repo, row));
  }
  async assignable(repo: string, target: string, signal: AbortSignal) {
    try { await this.api(`${this.path(repo)}/assignees/${login.parse(target)}`, signal); return true; }
    catch (error) { if (String(error).includes('HTTP 404')) return false; throw error; }
  }
  async canWrite(repo: string, target: string, signal: AbortSignal) {
    const result = z.object({ permission: z.string() }).parse(await this.api(`${this.path(repo)}/collaborators/${login.parse(target)}/permission`, signal));
    return ['admin', 'write', 'maintain'].includes(result.permission);
  }
  async addAssignee(issue: TeamIssue, target: string, signal: AbortSignal) {
    await this.api(`${this.path(issue.repo, issue.number)}/assignees`, signal, { assignees: [login.parse(target)] });
  }
  private async comments(issue: TeamIssue, signal: AbortSignal) {
    return z.array(commentSchema).parse(await this.api(`${this.path(issue.repo, issue.number)}/comments?per_page=100`, signal, undefined, true));
  }
  async publishDispatch(issue: TeamIssue, input: SharedDispatch, signal: AbortSignal, allowCreate: boolean) {
    const dispatch = dispatchSchema.parse(input), actor = await this.identity(signal);
    if (dispatch.issueId !== issue.id || dispatch.sourceVersion !== issueVersion(issue)) throw new Error('Dispatch source mismatch');
    const comments = await this.comments(issue, signal);
    const existing = comments.filter(comment => comment.user.login === actor && comment.body.includes(marker(dispatch.id)));
    const body = dispatchBody(dispatch);
    if (existing.length) {
      if (existing.length !== 1 || existing[0].body !== body) throw new Error('Shared dispatch marker has conflicting content');
      return String(existing[0].id);
    }
    if (!allowCreate) throw new Error('Previous comment outcome unknown; inspect GitHub before explicitly retrying publication');
    const result = z.object({ id: z.number().int().positive() }).parse(
      await this.api(`${this.path(issue.repo, issue.number)}/comments`, signal, { body }),
    );
    return String(result.id);
  }
  private async sharedDispatch(issue: TeamIssue, target: string, signal: AbortSignal) {
    for (const comment of (await this.comments(issue, signal)).reverse()) {
      const match = /<!-- issue-workbench\.dispatch\.v1:([a-f0-9]{64}) -->\n```json\n([^\n]+)\n```$/.exec(comment.body);
      if (!match) continue;
      let parsed;
      try { parsed = dispatchSchema.safeParse(JSON.parse(match[2])); } catch { continue; }
      if (!parsed.success || parsed.data.id !== match[1] || parsed.data.issueId !== issue.id ||
          parsed.data.assignee !== target || parsed.data.sourceVersion !== issueVersion(issue)) continue;
      // Editing metadata after the fact is not an authenticated new dispatch.
      if (comment.updated_at !== comment.created_at) continue;
      if (await this.canWrite(issue.repo, comment.user.login, signal)) return parsed.data;
    }
    return null;
  }
  async publishReceipt(issue: TeamIssue, input: SharedReceipt, signal: AbortSignal, allowCreate: boolean) {
    const receipt = receiptSchema.parse(input), actor = await this.identity(signal);
    if (receipt.issueId !== issue.id || receipt.login !== actor) throw new Error('Receipt identity mismatch');
    const tag = `<!-- issue-workbench.receipt.v1:${receipt.id} -->`;
    const body = `Issue Workbench · ${receipt.status}\n\n${escapeMention(receipt.summary)}\n${receipt.evidenceUrls.join('\n')}\n\n${tag}\n\`\`\`json\n${JSON.stringify(receipt)}\n\`\`\``;
    const existing = (await this.comments(issue, signal)).filter(comment => comment.user.login === actor && comment.body.includes(tag));
    if (existing.length) {
      if (existing.length !== 1 || existing[0].body !== body) throw new Error('Receipt marker conflict');
      return String(existing[0].id);
    }
    if (!allowCreate) throw new Error('Previous receipt outcome unknown; inspect GitHub before explicitly retrying publication');
    return String(z.object({ id: z.number().int().positive() }).parse(
      await this.api(`${this.path(issue.repo, issue.number)}/comments`, signal, { body }),
    ).id);
  }
  async receipts(issue: TeamIssue, signal: AbortSignal): Promise<SharedReceipt[]> {
    const receipts: SharedReceipt[] = [];
    const timeline = z.array(z.object({
      id: z.number().int().positive().optional(), event: z.string(), created_at: z.string().optional(),
      assignee: z.object({ login }).optional(),
    })).parse(await this.api(`${this.path(issue.repo, issue.number)}/timeline?per_page=100`, signal, undefined, true));
    for (const comment of await this.comments(issue, signal)) {
      const match = /<!-- issue-workbench\.receipt\.v1:([a-f0-9]{64}) -->\n```json\n([^\n]+)\n```$/.exec(comment.body);
      if (!match || comment.created_at !== comment.updated_at) continue;
      try {
        const receipt = receiptSchema.parse(JSON.parse(match[2]));
        const assignment = timeline.filter(event =>
          ['assigned', 'unassigned'].includes(event.event) && event.assignee?.login === receipt.login &&
          event.created_at && Date.parse(event.created_at) <= Date.parse(comment.created_at)).at(-1);
        if (receipt.id === match[1] && receipt.issueId === issue.id && receipt.login === comment.user.login &&
            assignment?.event === 'assigned' && String(assignment.id) === receipt.assignmentId) receipts.push(receipt);
      } catch { /* Ordinary comments are not structured progress. */ }
    }
    // These are authored reports with assignment IDs, not Host execution truth.
    return receipts;
  }
  async assigned(repo: string, target: string, signal: AbortSignal): Promise<AssignmentObservation[]> {
    repo = repository.parse(repo); target = login.parse(target);
    const raw = z.array(issueSchema).parse(await this.api(`${this.path(repo)}/issues?assignee=${target}&state=open&per_page=100`, signal, undefined, true));
    const result: AssignmentObservation[] = [];
    for (const value of raw) {
      if (value.pull_request !== undefined) continue;
      // A listing can race unassignment/closure. Observe the current Issue again.
      const issue = await this.issue(repo, value.number, signal);
      if (issue.state !== 'open' || !issue.assignees.includes(target)) continue;
      const timeline = z.array(z.object({
        id: z.number().int().positive().optional(), event: z.string(),
        assignee: z.object({ login }).optional(),
      })).parse(await this.api(`${this.path(repo, issue.number)}/timeline?per_page=100`, signal, undefined, true));
      const assignment = timeline.filter(event => ['assigned', 'unassigned'].includes(event.event) && event.assignee?.login === target).at(-1);
      if (!assignment?.id || assignment.event !== 'assigned') throw new Error('Current assignment event unavailable; retry without advancing inbox');
      result.push({ issue, assignmentId: String(assignment.id), dispatch: await this.sharedDispatch(issue, target, signal) });
    }
    return result;
  }
}
