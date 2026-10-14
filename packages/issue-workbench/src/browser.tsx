import { createRoot } from 'react-dom/client';
import { WorkbenchProvider } from './ports/context';
import type { WorkbenchHost } from './ports/host';
import { IssueWorkbenchPreview } from './ui/IssueWorkbenchPreview';
import './theme.css';
export type { WorkbenchHost, ConfirmOptions } from './ports/host';
/** Mount one isolated pre-SDK workbench; the caller owns the supplied Host ports. */
export function mountWorkbench(element: HTMLElement, host: WorkbenchHost): { unmount: () => void } {
  const root = createRoot(element);
  root.render(<WorkbenchProvider host={host}><IssueWorkbenchPreview /></WorkbenchProvider>);
  return { unmount: () => root.unmount() };
}
