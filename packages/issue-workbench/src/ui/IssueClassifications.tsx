import {
  type CoordinationSource,
  type IssueClassification,
  issueCategoryCounts,
  issueClassificationFor,
  issueFeatureBindings,
  issueRef,
  issueRefKey,
  matchesIssueCategory,
} from '../model/issue-coordination.js';
import { useEffect, useId, useRef, useState } from 'react';
import styles from './classifications.module.css';
import { IssueSourceState, matchesSourceState } from './IssueSourceState';

const facets = { area: '模块', kind: '类型', symptom: '表现', environment: '环境' } as const;
const facetKeys = Object.keys(facets) as (keyof typeof facets)[];
const tagsFor = (result: IssueClassification) =>
  facetKeys.flatMap((facet) => result.labels[facet].map((label) => `${facets[facet]}：${label}`));

function ClassificationFacets({ result }: { result: IssueClassification }) {
  return (
    <dl className={styles.facets}>
      {facetKeys.map((facet) => (
        <div key={facet}>
          <dt>{facets[facet]}</dt>
          <dd>{result.labels[facet].join('、') || '未提取'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function IssueClassificationCandidate({
  result,
  sourceUpdatedAt,
  tags,
  changeTags,
  featureBindings = [],
}: {
  result?: IssueClassification;
  sourceUpdatedAt: string;
  tags: string;
  changeTags: (value: string) => void;
  featureBindings?: string[];
}) {
  if (featureBindings.length)
    return <p className={styles.explanation}>已按 {featureBindings.join('、')} 归类，随 Feature 处理。</p>;
  if (!result) return <p className={styles.meta}>这条问题尚无本批分类结果。</p>;
  const existing = new Set(tags.split(/[,，;；\n]/).map((tag) => tag.trim()));
  const missing = tagsFor(result).filter((tag) => !existing.has(tag));
  return (
    <section className={styles.candidate} aria-label="模型候选分类">
      <h4>模型候选分类</h4>
      <p className={styles.meta}>
        初始候选 · {result.model} · {result.generatedAt.slice(0, 10)}
      </p>
      {sourceUpdatedAt !== result.source.updatedAt && <p className={styles.stale}>来源已更新，候选需要重新核对。</p>}
      <ClassificationFacets result={result} />
      <p className={styles.evidence}>依据：{result.evidence}</p>
      <button
        type="button"
        disabled={!missing.length}
        onClick={() => changeTags([tags.trim(), ...missing].filter(Boolean).join('；'))}
      >
        {missing.length ? '加入本地标记草稿' : '已在本地标记中'}
      </button>
      <p className={styles.meta}>可修改后保存本仓记录；来源标签保持独立。</p>
    </section>
  );
}

export function IssueClassificationResults({
  sources,
  select,
  initialOpen = false,
}: {
  sources: CoordinationSource[];
  select: (key: string) => void;
  initialOpen?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [category, setCategory] = useState('all'),
    [query, setQuery] = useState(''),
    [state, setState] = useState('all');
  const [limit, setLimit] = useState(40);
  const rows = sources.flatMap((source) =>
    source.issues
      .filter((fact) => !fact.unavailable)
      .map((fact) => ({
        source,
        fact,
        result: issueClassificationFor(source, fact),
        features: issueFeatureBindings(fact),
      })),
  );
  const hasClassifications = rows.some((row) => row.result || row.features.length);
  const scoped = rows.filter(
    ({ fact, source }) =>
      matchesSourceState(fact, state) &&
      `${fact.title} #${fact.number} ${source.preference.value.name}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  const groups = issueCategoryCounts(scoped);
  const features = [...new Set(scoped.flatMap((row) => row.features))].sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1)),
  );
  const visible = scoped.filter((row) => matchesIssueCategory(row, category));
  function choose(value: string) {
    setCategory(value);
    setLimit(40);
  }
  useEffect(() => {
    if (initialOpen) dialog.current?.showModal();
    return () => dialog.current?.close();
  }, [initialOpen]);
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()}>
        分类结果
      </button>
      <dialog ref={dialog} className={styles.overview} aria-labelledby={heading} data-testid="classification-results">
        <header className={styles.heading}>
          <div>
            <h2 id={heading}>分类结果</h2>
            <p className={styles.meta}>按问题类别或已绑定的 Feature 查看。</p>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="关闭分类结果">
            关闭
          </button>
        </header>
        <div className={styles.controls}>
          <p className={styles.meta}>
            按问题标题进行首次语义归类，疑难项参考正文；候选未经准确率验证，可在研判中修正。已有 Feature 绑定优先。
          </p>
          <div className={styles.search}>
            <input
              aria-label="搜索分类结果"
              placeholder="搜索标题或编号"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(40);
              }}
            />
            <select
              aria-label="分类结果来源状态"
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setLimit(40);
              }}
            >
              <option value="all">全部状态</option>
              <option value="OPEN">Open · 开放</option>
              <option value="CLOSED">Closed · 已关闭</option>
              {rows.some((row) => matchesSourceState(row.fact, 'OTHER')) && <option value="OTHER">其他状态</option>}
            </select>
          </div>
          <nav className={styles.categories} aria-label="分类分组">
            {[{ key: 'all', label: '全部', count: scoped.length }, ...groups].map((group) => (
              <button
                key={group.key}
                type="button"
                aria-pressed={category === group.key || (group.key === 'feature' && category.startsWith('feature:'))}
                onClick={() => choose(group.key)}
              >
                {group.label} · {group.count}
              </button>
            ))}
          </nav>
          {(category === 'feature' || category.startsWith('feature:')) && (
            <label className={styles.featureFilter}>
              选择 Feature
              <select aria-label="Feature 分组" value={category} onChange={(e) => choose(e.target.value)}>
                <option value="feature">全部已绑定 Feature</option>
                {features.map((feature) => (
                  <option key={feature} value={`feature:${feature}`}>
                    {feature} · {scoped.filter((row) => row.features.includes(feature)).length}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className={styles.meta} role="status">
            当前显示 {Math.min(limit, visible.length)} / {visible.length} 条
          </p>
        </div>
        <div className={styles.resultsBody}>
          {!hasClassifications && <p>当前可读取的来源还没有分类结果。</p>}
          <div className={styles.results}>
            {visible.slice(0, limit).map(({ source, fact, result, features }) => (
              <article key={issueRefKey(issueRef(source.profile.id, fact))} className={styles.result}>
                <p className={styles.meta}>
                  {source.preference.value.name}
                  {source.profile.synthetic ? ' · 合成测试' : ''}
                </p>
                <IssueSourceState fact={fact} />
                <h3>
                  <button
                    type="button"
                    onClick={() => {
                      select(issueRefKey(issueRef(source.profile.id, fact)));
                      dialog.current?.close();
                    }}
                  >
                    #{fact.number} · {fact.title}
                  </button>
                </h3>
                {features.length ? (
                  <p className={styles.featureBadge}>{features.join(' · ')} · 随 Feature 处理</p>
                ) : result ? (
                  <ClassificationFacets result={result} />
                ) : (
                  <p className={styles.meta}>尚未分类</p>
                )}
                {result && (
                  <>
                    <p className={styles.evidence}>
                      依据：<span>{result.evidence}</span>
                    </p>
                    <p className={styles.meta}>
                      {result.model} · {result.generatedAt.slice(0, 10)}
                      {fact.updatedAt !== result.source.updatedAt ? ' · 来源已更新，需复核' : ''}
                    </p>
                  </>
                )}
              </article>
            ))}
          </div>
          {!visible.length && <p>当前类别和筛选条件下没有问题。</p>}
          {visible.length > limit && (
            <button type="button" className={styles.more} onClick={() => setLimit((n) => n + 40)}>
              显示更多问题（剩余 {visible.length - limit}）
            </button>
          )}
        </div>
        <footer className={styles.footer}>点击问题标题进入研判，可将候选加入本地草稿，再由你保存。</footer>
      </dialog>
    </>
  );
}
