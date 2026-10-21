import { useState } from 'react';
import type { TeamHost } from '../ports/team.js';
import type { TeamRecordDetail } from '../team/records.js';
import styles from './team.module.css';

export function TeamAssignment({ host, row, busy, act }: {
  host: TeamHost; row: TeamRecordDetail; busy: boolean; act: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const options = row.assignmentOptions;
  const [login, setLogin] = useState(options.preferredLogin ?? '');
  const [confirming, setConfirming] = useState(false);
  if (row.kind !== 'analysis' || !row.analysis || row.assignment?.status === 'assigned') return null;
  if (!options.members.length) return <p className={styles.notice}>{options.error || '关联组织暂无可用成员，请刷新组织成员后重试'}</p>;
  const blocked = busy || row.sourceStale || row.currentIssue.state !== 'open' || !options.members.includes(login);
  return <div>
    {options.error && <p className={styles.notice}>{options.error}</p>}
    <label>指派给组员
      <select aria-label="指派给组员" value={login} disabled={busy || confirming}
        onChange={event => setLogin(event.target.value)}>
        <option value="">选择组织成员</option>
        {options.members.map(member => <option key={member} value={member}>@{member}</option>)}
      </select>
    </label>
    <p className={styles.muted}>{options.basis === 'reporter'
      ? `提交者 @${options.preferredLogin} 是组员，优先交给本人及本人配置的猫猫处理。`
      : '只列出当前 GitHub 组织成员；指派时会重新检查成员资格和仓库权限，并保留已有负责人。'}</p>
    {confirming ? <div className={styles.notice}>
      <p>将 {row.issue.repo}#{row.issue.number} 指派给 @{login}，并在 GitHub 公开发布研判分数 {row.analysis.score == null ? '待研判' : `${row.analysis.score} / 10`} 和上述理由。</p>
      <p>成员的插件启用收件后，会通知本人配置的猫猫；此操作不会自动修代码或合入。</p>
      <div className={styles.actions}>
        <button type="button" disabled={blocked} onClick={() => void act(() =>
          host.assign({ id: row.id, expectedRevision: row.revision, login }))}>确认指派</button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)}>取消</button>
      </div>
    </div> : <button type="button" disabled={blocked} onClick={() => setConfirming(true)}>指派任务</button>}
  </div>;
}
