import { useEffect, useRef, useState } from 'react';
import type { IssueSourceFact, IssueSourceProfile } from '../model/issue-coordination.js';
import type { TeamHost, TeamSummary } from '../ports/team.js';
import type { TeamRecordDetail } from '../team/records.js';
import { TeamRecordView } from './TeamRecordView';
import { TeamRecovery } from './TeamRecovery';
import styles from './team.module.css';

export function TeamIssuePanel({ host, profile, fact }: { host: TeamHost; profile: IssueSourceProfile; fact: IssueSourceFact }) {
  const [summary, setSummary] = useState<TeamSummary>();
  const [row, setRow] = useState<TeamRecordDetail>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [receipt, setReceipt] = useState('');
  const [reason, setReason] = useState('');
  const requestId = useRef<string>();
  const generation = useRef(0), flight = useRef(false);
  const supported = profile.provider === 'github' && !profile.synthetic && !fact.unavailable;
  async function load(preferredId?: string) {
    const current = ++generation.current;
    const next = await host.summary({ repo: profile.repository, number: fact.number });
    const candidate = preferredId ?? next.rows.find(item => item.kind === 'analysis')?.id;
    const detail = candidate ? await host.get(candidate) : undefined;
    if (generation.current !== current) return;
    setSummary(next); setRow(detail); setError('');
  }
  function fail(error: unknown) {
    setError(error instanceof Error ? error.message : '团队操作失败');
    setRow(undefined); setSummary(undefined);
  }
  useEffect(() => {
    if (supported) { setBusy(true); void load().catch(fail).finally(() => setBusy(false)); }
    return () => { generation.current++; };
  }, [host, profile.repository, fact.number, supported]);
  async function act(work: () => Promise<unknown>, message = '') {
    if (flight.current) return;
    flight.current = true; setBusy(true); setReceipt(''); setError('');
    try { await work(); setReceipt(message); }
    catch (error) { fail(error); }
    finally { flight.current = false; setBusy(false); }
  }
  const configured = !!summary?.settings.analysisCatId && !!summary?.settings.analysisThreadId && !summary?.configurationError;
  return <section className={styles.panel} aria-label="团队研判">
    <header><h3>团队研判</h3><button type="button" disabled={busy || !supported} onClick={() => void act(() => load(row?.id))}>刷新团队结果</button></header>
    {!supported ? <p>此来源暂不支持 GitHub 团队联动</p> : <>
      {error && <p role="alert">{error}</p>}
      {summary && !configured && <p>请在插件设置中选择研判猫和研判对话，并配置允许处理的仓库。</p>}
      {host.settingsUrl && <a href={host.settingsUrl}>插件设置</a>}
      <button type="button" className={styles.primary} disabled={busy || !configured} onClick={() => void act(async () => {
        requestId.current ??= crypto.randomUUID();
        const result = await host.analyze({ repo: profile.repository, number: fact.number, requestId: requestId.current });
        requestId.current = undefined;
        await load(result.id);
      })}>{row?.kind === 'analysis' && row.analysis ? '重新研判' : '请猫分析'}</button>
      {configured && <p className={styles.muted}>{summary?.settings.automaticAssignment
        ? '研判后按已保存分工自动指派，并公开发布分数和理由。'
        : '自动指派未开启，研判结果仅保存在本工作台。'}</p>}
      {busy && <p role="status">正在读取或处理…</p>}
      {row && <>
        <TeamRecordView row={row} />
        <TeamRecovery key={`${row.id}:${row.revision}`} host={host} row={row} busy={busy}
          act={work => act(async () => { await work(); await load(row.id); })} />
        {row.kind === 'analysis' && row.analysis && <details open>
          <summary>人工反馈</summary>
          {row.feedback && <p>{({ accepted: '已采纳', corrected: '已修正', rejected: '已拒绝' })[row.feedback.verdict]} · {row.feedback.reason}</p>}
          <label>反馈理由<textarea aria-label="反馈理由" maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <div className={styles.actions}>{(['accepted', 'corrected', 'rejected'] as const).map(verdict =>
            <button key={verdict} type="button" disabled={busy || !reason.trim()} onClick={() => void act(async () => {
              await host.feedback({ id: row.id, expectedRevision: row.revision, verdict, reason: reason.trim() });
              await load(row.id); setReason('');
            }, '反馈已保存')}>{({ accepted: '采纳研判', corrected: '记录修正', rejected: '拒绝研判' })[verdict]}</button>)}</div>
        </details>}
      </>}
      {receipt && <p role="status">{receipt}</p>}
    </>}
  </section>;
}
