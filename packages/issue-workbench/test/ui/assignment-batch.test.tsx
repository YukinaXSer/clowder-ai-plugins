import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AssignmentBatchBoard } from '../../src/team-ui/AssignmentBatchBoard';

async function mount() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  const item = (number: number, status = 'ready'): any => ({ issue: { id: String(number), repo: 'fixture/repo', number, title: '问题 ' + number, assignees: status === 'retained' ? ['bob'] : [], url: 'https://github.com/fixture/repo/issues/' + number },
    status, included: status !== 'retained', category: 'Agent 运行', score: 7, login: 'alice', options: { members: ['alice', 'bob', 'windows'], eligibleMembers: ['alice', 'bob'], preferredLogin: 'alice', affectedSystems: ['macos'], recommendationReason: 'macOS 普通成员加权分配', excluded: [{ login: 'windows', reason: '系统不兼容' }] } });
  let batch: any = { id: 'batch', revision: 1, status: 'draft', initiator: 'system', createdAt: 1, items: [item(1), item(2, 'needs-analysis'), item(3, 'retained')] };
  const host: any = {
    getAssignmentBatch: vi.fn(async () => structuredClone(batch)), summary: vi.fn(async () => ({ settings: {}, analysisCats: [] })),
    editAssignmentBatch: vi.fn(async (args: any) => { const row = batch.items.find((i: any) => i.issue.id === args.issueId); Object.assign(row, { login: args.login, included: args.included }); batch.revision++; return structuredClone(batch); }),
    confirmAssignmentBatch: vi.fn(async () => { batch.status = 'running'; batch.revision++; return structuredClone(batch); }),
  };
  await act(async () => root.render(<AssignmentBatchBoard host={host} />));
  const button = (label: string) => [...node.querySelectorAll('button')].find(b => b.textContent === label)!;
  return { node, host, button, async close() { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); } };
}
it('restores the complete board, allows compatible adjustments, and never confirms unseen pending items', async () => {
  const v = await mount();
  try {
    expect(v.node.textContent).toContain('system'); expect(v.node.textContent).toContain('已有负责人');
    expect(v.button('核对并派工').disabled).toBe(true);
    const select = v.node.querySelector<HTMLSelectElement>('[aria-label="调整 fixture/repo#1 指派成员"]')!;
    expect(select.querySelector<HTMLOptionElement>('[value="windows"]')!.disabled).toBe(true);
    await act(async () => { select.value = 'bob'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(v.host.editAssignmentBatch).toHaveBeenCalledWith(expect.objectContaining({ login: 'bob', expectedRevision: 1 }));
    const include = v.node.querySelector<HTMLInputElement>('[aria-label="本次参与 fixture/repo#2"]')!;
    await act(async () => include.click());
    expect(v.button('核对并派工').disabled).toBe(false);
    await act(async () => v.button('核对并派工').click());
    expect(v.host.confirmAssignmentBatch).not.toHaveBeenCalled();
    expect(v.node.textContent).toContain('即将设置 1 个 Issue 的 GitHub 负责人');
    await act(async () => v.button('确认批量派工').click());
    expect(v.host.confirmAssignmentBatch).toHaveBeenCalledWith({ id: 'batch', expectedRevision: 3 });
    expect(v.node.textContent).toContain('执行中');
  } finally { await v.close(); }
});
it('refreshing or closing the board does not itself dispatch', async () => {
  const v = await mount();
  try { await act(async () => v.button('刷新进度').click()); expect(v.host.confirmAssignmentBatch).not.toHaveBeenCalled(); }
  finally { await v.close(); }
});
