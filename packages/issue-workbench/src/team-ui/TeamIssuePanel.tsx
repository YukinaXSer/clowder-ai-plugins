import { useEffect, useRef, useState } from 'react';
import type { IssueSourceFact, IssueSourceProfile } from '../model/issue-coordination.js';
import type { TeamHost, TeamSummary } from '../ports/team.js';
import type { TeamRecordDetail } from '../team/records.js';
import { TeamRecordView } from './TeamRecordView';
import { TeamRecovery } from './TeamRecovery';
import { TeamAssignment } from './TeamAssignment';
import { TeamOrganization } from './TeamOrganization';
import styles from './team.module.css';

export function TeamIssuePanel({ host, profile, fact, category, onRead }: {
  host: TeamHost; profile: IssueSourceProfile; fact: IssueSourceFact; category: string; onRead: (summary?: TeamSummary) => void;
}) {
  const [summary, setSummary] = useState<TeamSummary>();
  const [row, setRow] = useState<TeamRecordDetail>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [receipt, setReceipt] = useState('');
  const [reason, setReason] = useState(''), [catId, setCatId] = useState('');
  const requestId = useRef<string>();
  const generation = useRef(0), flight = useRef(false);
  const supported = profile.provider === 'github' && !profile.synthetic && !fact.unavailable;
  async function load(preferredId?: string) {
    const current = ++generation.current;
    const next = await host.summary({ repo: profile.repository, number: fact.number });
    const candidate = preferredId ?? next.rows.find(item => item.kind !== 'inbox')?.id;
    const detail = candidate ? await host.get(candidate) : undefined;
    if (generation.current !== current) return;
    setSummary(next); setRow(detail); setError('');
    onRead(next);
    setCatId(previous => next.analysisCats?.some(cat => cat.catId === previous) ? previous
      : next.analysisCats?.some(cat => cat.catId === next.settings.analysisCatId) ? next.settings.analysisCatId! : '');
  }
  function fail(error: unknown) {
    setError(error instanceof Error ? error.message : '团队操作失败');
    setRow(undefined); setSummary(undefined);
    onRead();
  }
  useEffect(() => {
    if (supported) { setBusy(true); void load().catch(fail).finally(() => setBusy(false)); }
    return () => { generation.current++; };
  }, [host, profile.repository, fact.number, supported]);
  useEffect(() => {
    const pending = summary?.rows.find(item => item.kind === 'analysis' && item.status === 'delivered');
    if (!pending || busy) return;
    let reading = false;
    const timer = setInterval(() => {
      if (reading || flight.current || document.visibilityState !== 'visible') return;
      reading = true;
      void load().catch(fail).finally(() => { reading = false; });
    }, 2500);
    return () => clearInterval(timer);
  }, [summary, busy]);
  async function act(work: () => Promise<unknown>, message = '') {
    if (flight.current) return;
    flight.current = true; setBusy(true); setReceipt(''); setError('');
    try { await work(); setReceipt(message); }
    catch (error) { fail(error); }
    finally { flight.current = false; setBusy(false); }
  }
  const configured = !!summary?.settings.analysisThreadId && !!summary?.analysisCats?.some(cat => cat.catId === catId) && !summary?.configurationError;
  return <section className={styles.panel} aria-label="团队研判">
    <header><h3>团队研判</h3><button type="button" disabled={busy || !supported} onClick={() => void act(() => load(row?.id))}>刷新团队结果</button></header>
    {!supported ? <p>此来源暂不支持 GitHub 团队联动</p> : <>
      {error && <p role="alert">{error}</p>}
      {summary && !configured && <p>请在插件设置中选择研判猫和研判对话，并配置允许处理的仓库。</p>}
      {host.settingsUrl && <a href={host.settingsUrl}>插件设置</a>}
      <p aria-live="polite">当前分类：{summary?.issueContext?.features.length
        ? `随 Feature 处理 · ${summary.issueContext.features.join('、')}`
        : summary?.issueContext?.analysis?.category ?? category}</p>
      {summary?.issueContext && <TeamAssignment
        key={`assign:${summary.issueContext.sourceVersion}:${row?.id ?? ''}:${row?.revision ?? 0}:${JSON.stringify(summary.issueContext.assignmentOptions)}`}
        host={host} context={summary.issueContext} row={row} busy={busy}
        act={work => act(async () => { const result = await work(); await load(result.id); })} />}
      <label>分析猫猫
        <select aria-label="分析猫猫" value={catId} disabled={busy || !summary?.analysisCats?.length}
          onChange={event => { setCatId(event.target.value); requestId.current = undefined; }}>
          <option value="">选择猫猫</option>
          {summary?.analysisCats?.map(cat => <option key={cat.catId} value={cat.catId}>{cat.displayName || cat.catId}</option>)}
        </select>
      </label>
      {summary?.analysisRouteError && <p className={styles.notice}>{summary.analysisRouteError}</p>}
      <button type="button" className={styles.primary} disabled={busy || !configured} onClick={() => void act(async () => {
        requestId.current ??= crypto.randomUUID();
        const result = await host.analyze({ repo: profile.repository, number: fact.number, requestId: requestId.current, catId });
        requestId.current = undefined;
        await load(result.id);
      })}>{row?.kind === 'analysis' && row.analysis ? '重新研判' : '请猫分析'}</button>
      {configured && <p className={styles.muted}>{summary?.settings.automaticAssignment
        ? '发送任务：问题分类 + 按限制规则指派人员。研判后仅向关联组织成员自动派工，成员自提的问题优先本人，并公开分数与理由。'
        : '发送任务：问题分类 + 按限制规则推荐人员。自动指派未开启，需由你确认派工。'}</p>}
      {summary && <TeamOrganization group={summary.group} />}
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
