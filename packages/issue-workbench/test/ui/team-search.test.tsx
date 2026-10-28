import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { TeamDrawer } from '../../src/team-ui/TeamDrawer';

it('submits a keyword across all record pages, resets pagination and clears the filter', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = vi.fn(); HTMLDialogElement.prototype.close = vi.fn();
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  const host: any = { summary: vi.fn(async (args: any) => ({ settings: {}, rows: [], total: args.query ? 0 : 40, nextOffset: args.query || args.offset ? null : 30 })) };
  const button = (text: string) => [...node.querySelectorAll('button')].find(x => x.textContent === text)!;
  try {
    await act(async () => root.render(<TeamDrawer host={host} />));
    await act(async () => button('团队记录').click());
    await act(async () => button('派工记录').click());
    await act(async () => button('下一页').click());
    expect(host.summary).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'assignment', offset: 30 }));
    const input = node.querySelector<HTMLInputElement>('[aria-label="搜索团队记录"]'); expect(input).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '#50');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const calls = host.summary.mock.calls.length;
    await act(async () => node.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(host.summary).toHaveBeenCalledTimes(calls + 1);
    expect(host.summary).toHaveBeenLastCalledWith({ kind: 'assignment', query: '#50', offset: 0 });
    expect(node.textContent).toContain('没有匹配的记录');
    await act(async () => button('清空搜索').click());
    expect(host.summary).toHaveBeenLastCalledWith({ kind: 'assignment', query: '', offset: 0 });
    expect(node.textContent).toContain('40 条记录');
  } finally { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); }
});
