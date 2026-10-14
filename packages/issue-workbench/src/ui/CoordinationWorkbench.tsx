'use client';
import { useEffect, useRef, useState } from 'react';
import {
  issueRef,
  issueRefKey,
  newInvestigation,
  safeIssueUrl,
  type CoordinationHost,
  type CoordinationSnapshot,
  type IssueInvestigation,
  type Versioned,
  type IssueSourceFact,
} from '../model/issue-coordination.js';
import { CoordinationReading } from './CoordinationReading';
import { CoordinationEditor } from './CoordinationEditor';
import { CoordinationSources } from './CoordinationSources';
import { CoordinationLinks, type RelationCandidate } from './CoordinationLinks';
import styles from './coordination.module.css';

const verified = { pending: '待验证', failed: '仍可复现', passed: '已记录验证通过' };
const version = (f: IssueSourceFact) => f.reviewVersion ?? f.contentVersion ?? f.updatedAt;
export function CoordinationWorkbench({ host }: { host: CoordinationHost }) {
  const [snapshot, setSnapshot] = useState<CoordinationSnapshot>({ sources: [], relations: [] });
  const [selected, setSelected] = useState(''),
    [filter, setFilter] = useState('all'),
    [query, setQuery] = useState('');
  const [localOnly, setLocalOnly] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [receipt, setReceipt] = useState(''),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Versioned<IssueInvestigation> & { dirty: boolean }>>({});
  const loadId = useRef(0),
    flight = useRef(false);
  async function load(refresh = false) {
    const id = ++loadId.current;
    setBusy(true);
    setError('');
    try {
      const next = await host.load(refresh);
      if (id !== loadId.current) return;
      setSnapshot(next);
      setReceipt(refresh ? '已分别检查各来源；读取结果见下方时间行。未保存的输入仍保留。' : '');
    } catch (e) {
      if (id === loadId.current) {
        setError((e as Error).message);
        if ([401, 403].includes((e as { status?: number }).status ?? 0)) setSnapshot({ sources: [], relations: [] });
      }
    } finally {
      if (id === loadId.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      loadId.current++;
    };
  }, [host]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (Object.values(drafts).some((d) => d.dirty)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [drafts]);
  const rows = snapshot.sources
    .flatMap((source) => {
      const facts = [...source.issues];
      for (const work of source.work)
        if (!facts.some((f) => f.id === work.value.ref.issueId))
          facts.push({
            id: work.value.ref.issueId,
            number: work.value.ref.number,
            title: work.value.title,
            state: 'UNKNOWN',
            updatedAt: '',
            labels: [],
            url: '',
            unavailable: true,
          });
      return facts.map((fact) => {
        const ref = issueRef(source.profile.id, fact),
          key = issueRefKey(ref);
        const saved = source.work.find((w) => issueRefKey(w.value.ref) === key);
        return { source, fact, ref, key, saved };
      });
    })
    .sort((a, b) => b.fact.updatedAt.localeCompare(a.fact.updatedAt) || a.key.localeCompare(b.key));
  const visible = rows.filter(
    (r) =>
      (filter === 'all' || r.source.profile.id === filter) &&
      (!localOnly || r.saved || drafts[r.key]?.dirty) &&
      `${r.fact.title} #${r.fact.number} ${r.source.profile.name} ${r.saved?.value.module ?? ''} ${r.saved?.value.tags ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const row = rows.find((r) => r.key === selected);
  useEffect(() => {
    if (!selected && rows[0]) setSelected(rows[0].key);
  }, [selected, rows[0]?.key]);
  const current = row
    ? (drafts[row.key] ?? {
        ...(row.saved ?? {
          revision: 0,
          value: newInvestigation(row.ref, row.fact.title, version(row.fact), row.source.preference.value),
        }),
        dirty: false,
      })
    : undefined;
  const candidates: RelationCandidate[] = rows.map((r) => ({
    ref: r.ref,
    title: r.fact.title,
    source: r.source.preference.value.name,
    version: version(r.fact),
    verification: verified[r.saved?.value.verification ?? 'pending'],
    state: r.fact.state === 'CLOSED' ? '来源已关闭' : r.fact.state === 'OPEN' ? '来源开放' : '来源暂不可用',
  }));
  async function save() {
    if (!row || !current || flight.current) return;
    flight.current = true;
    setSaving(true);
    setSaveError('');
    const key = row.key,
      value = current.value;
    try {
      const result = await host.saveWork(value, current.revision);
      setDrafts((old) => ({
        ...old,
        [key]:
          old[key]?.value === value
            ? { ...result, dirty: false }
            : { ...(old[key] ?? { value }), revision: result.revision, dirty: true },
      }));
      await load();
    } catch (e) {
      setSaveError((e as Error).message + '；输入已保留。');
      if ((e as { status?: number }).status === 409) await load();
    } finally {
      flight.current = false;
      setSaving(false);
    }
  }
  return (
    <main className={styles.shell} data-testid="issue-coordination" data-preview-revision="issue-coordination-v1">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>ISSUE WORKBENCH</p>
          <h1>一起研判，分别验证</h1>
          <p className={styles.muted}>将相关问题放在一起，保留每个仓库自己的事实与修复记录。</p>
        </div>
        <button disabled={busy} onClick={() => void load(true)}>
          {busy ? '正在读取…' : '更新来源'}
        </button>
      </header>
      {snapshot.sources.some((s) => s.profile.synthetic) && (
        <p className={styles.notice}>试用环境含明确标记的合成测试源。真实内源平台尚待接入，不会调用其接口。</p>
      )}
      <div className={styles.sources}>
        {snapshot.sources.map((s) => (
          <div key={s.profile.id}>
            <span>
              {s.preference.value.name} ·{' '}
              {s.profile.synthetic ? '合成测试' : s.profile.visibility === 'public' ? '公开' : '内部'}
            </span>
            <span className={styles.muted}>
              {!s.preference.value.enabled
                ? '已暂停读取'
                : s.checkedAt
                  ? `上次完整检查 ${new Date(s.checkedAt).toLocaleString()}`
                  : '尚未完整检查'}
            </span>
            {s.error && <span role="status">{s.error}</span>}
            {s.retryAt && <span>可重试时间 {new Date(s.retryAt).toLocaleString()}</span>}
          </div>
        ))}
      </div>
      <CoordinationSources sources={snapshot.sources} host={host} reload={() => load()} />
      {host.legacyUrl && (
        <p>
          <a href={host.legacyUrl} target="_blank" rel="noreferrer">
            打开原单仓工作台与旧记录
          </a>
          <span className={styles.muted}> · 原有方案和标签批次仍保留在原入口</span>
        </p>
      )}
      <p role="status">{receipt}</p>
      {error && <p role="alert">{error}</p>}
      <div className={styles.layout}>
        <aside className={styles.queue} aria-label="聚合问题队列">
          <div className={styles.filters}>
            <label>
              来源
              <select aria-label="来源" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">全部来源 · {rows.length}</option>
                {snapshot.sources.map((s) => (
                  <option key={s.profile.id} value={s.profile.id}>
                    {s.preference.value.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              搜索
              <input placeholder="标题、编号、模块或标记" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={localOnly} onChange={(e) => setLocalOnly(e.target.checked)} />{' '}
              有本地记录（含来源已关闭）
            </label>
          </div>
          <div className={styles.list}>
            {visible.map((r) => (
              <button
                key={r.key}
                aria-pressed={selected === r.key}
                onClick={() => {
                  setSelected(r.key);
                  setSaveError('');
                }}
              >
                <span className={styles.muted}>
                  {r.source.preference.value.name} · #{r.fact.number}
                  {r.source.profile.synthetic ? ' · 合成' : ''}
                </span>
                <span>{r.fact.title}</span>
                <span className={styles.muted}>
                  {r.fact.unavailable ? '来源暂不可用' : r.fact.state === 'CLOSED' ? '来源已关闭' : '来源开放'} ·{' '}
                  {verified[r.saved?.value.verification ?? 'pending']}
                  {drafts[r.key]?.dirty ? ' · 未保存' : ''}
                </span>
              </button>
            ))}
            {!visible.length && <p>当前筛选没有可读取的问题。</p>}
          </div>
        </aside>
        <section className={styles.detail}>
          {row && current ? (
            <>
              <div className={styles.actions}>
                <span className={styles.muted}>
                  {row.source.preference.value.name} · #{row.fact.number}
                </span>
                {safeIssueUrl(row.fact.url) && (
                  <a href={safeIssueUrl(row.fact.url)} target="_blank" rel="noreferrer">
                    打开原平台 ↗
                  </a>
                )}
              </div>
              <h2>{row.fact.title}</h2>
              {row.fact.unavailable && <p className={styles.notice}>来源暂不可用；这不表示已删除。本地记录仍保留。</p>}
              {current.value.sourceVersion !== version(row.fact) && (
                <p className={styles.notice}>
                  来源发生变化，本仓依据可能需复核。
                  <button
                    onClick={() =>
                      setDrafts((d) => ({
                        ...d,
                        [row.key]: {
                          ...current,
                          value: { ...current.value, sourceVersion: version(row.fact) },
                          dirty: true,
                        },
                      }))
                    }
                  >
                    已核对当前来源
                  </button>
                </p>
              )}
              <CoordinationReading key={row.key} host={host} issue={row.ref} />
              {current.dirty && row.saved && row.saved.revision !== current.revision && (
                <details className={styles.notice} open>
                  <summary>其他页面已保存新版本，请核对差异</summary>
                  <pre className={styles.prose}>{JSON.stringify(row.saved.value, null, 2)}</pre>
                  <button
                    onClick={() =>
                      setDrafts((d) => ({ ...d, [row.key]: { ...current, revision: row.saved!.revision } }))
                    }
                  >
                    已核对，保留我的输入并再次保存
                  </button>
                </details>
              )}
              <CoordinationEditor
                value={current.value}
                change={(value) => setDrafts((d) => ({ ...d, [row.key]: { ...current, value, dirty: true } }))}
                save={save}
                busy={saving}
                dirty={current.dirty}
                error={saveError}
              />
              <CoordinationLinks
                key={row.key}
                current={candidates.find((c) => issueRefKey(c.ref) === row.key)!}
                candidates={candidates}
                relations={snapshot.relations}
                host={host}
                reload={() => load()}
                select={setSelected}
              />
            </>
          ) : (
            <p>请选择一个可读取的问题。</p>
          )}
        </section>
      </div>
    </main>
  );
}
