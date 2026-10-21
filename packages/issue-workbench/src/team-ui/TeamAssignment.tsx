import { useRef, useState } from 'react';
import type { TeamHost, TeamIssueContext } from '../ports/team.js';
import type { TeamRecord, TeamRecordDetail } from '../team/records.js';
import styles from './team.module.css';

export function TeamAssignment({ host, context, row, busy, act }: {
  host: TeamHost; context: TeamIssueContext; row?: TeamRecordDetail; busy: boolean;
  act: (work: () => Promise<TeamRecord>) => Promise<void>;
}) {
  const options = context.assignmentOptions;
  const [login, setLogin] = useState(options.preferredLogin ?? '');
  const [confirming, setConfirming] = useState(false);
  const requestId = useRef<string>();
  const record = row && row.kind !== 'inbox' && (row.kind === 'assignment' || row.analysis) ? row : undefined;
  if (record?.assignment?.status === 'assigned') return null;
  if (!options.members.length) return <p className={styles.notice}>{options.error || '关联组织暂无可用成员，请刷新组织成员后重试'}</p>;
  const blocked = busy || row?.sourceStale || context.currentIssue.state !== 'open' || !options.members.includes(login)
    || context.currentIssue.assignees.some(member => member !== login);
  async function assign() {
    if (record) return host.assign({ id: record.id, expectedRevision: record.revision, login });
    requestId.current ??= crypto.randomUUID();
    return host.assignIssue({ repo: context.currentIssue.repo, number: context.currentIssue.number,
      sourceVersion: context.sourceVersion, requestId: requestId.current, login });
  }
  return <div>
    {options.error && <p className={styles.notice}>{options.error}</p>}
    <label>指派给组员
      <select aria-label="指派给组员" value={login} disabled={busy || confirming}
        onChange={event => { setLogin(event.target.value); requestId.current = undefined; }}>
        <option value="">选择组织成员</option>
        {options.members.map(member => <option key={member} value={member}>@{member}</option>)}
      </select>
    </label>
    <p className={styles.muted}>{options.basis === 'reporter'
      ? `提交者 @${options.preferredLogin} 是组员，优先交给本人及本人配置的猫猫处理。`
      : '只列出当前 GitHub 组织成员；指派时重新检查成员资格和仓库权限，并保留已有负责人。'}</p>
    {context.currentIssue.assignees.length > 0 && <p>当前负责人：{context.currentIssue.assignees.join('、')}。如需改派，请先在 GitHub 核对。</p>}
    {confirming ? <div className={styles.notice}>
      <p>将 {context.currentIssue.repo}#{context.currentIssue.number} 指派给 @{login}，并在 GitHub 公开记录{record?.analysis
        ? `研判分数 ${record.analysis.score == null ? '待研判' : `${record.analysis.score} / 10`} 和研判理由。`
        : '主人直接指派；尚无猫猫研判分数。'}</p>
      <p>成员的插件启用收件后，会通知本人配置的猫猫；此操作不会自动修代码或合入。</p>
      <div className={styles.actions}>
        <button type="button" disabled={blocked} onClick={() => void act(assign)}>确认指派</button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)}>取消</button>
      </div>
    </div> : <button type="button" disabled={blocked} onClick={() => setConfirming(true)}>指派任务</button>}
  </div>;
}
