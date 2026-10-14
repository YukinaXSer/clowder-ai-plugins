import { useEffect, useRef, useState } from 'react';
import type { CoordinationDetail, CoordinationHost, IssueRef } from '../model/issue-coordination.js';
import styles from './coordination.module.css';

/** Parent keys this view by full issue identity. Late pages cannot enter another reading. */
export function CoordinationReading({ host, issue }: { host: CoordinationHost; issue: IssueRef }) {
  const [detail, setDetail] = useState<CoordinationDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0),
    flight = useRef(false);
  async function read(more = false) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    const id = ++generation.current;
    try {
      const next = await host.detail(
        issue,
        more ? (detail?.nextOffset ?? 0) : 0,
        more ? detail?.fact?.contentVersion : undefined,
      );
      if (generation.current !== id) return;
      if (more && (!next.fact || next.fact.contentVersion !== detail?.fact?.contentVersion)) {
        setDetail((old) => (old ? { ...old, error: '讨论版本不一致，请重新读取正文。' } : old));
        return;
      }
      setDetail(
        more
          ? {
              ...next,
              fact: { ...next.fact!, comments: [...(detail?.fact?.comments ?? []), ...(next.fact?.comments ?? [])] },
            }
          : next,
      );
    } catch (error) {
      if (generation.current === id)
        setDetail((old) =>
          [401, 403].includes((error as { status?: number }).status ?? 0)
            ? { fact: null, error: '来源未授权，正文已隐藏。' }
            : { ...(old ?? { fact: null }), error: '读取失败，已读取内容仍保留。' },
        );
    } finally {
      if (generation.current === id) {
        setBusy(false);
        flight.current = false;
      }
    }
  }
  useEffect(() => {
    void read();
    return () => {
      generation.current++;
      flight.current = false;
    };
  }, [host, issue.sourceId, issue.issueId]);
  return (
    <>
      <button onClick={() => void read()} disabled={busy}>
        {busy ? '正在读取正文…' : '重新读取正文'}
      </button>
      <details className={styles.discussion} open>
        <summary>来源正文与讨论</summary>
        {!detail ? (
          <p>正在按需读取…</p>
        ) : (
          <>
            {detail.error && <p role="status">{detail.error}</p>}
            <div className={styles.prose}>{detail.fact?.body ?? '暂无正文'}</div>
            {detail.fact?.comments?.map((c) => (
              <article key={c.id}>
                <p className={styles.muted}>
                  {c.author} · {c.createdAt}
                </p>
                <div className={styles.prose}>{c.body}</div>
              </article>
            ))}
          </>
        )}
      </details>
      {detail?.nextOffset != null && (
        <button disabled={busy} onClick={() => void read(true)}>
          加载更多评论
        </button>
      )}
    </>
  );
}
