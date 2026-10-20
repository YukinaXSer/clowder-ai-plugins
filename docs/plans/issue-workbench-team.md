# Issue 工作台：对话研判与团队派工

授权：`thread_mucwsgsjtlbabfcq#0001792487469228-000178-8c6b1ebb`。
需求：同线程 `0001792486825380-000173-1db6a6b7`。
沿用 PR #80，不合入；成员账号与分工待用户提供，开发与隔离验证继续。

Before：人复制问题给猫分析，抄结论，逐个找负责人，催对方启动后接收，手工统计。
After：猫在对话中读取同一问题、提交有依据的研判；按已配置分工自动指派；
接收者启动后补收，回报可追溯，工作台按分类/成员/优先级查看同一份结果。

## 权威与边界

- GitHub：问题、状态、标签、真实账号与 assignees；共享派工/回执使用有作者身份的 Issue 评论。
- 插件：结构化研判、版本绑定、路由规则、发送意图、投递回执、反馈统计。
- Host：当前调用身份、线程可见性、可路由猫、消息投递、用户授权、实例存储。
- 用户：成员账号/分工、允许自动写入的仓库、本人团队收件线程与协调猫。
- 自动指派不等于自动修代码；接收后是否开工由接收方自己的授权决定。
- 模型输出是候选，有原文证据及提交猫/调用来源。人工反馈统计不冒充模型训练。
- 未配置身份/分工时显示可操作的缺项，不猜账号、猫或目标线程。
- 已绑定 Feature 继续“随 Feature 处理”；分工优先使用 Feature，其他问题才按模块路由。
- 原只读工作台、用户本地记录与 Core export 不迁移/删除。新团队扩展由插件原生维护。

Architecture cell：插件业务与公开 Host adapter。
Map delta：增加插件原生 team runtime，复用 FeatureContext；不增加 Host 私有接口。
Why：各成员拥有独立 Host，跨成员真相不能只存在分配者浏览器里。

## 已核实的接口与差距

现行公开 SDK `0.2.0-beta.21`：
`config/storage/threads/messaging/tasks`，工具调用的独立 `PluginActionContext`。
旧 `ownerThreads/participantRoster` 已退役，不复活。
旧 Core 工位依赖 SDK `0.1.0-beta.17`；远端 main 已更新到 `0.2.0-beta.21`，
必须基于最新真实 Host 验证，不能据旧工位判断当前宿主不支持，也不能据合成测试宣称已安装。
候选模块、打包闭包、隔离 Host 验收与实际 Host 安装分别记录。

现有 `github-operations` 首次注册只建基线。团队接收需要首次也完整补收
当前账号被分配的 Open Issues，不借用其“没有新事件”等于“没有待办”的语义。
GitHub 访问走固定 `gh api --hostname github.com`，不接受任意 URL、shell 或凭据参数。

## 状态契约

1. 分析请求绑定 repo/issue、正文摘要、source version、明确线程与猫。
   写入 pending 后发送；Host 幂等键固定。不可路由保留 pending，绝不换猫。
2. 猫提交分析必须来自 Host 当前调用，匹配请求线程/猫；核对源版本，
   保存依据、分数及原因、类别、建议。陈旧结果保留可查但不得自动派工。
3. 路由从安装配置取得，不接受 Issue 正文或模型输出指定负责人/收件线程。
   匹配唯一启用规则才自动派工；多规则冲突、已有其他负责人、Closed 都明确待判断。
4. 远端写之前存发送意图；写后读回。写入失败、响应丢失可恢复；
   只追加指定 assignee，不删除原有成员。已有其他负责人不能被自动覆盖。
5. 共享事件标记带稳定 dispatch ID，只有符合当前仓库权限的作者事件可作优先级依据。
   接收端只接受自己当前获分配的问题。评论发送重试先查已有标记，
   发送结果未知时不得盲目重复 POST。
6. 启动/定时完整核对获准仓库和当前 GitHub 账号；分页失败不能提交空快照。
   撤销/关闭后不发旧待办；再次分配有新版本。去重状态持久且没有 TTL。
7. 收件线程/猫只由接收者安装配置指定。Host 返回消息 ID 仅表示已投递；
   接手必须由该线程的有效猫调用确认，不能推断已读/执行。
8. 反馈明确采纳/修改/拒绝与理由，关联原分析 ID；统计区分样本数、
   反馈数、各分数/类别、采纳率，不制造置信度或“训练完成”。
9. 停用/销毁中断外部 I/O，等待当前操作收束；配置改变后旧目标保持记录，
   不将旧意图悄悄发送到新线程。错误可重试，保存的工作不清除。

## 实施与验收

- **团队业务与 GitHub provider**：公共 SDK 存储 CAS；固定 gh provider；
  分析版本、自动路由、共享派工记录、离线补收、身份与幂等行为测试。
