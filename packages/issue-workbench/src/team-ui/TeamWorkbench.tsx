import { useCallback, useMemo, useState } from 'react';
import type { CoordinationHost, CoordinationSnapshot } from '../model/issue-coordination.js';
import type { TeamHost, TeamSummary } from '../ports/team.js';
import type { TeamClassification } from '../team/records.js';
import { CoordinationWorkbench } from '../ui/CoordinationWorkbench';
import { TeamDrawer } from './TeamDrawer';
import { TeamIssuePanel } from './TeamIssuePanel';
import { withTeamClassifications } from './classification-overlay';

export function TeamWorkbench({ host, team, showClassifications }: {
  host: CoordinationHost; team: TeamHost; showClassifications?: boolean;
}) {
  const [classifications, setClassifications] = useState<TeamClassification[]>([]);
  const integratedHost = useMemo<CoordinationHost>(() => ({ ...host, load: async refresh => {
    const snapshot = await host.load(refresh);
    try { setClassifications((await team.summary()).classifications ?? []); }
    catch { setClassifications([]); } // READ work remains available when the team module is disconnected.
    return snapshot;
  } }), [host, team]);
  const onRead = useCallback((summary?: TeamSummary) => {
    if (!summary?.issueContext) { setClassifications([]); return; }
    const issue = summary.issueContext.currentIssue;
    setClassifications(previous => [...previous.filter(value => value.issue.repo !== issue.repo || value.issue.number !== issue.number),
      ...(summary.classifications ?? [])]);
  }, []);
  const projectSnapshot = useCallback((snapshot: CoordinationSnapshot) => withTeamClassifications(snapshot, classifications), [classifications]);
  return <CoordinationWorkbench host={integratedHost} showClassifications={showClassifications} projectSnapshot={projectSnapshot}
    tools={<TeamDrawer host={team} />}
    issueTools={(profile, fact, category) => <TeamIssuePanel key={`${profile.id}:${fact.id}`} host={team} profile={profile} fact={fact} category={category} onRead={onRead} />} />;
}
