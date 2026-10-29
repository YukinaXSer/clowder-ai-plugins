import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { dispatchSchema, issueInput, issueVersion, login, organization, receiptSchema, repository } from './schema.js';
import type { AssignmentObservation, InvitationPage, SharedDispatch, SharedReceipt, TeamIssue, TeamProvider } from './types.js';

type GhCall = (args: string[], signal: AbortSignal) => Promise<string>;
const execute = promisify(execFile);
// Provider authors can be bot/deleted identities. Only human targets use login.
const authorLogin = z.string().min(1).max(100).transform(value => value.toLowerCase());
const issueSchema = z.object({
  node_id: z.string().min(1), number: z.number().int().positive(), title: z.string(),
  body: z.string().nullable(), state: z.enum(['open', 'closed']),
  updated_at: z.string().optional(),
  user: z.object({ login: authorLogin }).nullable(),
  labels: z.array(z.object({ name: z.string() })),
  assignees: z.array(z.object({ login })), html_url: z.string(), pull_request: z.unknown().optional(),
});
// The REST repository /issues collection also downloads every PR. Read the
// Issue-only connection for both history and Open batch planning.
const catalogQuery = (openOnly: boolean) => `query($owner:String!,$name:String!,$endCursor:String){
  repository(owner:$owner,name:$name){
    issues(first:100,after:$endCursor,states:${openOnly ? '[OPEN]' : '[OPEN,CLOSED]'},orderBy:{field:CREATED_AT,direction:ASC}){
      totalCount
      nodes{id number title body state updatedAt url author{login}
        labels(first:100){nodes{name} pageInfo{hasNextPage}}
        assignees(first:100){nodes{login} pageInfo{hasNextPage}}}
      pageInfo{hasNextPage endCursor}
    }
  }
}`;
const nestedPageInfo = z.object({ hasNextPage: z.boolean() });
const catalogPages = z.array(z.object({
  errors: z.array(z.unknown()).max(0).optional(),
  data: z.object({ repository: z.object({ issues: z.object({
    totalCount: z.number().int().nonnegative(),
    nodes: z.array(z.object({
      id: issueSchema.shape.node_id, number: issueSchema.shape.number, title: z.string(), body: z.string().nullable(),
      state: z.enum(['OPEN', 'CLOSED']), updatedAt: z.string(), url: z.string(), author: issueSchema.shape.user,
      labels: z.object({ nodes: issueSchema.shape.labels, pageInfo: nestedPageInfo }),
      assignees: z.object({ nodes: issueSchema.shape.assignees, pageInfo: nestedPageInfo }),
    })),
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().min(1).nullable() }),
  }) }) }),
})).min(1);
const commentSchema = z.object({
  node_id: z.string().min(1).optional(),
  id: z.number().int().positive(), body: z.string(), user: z.object({ login: authorLogin }).nullable(),
  created_at: z.string(), updated_at: z.string(),
});
const marker = (id: string) => `<!-- issue-workbench.dispatch.v1:${id} -->`;
const invitationId = (commentId: number, dispatch: SharedDispatch) => `invitation:${commentId}${dispatch.invitationRevision ? `:r${dispatch.invitationRevision.number}` : ''}`;
const escapeMention = (text: string) => text.replaceAll('@', '＠');
export const dispatchBody = (dispatch: SharedDispatch) =>
  `Issue Workbench${dispatch.initiator === 'system' ? ' · 提交人：system' : ''} · @${dispatch.assignee}${dispatch.delivery === 'invitation' ? ' · 任务邀请（待接手，未设置 GitHub 负责人）' : ''}\n\n优先级：${dispatch.score ?? '待研判'}${dispatch.score === null ? '' : '/10'}\n${escapeMention(dispatch.reason)}${dispatch.invitationRevision ? `\n\n邀请已调整（第 ${dispatch.invitationRevision.number} 次）：${escapeMention(dispatch.invitationRevision.previousAssignee)} → @${dispatch.assignee}。原收件人的邀请已失效。` : ''}\n${dispatch.acceptanceSuggestedFor ? `\n建议合入前邀请 Issue 提交者 @${dispatch.acceptanceSuggestedFor} 参与验收；此建议不表示已验收，也不替代独立审查。\n` : ''}\n${marker(dispatch.id)}\n\`\`\`json\n${JSON.stringify(dispatch)}\n\`\`\``;