- **可调用模块**：candidate manifest 的 tools/schedule/Settings，
  原生工具支持读取问题、请求/提交分析、执行路由、收件及反馈统计；
  所有写操作使用 Host 独立身份，不从输入采信 userId/catId。
- **工作台联动**：沿用三栏，增加当前问题研判/优先级/负责人的展示和联动入口，
  不能只在隐藏 JSON 看结果。新 UI 先给可判断设计，再做实际页面验收。
- **打包与安装**：从 packed artifact 的空白 consumer 启动模块；
  用隔离数据与 Host adapter 验证重启/失败/权限/重复请求。
真正两账号两团队旅程仍须已配置成员与接收端，不能拿 fixture 代替。
- **验证命令**：仓库实际入口 `pnpm --filter @clowder-ai/issue-workbench lint`、
  `test`、`build`、`test:browser`、`test:artifact`，提交前 `pnpm gate:ci`。
  当前已导出的 Core 镜像切片保留；后续开发仅更新插件 PR #80，不再通过修改
  Core 扩大本任务范围。现有公开接口不能满足的缺口须先报告证据与替代方案。

验收必须覆盖：9 分阻塞问题 → 按配置分配给离线成员 → 启动补收 →
本地猫接手 → 回执/修复材料 → 统计反馈。对真实安装、真实派工、模型调用、
离线恢复分别给证据，未完成项保留在同一 Task。

## 2026-10-20 接入核验

本地 Core main `466d4549fe2d75c9cc5c96b9497f47e464d13cf2`：
`packages/api/src/domains/plugin/manager/builtin-contribution-supervisor.ts`
的 `requestedContributions()` 仅接受 MCP stdio；其他贡献抛出
`UNSUPPORTED_CONTRIBUTION`。该 checkout 没有公开 SDK 的 module Host adapter。
这是旧工位事实，**不再作为当前接入阻塞依据**。随后通过 `gh api` 与 `git fetch`
核实远端 main `c086765ddb7181722f03f9f53c7a7ee17a29f147` 已合入 F202 C1：
`builtin-runtime/carriers/module-plugin-runtime.ts` 实现公开模块加载，
`official-plugin-host-policies.ts` 提供安装授权。当前精确缺口是
`dev.clowder.issue-workbench` 原先无 Host policy；未知插件的有效 grants 为空。
接入应复用现有载体与授权流程，不另造一套 Host。

以下为已撤回方案的历史记录，不能作为当前接入能力或待合入依赖：
曾在原 Core 工位整理独立配套分支 `feat/issue-workbench-host-grants`，
`9819504e04897144b5464d202dd574bb826f6750`：专属策略与回归已通过；
真实 Host 的隔离制品准入、加载、GitHub READ、停用与重新启用通过。
原源导出分支保留，插件镜像钉在 `b6c608a672ae06d477490efe2d77718d60947c72`。
用户实例仍未安装；完整对话/派工/界面旅程继续在同一任务中完成。

2026-10-20 15:18 UTC，用户明确要求回撤宿主扩改
（`thread_mucwsgsjtlbabfcq#0001792509520767-000070-c6435188`）。
PR #1639 的授权策略、测试及验收脚本已用撤销提交 `459935be8` 回撤，
完整分支文件树恢复为扩改前基线 `c086765ddb7181722f03f9f53c7a7ee17a29f147`，
PR 已关闭且从未合入。本地原源分支的同一改动也已由 `30a4a5efa` 撤销。
后续只开发插件 PR #80，不能把恢复这项 Host 白名单作为默认前置条件。
原有隔离载体验证依赖已撤回策略，不证明现行宿主可以安装或授权本插件。

已写入 `integration.json` 的剩余项包括 installed-host-admission、
installed-host-workbench-surface、real-cat-dispatch-and-acceptance、two-account-dogfood。
`hostInstallable` 保持 false，未新增目录/安装宣告，未改变生产 Host。
搜索未找到可核验的 F202 owner thread；不猜测跨线程收件人或发礼貌 ACK。

## 2026-10-20 工作台与恢复增量

插件原生 team-ui 已通过可选 slots 接入现有三栏：请猫分析、结果/优先级/当前负责人、
明确人工反馈、我的收件/研判记录/统计。Core 映射切片为
`031244712b8b62d1dc017ed379efd09b15dd4fc6`；仅泛化 slots 与移动端弹层定位回流 Core。
Owner 操作使用 Host 独立 authority，不伪造聊天消息或调用猫。收件和分析详情均有
不确定发布的查重重试与明确确认入口；确认绑定存储 revision，不再次改变负责人。
关闭/撤回通知失败可重试，同一分配关闭后重开也会再次提醒，历史记录仍保留。

打包页面与实际 Host owner-operation carrier 已分别验实。尚未安装用户实例，
现有独立 READ 预览没有生产 owner route，显示未接入；真实 Host 的工作台入口、
在线猫及双账号验收仍是同一 Task 的未完成结果，不以 fixture 冒充。
