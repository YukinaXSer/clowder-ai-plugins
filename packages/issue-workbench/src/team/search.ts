/** A plain keyword, or an exact issue number (with optional #). */
export function matchesIssueKeyword(query: string, issue: { repo: string; number: number; title: string }, ...fields: Array<string | undefined>) {
  const keyword = query.normalize('NFKC').trim().toLowerCase();
  if (/^#?\d+$/.test(keyword)) return issue.number === Number(keyword.replace(/^#/, ''));
  return [issue.repo, `#${issue.number}`, issue.title, ...fields].join('\n').normalize('NFKC').toLowerCase().includes(keyword);
}