function invitationDispatch(comment: z.infer<typeof commentSchema>, target: string, trustedSenders: string[]) {
  if (!comment.user || !trustedSenders.includes(comment.user.login)) return null;
  const match = /<!-- issue-workbench\.dispatch\.v1:([a-f0-9]{64}) -->\n```json\n([^\n]+)\n```$/.exec(comment.body);
  if (!match) return null;
  try {
    const dispatch = dispatchSchema.parse(JSON.parse(match[2]));
    // Compare to the original JSON, not schema property order. An invitation is
    // an exact protocol record; arbitrary mentions never become executable work.
    if (comment.created_at !== comment.updated_at && !dispatch.invitationRevision) return null;
    if (dispatch.invitationRevision?.previousAssignee === dispatch.assignee) return null;
    if (dispatch.delivery !== 'invitation' || dispatch.id !== match[1] || dispatch.assignee !== target ||
        dispatchBody(JSON.parse(match[2])) !== comment.body) return null;
    return dispatch;
  } catch { return null; }
}

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
  private async api(path: string, signal: AbortSignal, payload?: Record<string, unknown>, paged = false, method = 'POST'): Promise<unknown> {
    const args = ['api', '--hostname', 'github.com', path, '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2026-03-10'];
    if (paged) args.push('--paginate', '--slurp');
    if (payload) {
      args.push('--method', method);
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
    return this.catalog(repo, signal, true);
  }
  async allIssues(repo: string, signal: AbortSignal) {
    return this.catalog(repo, signal, false);
  }
  private async catalog(repo: string, signal: AbortSignal, openOnly: boolean) {
    repo = repository.parse(repo);
    const [owner, name] = repo.split('/');
    const raw = await this.call(['api', '--hostname', 'github.com', 'graphql', '-f', `query=${catalogQuery(openOnly)}`,
      '-f', `owner=${owner}`, '-f', `name=${name}`, '--paginate', '--slurp'], signal);
    signal.throwIfAborted();
    const parsed = catalogPages.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error('Incomplete GitHub issue catalog');
    const pages = parsed.data.map(page => page.data.repository.issues);
    const cursors = new Set<string>();
    for (const [index, page] of pages.entries()) {
      const { hasNextPage, endCursor } = page.pageInfo;
      if (hasNextPage !== (index < pages.length - 1) || hasNextPage && (!endCursor || !page.nodes.length) ||
          endCursor && cursors.has(endCursor)) throw new Error('Incomplete GitHub issue catalog');
      if (endCursor) cursors.add(endCursor);
    }
    const nodes = pages.flatMap(page => page.nodes);
    if (nodes.length !== pages.at(-1)!.totalCount || new Set(nodes.map(node => node.id)).size !== nodes.length ||
        new Set(nodes.map(node => node.number)).size !== nodes.length) throw new Error('Incomplete GitHub issue catalog');
    const issues: TeamIssue[] = [];
    for (const node of nodes) {
      let issue = this.decode(repo, { node_id: node.id, number: node.number, title: node.title, body: node.body,
        state: node.state.toLowerCase(), updated_at: node.updatedAt, html_url: node.url, user: node.author,
        labels: node.labels.nodes, assignees: node.assignees.nodes });
      if (node.labels.pageInfo.hasNextPage || node.assignees.pageInfo.hasNextPage) {
        // REST's single-Issue resource contains the complete arrays. Never
        // silently present the GraphQL first 100 labels/assignees as complete.
        issue = await this.issue(repo, node.number, signal);
        if (issue.id !== node.id || issue.number !== node.number) throw new Error('GitHub issue identity mismatch');
      }
      if (openOnly && issue.state !== 'open') throw new Error('Incomplete GitHub issue catalog');
      issues.push(issue);
    }
    signal.throwIfAborted();
    return issues;
  }
  async assignable(repo: string, target: string, signal: AbortSignal) {
    const normalized = login.parse(target);
    // The single-user endpoint can reject lowercased identities that GitHub
    // lists as assignable. Match our normalized identity against the full roster.
    const members = z.array(z.object({ login })).parse(
      await this.api(`${this.path(repo)}/assignees?per_page=100`, signal, undefined, true));
    return members.some(member => member.login === normalized);
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
  private async trustedInvitation(comment: z.infer<typeof commentSchema>, target: string, senders: string[], signal: AbortSignal) {
    const dispatch = invitationDispatch(comment, target, senders);
    if (!dispatch?.invitationRevision) return dispatch;
    if (!comment.node_id) return null;
    // REST retains the original author after a maintainer edits their comment.
    // An explicit revision is trusted only when that same author was its editor.
    const query = 'query($id:ID!){node(id:$id){... on IssueComment{id body updatedAt author{login} editor{login}}}}';
    const result = z.object({ errors: z.array(z.unknown()).max(0).optional(), data: z.object({ node: z.object({
      id: z.string(), body: z.string(), updatedAt: z.string(),
      author: z.object({ login: authorLogin }).nullable(), editor: z.object({ login: authorLogin }).nullable(),
    }).nullable() }) }).parse(await this.api('graphql', signal, { query, id: comment.node_id }));
    const node = result.data.node;
    if (!node || node.id !== comment.node_id || node.author?.login !== comment.user?.login || node.editor?.login !== comment.user?.login) return null;
    if (node.body !== comment.body || Date.parse(node.updatedAt) !== Date.parse(comment.updated_at)) throw new Error('Invitation changed during lookup; retry');
    return dispatch;
  }
  async discussion(issue: TeamIssue, signal: AbortSignal) {
    return (await this.comments(issue, signal)).map(comment => ({
      id: String(comment.id), author: comment.user?.login ?? '[deleted]', body: comment.body,
      createdAt: comment.created_at, updatedAt: comment.updated_at,
      lastEditedAt: comment.updated_at === comment.created_at ? null : comment.updated_at,
      url: `https://github.com/${issue.repo}/issues/${issue.number}#issuecomment-${comment.id}`,
    }));
  }
  async publishDispatch(issue: TeamIssue, input: SharedDispatch, signal: AbortSignal, allowCreate: boolean) {
    const dispatch = dispatchSchema.parse(input), actor = await this.identity(signal);
    if (dispatch.issueId !== issue.id || dispatch.sourceVersion !== issueVersion(issue)) throw new Error('Dispatch source mismatch');
    const comments = await this.comments(issue, signal);
    const existing = comments.filter(comment => comment.user?.login === actor && comment.body.includes(marker(dispatch.id)));
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
  async replaceInvitation(issue: TeamIssue, commentId: string, previousInput: SharedDispatch, nextInput: SharedDispatch,
    signal: AbortSignal, authorized: () => Promise<void>) {
    const previous = dispatchSchema.parse(previousInput), next = dispatchSchema.parse(nextInput);
    if (!/^[1-9][0-9]*$/.test(commentId) || previous.delivery !== 'invitation' || next.delivery !== 'invitation' ||
        next.id !== previous.id || next.issueId !== previous.issueId || next.assignee === previous.assignee ||
        next.invitationRevision?.number !== (previous.invitationRevision?.number ?? 0) + 1 ||
        next.invitationRevision.previousAssignee !== previous.assignee ||
        JSON.stringify({ ...next, assignee: previous.assignee, invitationRevision: previous.invitationRevision }) !==
          JSON.stringify({ ...previous, invitationRevision: previous.invitationRevision })) throw new Error('Invalid invitation replacement');
    const actor = await this.identity(signal), comments = await this.comments(issue, signal);
    const comment = comments.find(row => String(row.id) === commentId);
    if (!comment || comment.user?.login !== actor ||
        comments.filter(row => row.body.includes(marker(previous.id))).length !== 1) throw new Error('Original invitation owner or marker changed');
    const body = dispatchBody(next);
    if (comment.body !== body && (!await this.trustedInvitation(comment, previous.assignee, [actor], signal) || comment.body !== dispatchBody(previous))) {
      throw new Error('Original invitation content changed; inspect before replacing');
    }
    const current = await this.issue(issue.repo, issue.number, signal);
    if (current.assignees.length) throw new Error('Issue has an assignee; invitation replacement is forbidden');
    if (current.id !== previous.issueId || current.state !== 'open' || issueVersion(current) !== previous.sourceVersion) throw new Error('Invitation source changed');
    await authorized(); signal.throwIfAborted();
    // A lost PATCH response is reconciled by its exact desired body. Never POST.
    if (comment.body !== body) {
      await this.api(`${this.path(issue.repo)}/issues/comments/${commentId}`, signal, { body }, false, 'PATCH');
    }
    const verified = (await this.comments(issue, signal)).find(row => String(row.id) === commentId);
    if (!verified || verified.user?.login !== actor || verified.body !== body ||
        !await this.trustedInvitation(verified, next.assignee, [actor], signal)) throw new Error('Replacement outcome unverified; inspect and retry');
    return commentId;
  }
  private async sharedDispatch(issue: TeamIssue, target: string, signal: AbortSignal) {
    for (const comment of (await this.comments(issue, signal)).reverse()) {
      const match = /<!-- issue-workbench\.dispatch\.v1:([a-f0-9]{64}) -->\n```json\n([^\n]+)\n```$/.exec(comment.body);
      if (!match) continue;
      let parsed;
      try { parsed = dispatchSchema.safeParse(JSON.parse(match[2])); } catch { continue; }
      if (!parsed.success || parsed.data.id !== match[1] || parsed.data.issueId !== issue.id ||
          parsed.data.delivery === 'invitation' ||
          parsed.data.assignee !== target || parsed.data.sourceVersion !== issueVersion(issue)) continue;
      // Editing metadata after the fact is not an authenticated new dispatch.
      if (comment.updated_at !== comment.created_at) continue;
      if (comment.user && login.safeParse(comment.user.login).success && await this.canWrite(issue.repo, comment.user.login, signal)) return parsed.data;
    }
    return null;
  }
  async publishReceipt(issue: TeamIssue, input: SharedReceipt, signal: AbortSignal, allowCreate: boolean) {
    const receipt = receiptSchema.parse(input), actor = await this.identity(signal);
    if (receipt.issueId !== issue.id || receipt.login !== actor) throw new Error('Receipt identity mismatch');
    const tag = `<!-- issue-workbench.receipt.v1:${receipt.id} -->`;
    const body = `Issue Workbench · ${receipt.status}\n\n${escapeMention(receipt.summary)}\n${receipt.evidenceUrls.join('\n')}\n\n${tag}\n\`\`\`json\n${JSON.stringify(receipt)}\n\`\`\``;
    const existing = (await this.comments(issue, signal)).filter(comment => comment.user?.login === actor && comment.body.includes(tag));
    if (existing.length) {
      if (existing.length !== 1 || existing[0].body !== body) throw new Error('Receipt marker conflict');
      return String(existing[0].id);
    }
    if (!allowCreate) throw new Error('Previous receipt outcome unknown; inspect GitHub before explicitly retrying publication');
    return String(z.object({ id: z.number().int().positive() }).parse(
      await this.api(`${this.path(issue.repo, issue.number)}/comments`, signal, { body }),
    ).id);
  }
  async receipts(issue: TeamIssue, signal: AbortSignal, trustedSenders: string[] = []): Promise<SharedReceipt[]> {
    const receipts: SharedReceipt[] = [];
    const comments = await this.comments(issue, signal);
    const timeline = z.array(z.object({
      id: z.number().int().positive().optional(), event: z.string(), created_at: z.string().optional(),
      assignee: z.object({ login }).optional(),
    })).parse(await this.api(`${this.path(issue.repo, issue.number)}/timeline?per_page=100`, signal, undefined, true));
    for (const comment of comments) {
      const match = /<!-- issue-workbench\.receipt\.v1:([a-f0-9]{64}) -->\n```json\n([^\n]+)\n```$/.exec(comment.body);
      if (!match || comment.created_at !== comment.updated_at) continue;
      try {
        const receipt = receiptSchema.parse(JSON.parse(match[2]));
        const assignment = timeline.filter(event =>
          ['assigned', 'unassigned'].includes(event.event) && event.assignee?.login === receipt.login &&
          event.created_at && Date.parse(event.created_at) <= Date.parse(comment.created_at)).at(-1);
        let invitation = false;
        for (const candidate of comments) {
          if (!receipt.assignmentId.startsWith(`invitation:${candidate.id}`)) continue;
          const dispatch = await this.trustedInvitation(candidate, receipt.login, trustedSenders, signal);
          if (dispatch?.issueId === issue.id && receipt.assignmentId === invitationId(candidate.id, dispatch) &&
              Date.parse(dispatch.invitationRevision ? candidate.updated_at : candidate.created_at) <= Date.parse(comment.created_at)) invitation = true;
        }
        if (receipt.id === match[1] && receipt.issueId === issue.id && receipt.login === comment.user?.login &&
            (invitation || assignment?.event === 'assigned' && String(assignment.id) === receipt.assignmentId)) receipts.push(receipt);
      } catch { /* Ordinary comments are not structured progress. */ }
    }
    // These are authored reports with assignment IDs, not Host execution truth.
    return receipts;
  }
  private async observeInvitation(issue: TeamIssue, comment: z.infer<typeof commentSchema>, target: string, senders: string[], signal: AbortSignal): Promise<AssignmentObservation | null> {
    const dispatch = await this.trustedInvitation(comment, target, senders, signal);
    if (!dispatch || dispatch.issueId !== issue.id || dispatch.sourceVersion !== issueVersion(issue) ||
        issue.state !== 'open' || issue.assignees.some(assignee => assignee !== target)) return null;
    return { issue, assignmentId: invitationId(comment.id, dispatch), dispatch, delivery: 'invitation' };
  }
  async invitation(issue: TeamIssue, assignmentId: string, target: string, trustedSenders: string[], signal: AbortSignal) {
    target = login.parse(target);
    for (const comment of await this.comments(issue, signal)) {
      const observed = await this.observeInvitation(issue, comment, target, trustedSenders, signal);
      if (observed?.assignmentId === assignmentId) return observed;
    }
    return null;
  }
  async invitations(repo: string, target: string, trustedSenders: string[], signal: AbortSignal, page = 1, since?: string): Promise<InvitationPage> {
    repo = repository.parse(repo); target = login.parse(target);
    // Read one bounded page. The runtime commits continuation only after its
    // deliveries are persisted; old invitations are revalidated independently.
    z.number().int().min(1).max(1_000_000).parse(page);
    if (since) z.string().datetime().parse(since);
    const query = `per_page=100&sort=updated&direction=desc&page=${page}${since ? `&since=${encodeURIComponent(since)}` : ''}`;
    const comments = z.array(commentSchema.extend({ issue_url: z.string() })).parse(
      await this.api(`${this.path(repo)}/issues/comments?${query}`, signal));
    const result: AssignmentObservation[] = [];
    const issues = new Map<number, TeamIssue | null>();
    for (const comment of comments) {
      if (!invitationDispatch(comment, target, trustedSenders)) continue;
      let url: URL;
      try { url = new URL(comment.issue_url); } catch { continue; }
      const match = /^\/repos\/([^/]+\/[^/]+)\/issues\/([1-9][0-9]*)$/.exec(url.pathname);
      if (url.origin !== 'https://api.github.com' || url.username || url.password || url.search || url.hash ||
          !match || match[1].toLowerCase() !== repo || !Number.isSafeInteger(Number(match[2]))) continue;
      const number = Number(match[2]);
      if (!issues.has(number)) {
        const raw = issueSchema.parse(await this.api(this.path(repo, number), signal));
        issues.set(number, raw.pull_request === undefined ? this.decode(repo, raw) : null);
      }
      const issue = issues.get(number);
      if (!issue) continue;
      const observed = await this.observeInvitation(issue, comment, target, trustedSenders, signal);
      if (observed) result.push(observed);
    }
    const dates = comments.map(comment => Date.parse(comment.updated_at)).filter(Number.isFinite);
    return { observations: result, nextPage: comments.length === 100 ? page + 1 : null,
      ...(dates.length ? { newestUpdatedAt: new Date(Math.max(...dates)).toISOString() } : {}) };
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
