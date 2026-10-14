import { useState } from 'react';
import type { CoordinationHost, CoordinationSource, SourcePreference } from '../model/issue-coordination.js';
import styles from './coordination.module.css';

export function CoordinationSources({
  sources,
  host,
  reload,
}: {
  sources: CoordinationSource[];
  host: CoordinationHost;
  reload: () => Promise<void>;
}) {
  return (
    <details className={styles.configuration}>
      <summary>管理来源与代码基线</summary>
      <p>选择宿主已授权的仓库，分别填写目标分支及基线。添加新站点需先由宿主配置连接；这里不保存令牌。</p>
      {sources.map((source) => (
        <SourceForm
          key={source.profile.id + ':' + source.preference.revision}
          source={source}
          host={host}
          reload={reload}
        />
      ))}
    </details>
  );
}
function SourceForm({
  source,
  host,
  reload,
}: {
  source: CoordinationSource;
  host: CoordinationHost;
  reload: () => Promise<void>;
}) {
  const [value, setValue] = useState<SourcePreference>(source.preference.value);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      className={styles.sourceForm}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await host.savePreference(source.profile.id, value, source.preference.revision);
          await reload();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => setValue({ ...value, enabled: e.target.checked })}
        />{' '}
        {source.profile.repository}
        {source.profile.synthetic ? ' · 合成测试源' : ''}
      </label>
      <span className={styles.muted}>{source.profile.instance}</span>
      <div className={styles.fields}>
        {(['name', 'branch', 'base'] as const).map((key, n) => (
          <label key={key}>
            {['显示名称', '默认分支', '默认代码基线'][n]}
            <input value={value[key]} onChange={(e) => setValue({ ...value, [key]: e.target.value })} />
          </label>
        ))}
      </div>
      <button disabled={busy}>{busy ? '保存中…' : '保存来源配置'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
