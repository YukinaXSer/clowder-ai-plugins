import type { CoordinationHost } from '../model/issue-coordination.js';
import type { TeamHost } from '../ports/team.js';
import { CoordinationWorkbench } from '../ui/CoordinationWorkbench';
import { TeamDrawer } from './TeamDrawer';
import { TeamIssuePanel } from './TeamIssuePanel';

export function TeamWorkbench({ host, team, showClassifications }: {
  host: CoordinationHost; team: TeamHost; showClassifications?: boolean;
}) {
  return <CoordinationWorkbench host={host} showClassifications={showClassifications}
    tools={<TeamDrawer host={team} />}
    issueTools={(profile, fact) => <TeamIssuePanel key={`${profile.id}:${fact.id}`} host={team} profile={profile} fact={fact} />} />;
}
