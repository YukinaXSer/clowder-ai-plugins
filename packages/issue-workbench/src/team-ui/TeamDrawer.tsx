import { useEffect, useRef, useState } from 'react';
import type { TeamHost, TeamSummary } from '../ports/team.js';
import type { TeamRecordDetail } from '../team/records.js';
import { TeamRecordView } from './TeamRecordView';
import { TeamRecovery } from './TeamRecovery';
import styles from './team.module.css';

function Contents({ host }: { host: TeamHost }) {
  const [tab, setTab] = useState<'inbox' | 'analysis' | 'statistics'>('inbox');
  const [offset, setOffset] = useState(0), [summary, setSummary] = useState<TeamSummary>();
  const [detail, setDetail] = useState<TeamRecordDetail>(), [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const version = useRef(0);
  useEffect(() => {
    const current = ++version.current;
    setBusy(true); setError(''); setDetail(undefined); setSummary(undefined);
    void host.summary({ ...(tab === 'statistics' ? {} : { kind: tab }), offset })
      .then(value => { if (version.current === current) setSummary(value); })
      .catch(error => { if (version.current === current) setError(error.message); })
      .finally(() => { if (version.current === current) setBusy(false); });
    return () => { version.current++; };
  }, [host, tab, offset]);
  async function read(id: string) {
    const current = ++version.current; setBusy(true); setError('');
    try { const next = await host.get(id); if (version.current === current) setDetail(next); }
    catch (error) { if (version.current === current) { setError((error as Error).message); setDetail(undefined); setSummary(undefined); } }
    finally { if (version.current === current) setBusy(false); }
  }
  async function mutate(work: () => Promise<unknown>) {
    if (busy || !detail) return;
    const current = ++version.current; setBusy(true); setError('');
    try {
      await work();
      const next = await host.get(detail.id);
      if (version.current === current) setDetail(next);
    } catch (error) {
      if (version.current === current) { setError((error as Error).message); setDetail(undefined); setSummary(undefined); }
    } finally { if (version.current === current) setBusy(false); }
  }
  const stats = summary?.statistics;
  return <>
    <nav className={styles.actions} aria-label="团队记录视图">
      {(['inbox', 'analysis', 'statistics'] as const).map(value => <button type="button" key={value}
        aria-pressed={tab === value} onClick={() => { setTab(value); setOffset(0); }}>
        {({ inbox: '我的收件', analysis: '研判记录', statistics: '反馈统计' })[value]}</button>)}
    </nav>
    {busy && <p role="status">正在读取…</p>}
    {error && <p role="alert">{error}</p>}
    {summary?.configurationError && <p>{summary.configurationError}</p>}
    {tab === 'statistics' && stats && <div className={styles.result}>
      <p>已研判 {stats.analyzed} · 独立问题 {stats.uniqueIssues}</p><p>已反馈 {stats.feedback}</p>
      <p>采纳 {stats.accepted} · 修正 {stats.corrected} · 拒绝 {stats.rejected}</p>
      <p>采纳率：{stats.acceptanceRate === null ? '暂无人工反馈' : `${Math.round(stats.acceptanceRate * 100)}%`}</p>
      <table><thead><tr><th>类别</th><th>研判次数</th></tr></thead><tbody>
        {Object.entries(stats.distribution).map(([category, count]) => <tr key={category}><td>{category}</td><td>{count}</td></tr>)}
      </tbody></table>
      <table><thead><tr><th>优先级</th><th>研判次数</th></tr></thead><tbody>
        {Object.entries(stats.scores).map(([score, count]) => <tr key={score}><td>{score}</td><td>{count}</td></tr>)}
      </tbody></table>
      <table><thead><tr><th>历史派工成员</th><th>已公开派工的研判次数</th></tr></thead><tbody>
        {Object.entries(stats.assignments).map(([login, count]) => <tr key={login}><td>{login}</td><td>{count}</td></tr>)}
      </tbody></table>
      <p className={styles.muted}>同一问题的多次研判分别计数；历史派工次数不代表当前待办量。</p>
      <p className={styles.muted}>统计来自保存的研判与明确的人工反馈，未进行模型训练。</p>
    </div>}
    {tab !== 'statistics' && summary && <>
      {!summary.rows.length && <p>{tab === 'inbox' ? '暂无收件记录' : '暂无研判记录'}</p>}
      <div className={styles.records}>{summary.rows.map(row => <button type="button" key={row.id}
        aria-pressed={detail?.id === row.id} onClick={() => void read(row.id)}>
        <strong>{row.issue.repo}#{row.issue.number} · {row.issue.title}</strong>
        <span>{row.kind === 'inbox' ? `${row.score ?? '待研判'}${row.score === null ? '' : ' / 10'} · ${row.status === 'inactive' ? '原分配已结束' : row.status === 'delivered' ? '团队已收取' : '待投递'}`
          : row.analysis ? `${row.analysis.score ?? '待研判'} · ${row.analysis.category}` : row.status === 'delivered' ? '等待研判' : '待发送'}</span>
      </button>)}</div>
      <div className={styles.actions}>
        <button type="button" disabled={busy || !offset} onClick={() => setOffset(Math.max(0, offset - 30))}>上一页</button>
        <span>{summary.total} 条记录</span>
        <button type="button" disabled={busy || summary.nextOffset === null} onClick={() => setOffset(summary.nextOffset!)}>下一页</button>
      </div>
    </>}
    {detail && <section aria-label="团队记录详情"><h3>{detail.issue.title}</h3><TeamRecordView row={detail} />
      <TeamRecovery key={`${detail.id}:${detail.revision}`} host={host} row={detail} busy={busy} act={mutate} />
    </section>}
  </>;
}
export function TeamDrawer({ host }: { host: TeamHost }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  return <>
    <button type="button" onClick={() => setOpen(true)}>团队记录</button>
    <dialog ref={dialog} className={styles.dialog} onClose={() => setOpen(false)} onCancel={() => setOpen(false)} aria-label="团队记录">
      <header><h2>团队记录</h2><button type="button" onClick={() => setOpen(false)}>关闭</button></header>
      {open && <Contents host={host} />}
    </dialog>
  </>;
}
