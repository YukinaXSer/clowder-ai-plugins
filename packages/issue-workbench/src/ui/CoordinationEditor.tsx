import { safeIssueUrl, type IssueInvestigation } from '../model/issue-coordination.js';
import styles from './coordination.module.css';

export function CoordinationEditor({
  value,
  change,
  save,
  busy,
  dirty,
  error,
}: {
  value: IssueInvestigation;
  change: (value: IssueInvestigation) => void;
  save: () => Promise<void>;
  busy: boolean;
  dirty: boolean;
  error: string;
}) {
  const field = (key: keyof IssueInvestigation, label: string, multiline = false) => (
    <label>
      {label}
      {multiline ? (
        <textarea
          aria-label={label}
          rows={4}
          value={String(value[key])}
          onChange={(e) => change({ ...value, [key]: e.target.value })}
        />
      ) : (
        <input
          aria-label={label}
          value={String(value[key])}
          onChange={(e) => change({ ...value, [key]: e.target.value })}
        />
      )}
    </label>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className={styles.editor}
    >
      <h3>本仓研判与修复记录</h3>
      <p className={styles.muted}>
        记录保存到本地宿主。来源状态保持独立；下列进展由你记录，不代表平台或任务系统已确认。
      </p>
      <div className={styles.fields}>
        <label>
          适用范围
          <select
            aria-label="适用范围"
            value={value.scope}
            onChange={(e) => change({ ...value, scope: e.target.value as IssueInvestigation['scope'] })}
          >
            <option value="unknown">尚待判断</option>
            <option value="common">通用问题</option>
            <option value="internal">内部特有</option>
          </select>
        </label>
        {field('module', '模块')}
        {field('tags', '本地标记')}
      </div>
      {field('notes', '本仓方案', true)}
      {field('evidence', '本仓复现与分析证据', true)}
      <div className={styles.fields}>
        {field('branch', '目标分支')}
        {field('base', '验证代码基线')}
        {field('patch', '修复 PR / 提交')}
      </div>
      {field('taskUrl', '真实任务链接（可选，手动关联）')}
      <div className={styles.actions}>
        {safeIssueUrl(value.patch) && (
          <a href={safeIssueUrl(value.patch)} target="_blank" rel="noreferrer">
            查看修复 PR / 提交 ↗
          </a>
        )}
        {safeIssueUrl(value.taskUrl) && (
          <a href={safeIssueUrl(value.taskUrl)} target="_blank" rel="noreferrer">
            查看关联任务 ↗
          </a>
        )}
      </div>
      <div className={styles.fields}>
        <label>
          补丁纳入
          <select
            aria-label="补丁纳入"
            value={value.adoption}
            onChange={(e) => change({ ...value, adoption: e.target.value as IssueInvestigation['adoption'] })}
          >
            <option value="pending">待处理 / 待移植</option>
            <option value="applied">已纳入（手动记录）</option>
            <option value="not-needed">本仓无需改动</option>
          </select>
        </label>
        <label>
          本仓验证
          <select
            aria-label="本仓验证"
            value={value.verification}
            onChange={(e) => change({ ...value, verification: e.target.value as IssueInvestigation['verification'] })}
          >
            <option value="pending">待验证</option>
            <option value="failed">仍可复现</option>
            <option value="passed">验证通过（手动记录）</option>
          </select>
        </label>
      </div>
      {field('verificationEvidence', '验证证据 / 测试结果', true)}
      <details>
        <summary>标签建议 · 本地草稿，未提交</summary>
        {field('labelDraft', '标签变更建议', true)}
        <p className={styles.muted}>请在原平台核对后提交。保存不会修改来源标签。</p>
      </details>
      <div className={styles.actions}>
        <button disabled={busy || !dirty}>{busy ? '保存中…' : '保存本仓记录'}</button>
        <span role="status">{dirty ? '有未保存修改；切换问题会保留输入' : '已保存 / 尚无修改'}</span>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
