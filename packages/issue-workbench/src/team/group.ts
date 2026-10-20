import { z } from 'zod';
import { features, hash, login, rulesSchema } from './schema.js';
import type { TeamAnalysis, TeamContext, TeamIssue } from './types.js';

export interface AssignmentOptions {
  groupName: string;
  members: string[];
  preferredLogin?: string;
  basis?: 'reporter' | 'feature' | 'category';
  acceptanceSuggestedFor?: string;
  error?: string;
}

/** Explicit owner-maintained roster. Routing rules and repository access do not
 * create membership; no GitHub Team synchronization is implied by this source. */
export async function readGroup(context: TeamContext) {
  const name = await context.config.get('teamGroupName');
  const raw = await context.config.get('teamMembers');
  if (typeof name !== 'string' || !name.trim() || typeof raw !== 'string' || !raw.trim()) {
    throw new Error('请在插件设置中配置 group 名称和成员 GitHub 用户名；未配置成员组时不派工');
  }
  const groupName = z.string().trim().min(1).max(80).parse(name);
  const members = [...new Set(z.array(login).min(1).max(100).parse(raw.split(/[\s,，]+/).filter(Boolean)))].sort();
  return { groupName, members };
}

export async function requireMember(context: TeamContext, target: string) {
  const group = await readGroup(context);
  if (!group.members.includes(login.parse(target))) throw new Error('目标用户已不在当前 group 成员名单中');
  return group;
}

export async function assignmentPlan(context: TeamContext, issue: TeamIssue, analysis?: TeamAnalysis) {
  const group = await readGroup(context);
  const rawRules = await context.config.get('routingRules');
  const reporter = issue.author && group.members.includes(issue.author) ? issue.author : undefined;
  const options: AssignmentOptions = { ...group, acceptanceSuggestedFor: reporter };
  if (reporter) {
    options.preferredLogin = reporter;
    options.basis = 'reporter';
  } else if (analysis) {
    let rules: z.infer<typeof rulesSchema>;
    try { rules = rulesSchema.parse(JSON.parse(typeof rawRules === 'string' ? rawRules : '[]')); }
    catch {
      options.error = '自动派工规则格式不正确；请修正规则，或明确选择当前 group 成员';
      return { options, policyHash: hash([group, rawRules ?? null, reporter ?? null]) };
    }
    const bound = features(issue);
    const matches = [...new Set(rules.filter(rule => group.members.includes(rule.login) && (bound.length
      ? rule.features.some(feature => bound.includes(feature))
      : rule.categories.includes(analysis.category))).map(rule => rule.login))];
    if (matches.length === 1) {
      options.preferredLogin = matches[0];
      options.basis = bound.length ? 'feature' : 'category';
    } else {
      options.error = '请为当前分类或 Feature 配置一位明确匹配的 group 成员，或手动选择组员';
    }
  }
  return { options, policyHash: hash([group, rawRules ?? null, reporter ?? null]) };
}
