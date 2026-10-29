import { memberDescription } from '../classification/member-profile';
import { systemLabels } from '../classification/issue-context';
import { useRef, useState } from 'react';
import type { TeamHost, TeamIssueContext } from '../ports/team.js';
import type { TeamRecord, TeamRecordDetail } from '../team/records.js';
import styles from './team.module.css';

export function TeamAssignment({ host, context, row, busy, act }: {
  host: TeamHost; context: TeamIssueContext; row?: TeamRecordDetail; busy: boolean;
  act: (work: () => Promise<TeamRecord>) => Promise<void>;
}) {
  const options = context.assignmentOptions;
  const completed = row && row.kind !== 'inbox' && !!row.assignment && ['assigned', 'invited'].includes(row.assignment.status);
  // A real assignment stays historical. An unclaimed invitation can be revised
  // at the original comment, with a separate owner confirmation and history.
  const pendingReplacement = row && row.kind !== 'inbox' ? row.assignment?.replacement : undefined;
  const committedRecipient = !completed && row && row.kind !== 'inbox' && row.assignment?.commentAttempted ? row.assignment.login : '';
  const [login, setLogin] = useState(pendingReplacement?.next.assignee ?? committedRecipient ?? '');
  const [delivery, setDelivery] = useState<'invitation' | 'assignment'>(pendingReplacement ? 'invitation' : !completed && row && row.kind !== 'inbox' && row.assignment ? row.assignment.delivery ?? 'assignment' : 'assignment');
  const replacing = completed && row.assignment?.status === 'invited' && delivery === 'invitation';
  const [confirming, setConfirming] = useState(false);
  const requestId = useRef<string>();
  const record = !completed && row && row.kind !== 'inbox' && (row.kind === 'assignment' || row.analysis) ? row : undefined;
  const ownerHelp = context.currentIssue.assignees.length > 0 && <div className={styles.notice}>
    <p>GitHub 当前负责人：{context.currentIssue.assignees.map(member => `@${member}`).join('、')}。</p>
    <p>不适合接手时，接收人先在 Issue 评论说明原因，再从 Assignees 移除自己，退回待分配。没有修改权限时请仓库维护者协助；不要移除其他共同负责人。</p>
    <a href={context.currentIssue.url} target="_blank" rel="noreferrer">在 GitHub 退回或改派</a>
    <p>退回后点击“刷新团队结果”，由协调人重新选择符合系统与分工的成员。已有分析和历史派工记录保留；GitHub 原生改派不会执行工作台的成员筛选，需由协调人核对。</p>
  </div>;
  if (row && pendingReplacement) return <div>
    {ownerHelp}
    <p role="alert">覆盖结果待核对：@{pendingReplacement.previous.assignee} → @{pendingReplacement.next.assignee}。{pendingReplacement.error}</p>
    <p>回读原评论，已完成时只同步本地历史；尚未完成时，仅在未认领、原文与成员规则仍有效的情况下继续原操作。不会另发评论。</p>
    {confirming ? <div className={styles.actions}>
      <button type="button" disabled={busy} onClick={() => void act(() => host.replaceInvitation({
        id: row.id, expectedRevision: row.revision, login: pendingReplacement.next.assignee,
      }))}>确认核对覆盖结果</button>
      <button type="button" disabled={busy} onClick={() => setConfirming(false)}>取消</button>
    </div> : <button type="button" disabled={busy} onClick={() => setConfirming(true)}>核对覆盖结果</button>}
  </div>;
  // An unfinished analysis may still be published for the same current owner.
  if (ownerHelp && !record?.analysis) return ownerHelp;
  if (!options.members.length) return <p className={styles.notice}>{options.error || '关联组织暂无可用成员，请刷新组织成员后重试'}</p>;
  const blocked = busy || ((!completed || replacing) && row?.sourceStale) || context.currentIssue.state !== 'open' || !options.eligibleMembers?.includes(login) || !!options.blockedReason
    || (replacing && (row.assignment?.login === login || !row.assignment?.commentId || context.currentIssue.assignees.length > 0))
    || context.currentIssue.assignees.some(member => member !== login);
  async function assign() {
    if (replacing) return host.replaceInvitation({ id: row.id, expectedRevision: row.revision, login });
    if (record) return host.assign({ id: record.id, expectedRevision: record.revision, login, delivery });
    requestId.current ??= crypto.randomUUID();
    return host.assignIssue({ repo: context.currentIssue.repo, number: context.currentIssue.number,
      sourceVersion: context.sourceVersion, requestId: requestId.current, login, delivery });
  }
  return <div>
    {ownerHelp}
    {completed && <p className={styles.notice}>{replacing ? '将在原评论上替换邀请收件人，保留链接与变更历史。请先核对旧收件人是否已有未公开工作。' : '历史记录已保留；GitHub 当前未认领。可选择设置负责人；选择通知成员接手时，已发布的邀请会原址覆盖。'}</p>}
    {options.error && <p className={styles.notice}>{options.error}</p>}
    <label>派工方式
      <select aria-label="派工方式" value={delivery} disabled={busy || confirming || !!pendingReplacement || !!record?.assignment?.commentAttempted}
        onChange={event => { setDelivery(event.target.value as 'invitation' | 'assignment'); requestId.current = undefined; }}>
        <option value="assignment">设置 GitHub 负责人</option>
        <option value="invitation">通知成员接手</option>
      </select>
    </label>
    <label>指派给组员
      <select aria-label="指派给组员" value={login} disabled={busy || confirming || !!pendingReplacement || !!record?.assignment?.commentAttempted}
        onChange={event => { setLogin(event.target.value); requestId.current = undefined; }}>
        <option value="">选择组织成员</option>
        {options.members.map(member => <option key={member} value={member} disabled={!options.eligibleMembers?.includes(member)}>
          @{member} · {memberDescription(options.profiles?.find(profile => profile.login === member))}
          {options.excluded?.find(item => item.login === member) ? ` · ${options.excluded.find(item => item.login === member)!.reason}` : ''}
        </option>)}
      </select>
    </label>
    {options.preferredLogin && <button type="button" disabled={busy || confirming || !!pendingReplacement || !!record?.assignment?.commentAttempted || !!options.blockedReason || !options.eligibleMembers?.includes(options.preferredLogin)}
      onClick={() => { setLogin(options.preferredLogin!); requestId.current = undefined; }}>采用推荐人选</button>}
    {!login && <p className={styles.muted}>请先选择收件人，或点击“采用推荐人选”；推荐不会自动成为指派。</p>}
    <p className={styles.muted}>{delivery === 'assignment'
      ? '派工会在 GitHub Issue 的 Assignees 中标记负责人，并在 Open 列表显示认领人。接收方配置通用 GitHub 认领收件后，会在自己的宿主对话收到通知，无需安装 Issue 工作台。'
      : '仅在 GitHub 评论中邀请对方，不设置负责人，也不会触发通用 GitHub 认领收件。对方同意后，在 GitHub 设置负责人或回到这里补充负责人。'}</p>
    <p>派工系统：{options.systemScope === 'common' ? '通用问题（未注明系统）' : options.affectedSystems?.map(system => systemLabels[system]).join('、') || '待判断'}
      {options.systemScope !== 'common' && <> · {options.systemsSource === 'human' ? '人工确认' : options.systemsSource === 'cat' ? '猫研判' : '原文判断'}</>}</p>
    {options.preferredLogin && <p>推荐 @{options.preferredLogin}：{options.recommendationReason}</p>}
    {!!options.excluded?.length && <details><summary>查看未参与推荐的成员</summary><ul>{options.excluded.map(item =>
      <li key={item.login}>@{item.login}：{item.reason}</li>)}</ul></details>}
    {confirming ? <div className={styles.notice}>
      {replacing && <p>覆盖原评论：@{row.assignment?.login} → @{login}。旧邀请失效；保留原链接与历史，不新增第二条邀请。</p>}
      {replacing ? <p>保留原邀请的分析分数与理由，只更新收件人与邀请版本。</p> : <p>将 {context.currentIssue.repo}#{context.currentIssue.number} {delivery === 'invitation' ? '发送任务邀请给' : '设置负责人为'} @{login}，并在 GitHub 公开记录{record?.analysis
        ? `研判分数 ${record.analysis.score == null ? '待研判' : `${record.analysis.score} / 10`} 和研判理由。`
        : '主人直接指派；尚无猫猫研判分数。'}</p>}
      {delivery === 'invitation' && <p>在 Issue 评论中通知对方；邀请发出后仍待对方接手，GitHub 负责人保持原样。</p>}
      <p>{delivery === 'assignment' ? '成员启用通用 GitHub 认领收件后，通知会进入本人配置的宿主对话。' : '本次只发布 GitHub 邀请评论，尚未建立认领。'}此操作不会自动修代码或合入。</p>
      <div className={styles.actions}>
        <button type="button" disabled={blocked} onClick={() => void act(assign)}>{replacing ? '确认覆盖邀请' : delivery === 'invitation' ? '确认发送邀请' : '确认指派'}</button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)}>取消</button>
      </div>
    </div> : <button type="button" disabled={blocked} onClick={() => setConfirming(true)}>{replacing ? '覆盖原邀请' : delivery === 'invitation' ? '通知成员接手' : '指派任务'}</button>}
  </div>;
}
