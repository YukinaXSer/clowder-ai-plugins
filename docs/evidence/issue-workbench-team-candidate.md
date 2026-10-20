# Issue 团队联动候选：2026-10-20

完整用户旅程：**尚未走通**。这是原任务中的候选实现记录，不是 Feature 完成、
安装成功、模型训练或真实双账号派工的声明。

授权源：`thread_mucwsgsjtlbabfcq#0001792487469228-000178-8c6b1ebb`。
需求与实施契约见 `docs/feature-discussions/2026-10-20-issue-team-assignment/README.md`
和 `docs/plans/issue-workbench-team.md`。PR #80 保持不合入。

## 本轮实物

- 插件原生 `src/team/`：公开 SDK 模块接口、固定 GitHub CLI provider、结构化
  对话研判、配置驱动的自动分配、按成员启动补收、回执与反馈统计。
- 研判包含类别、1–10 分或未评分、影响理由、原文证据、运行阻塞和替代路径；
  Feature 标签优先。不同负责人、旧版本原文、多条冲突规则不自动写入。
- Host 提供调用猫/线程/消息来源；工具输入不能指定调用者身份。发送目标来自安装配置，
  不可路由时保留待发送；修改收件目标不会重定向旧消息。
- 接手/处理中/受阻/待验证是成员署名报告，保存 GitHub 分配事件 ID；
  不冒充 Host 执行或本仓已验收。读取同时返回当前 GitHub 状态及历史记录。
- 反馈必须关联研判之后的新 owner 消息。原请求、猫自评、旧 hold 来源不能当作采纳。
  修改保留历史，重试不重复计数；统计不宣称经过训练或测得模型准确率。
- 原三栏 UI 与分类数据未改。Core export 已对齐当前构建边界
  `b6c608a672ae06d477490efe2d77718d60947c72`，只调整协调服务的共享契约导入。
  当前预览尚未绑定新团队工具。

## 已观察的验证

`pnpm --filter @clowder-ai/issue-workbench test:team` 的 16 项行为检查包括：
同一问题的分析/派工/恢复，Feature 优先，原文证据与版本检查，调用猫/线程绑定，
目标不可用，首次补收及重新分配，配置撤回，回执作者和分配事件核对，公开评论的
不确定发送结果，人工反馈来源/历史，以及优先级排序。

模块旅程用**两个隔离 Host store 和受控 provider**：A 研判 9 分 → 指派给离线 B →
B 启动后补收 → B 回报接手 → A 读回 → B 重启无重复通知。它证明模块接线和状态行为，
不替代真实 GitHub 两账号/两团队验收。

真实外部读取：通过生产 `GhTeamProvider.issue()` 与固定 `gh api` 读取
`zts212653/clowder-ai#1628`，返回 Open、Windows 主测试入口依赖 POSIX shell 的问题，
当时 assignee 数为 0。本轮没有对真实 Issue 写入 assignee、评论或标签。

空白 consumer 安装检查曾暴露 SDK 动态 schema loader 未随 bundle 发布。已改为
直接实现公开模块接口，仅将 SDK 用于类型检查；最终 tgz 可独立导入模块、读取未配置状态、
拒绝无 Host 身份的动作并正确停止。失败日志保留在 `artifact.red.log`。

原工作台四项 packed browser/READ Host 旅程通过。新模块没有注入浏览器或生产 Host。
最终仓库门禁 35 步全部通过，使用仓库 `buildGateSteps()` 的同一命令列表；
只有 Feishu 下载步骤启用 Node 环境代理，其余步骤沿用固定制品工具链。
日志目录：`packages/issue-workbench/artifacts/team-2026-10-20/`。
最终门禁与提交坐标记录在该目录的 `acceptance.json`。

## 真实 Host 载体检查

Core 配套分支 `feat/issue-workbench-host-grants`，提交
`9819504e04897144b5464d202dd574bb826f6750`，以远端 main 为基线，只包含
Issue 专属授权策略、2 项授权/安装身份保留回归及制品验收脚本。
[配套草稿 PR #1639](https://github.com/zts212653/clowder-ai/pull/1639) 保持未合入；
原 Core 工位已切回 `feat/issue-workbench`，没有新建或更改生产工位。
授权回归先观察到有效 grants 为空、reconciliation 无变化的失败，再补策略转绿。
Core API build、对应定向测试通过；原开发入口保留测试也通过。

`packages/api/scripts/check-issue-workbench-artifact.mjs <candidate.tgz>` 使用实际
`LocalPluginPackageAdmission`、文件 inventory、已验证包 locator 和 `ModulePluginRuntime`：
候选准备（补 Host manifest）→ 准入 → 从磁盘恢复 inventory → 加载 → 无身份调用拒绝 →
读取真实 `zts212653/clowder-ai#1628` → 未授权仓库拒绝 → 停用后拒绝 →
重新启用后再次读取，已通过。日志保留原 tgz 和 prepared tgz 两份摘要。

检查隔离在临时目录，没有连接生产存储或修改生产配置。Host 调用身份来自明确的验收
fixture，因此这证明真实载体与 provider 接线，**不证明在线猫已调用或用户已安装**。

## 未完成与接入依赖

1. **真实宿主安装与猫调用**：最初读取的本地 Core main `466d4549fe2d75c9cc5c96b9497f47e464d13cf2`
   已过时。后续拉取核实远端 main `c086765ddb7181722f03f9f53c7a7ee17a29f147`
   已支持公开 module Host，并消费同版 SDK。Issue 专属 grants 和隔离准入/启停/READ
   已在上述配套分支实现并验证；用户实例安装与在线猫调用仍未完成。
   运行健康响应没有 deployment revision，未宣称精确部署 HEAD。
2. **工作台入口**：新研判/优先级/成员/统计仍需接入现有三栏与 Host 授权动作。
   当前 UI 不能触发新模块，不能把原界面截图当成本轮联动证据。
3. **真实双账号验收**：成员 GitHub 用户名/分工与接收端配置尚未提供；没有代猜账号、
   代开自动写入或更改运行配置。
4. **完整恢复体验**：不确定的评论 POST 保持待核对，明确确认后的再次发布入口、
   撤销/关闭给已接手成员的变更提醒、权限修复入口仍需完成。
5. **完整 Host 生命周期**：授予/撤销、安装/启停、历史工作迁移和最终独立评审仍未验收。
   `hostInstallable:false` 保持，未进入 catalog 或正式发布。

风险：行为/持久化/权限/外部写入均有增量；本轮外部写入只在隔离测试中执行。
Architecture cell：插件业务与公开 Host adapter；没有复制 Host Task 权威或修改共享契约。
新的团队模块属于插件原生源码，Core export 仍钉在原提交。
