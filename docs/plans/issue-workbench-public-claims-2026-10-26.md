# GitHub 公开认领与宿主收件

来源：`thread_mucwsgsjtlbabfcq#0001792978585205-000120-871a3b48`。
延续原 Task 与 PR #80，不修改正在使用的宿主实例。

Before：认领依赖工作台本地记录/其收件开关，接收方需要工作台才能进入后续流程。
After：成员在 GitHub 或工作台认领、取消认领，其他人直接在 GitHub 看见；接收方的通用 GitHub 接入将事实送到宿主对话，猫通知本人，并由宿主按本人授权接续开发。

## 事实、通知与开发权限

- GitHub Assignees 是当前负责人真相，GitHub assigned/unassigned 时间线保留历史；不使用独占标签、隐藏 JSON 评论或浏览器缓存作为认领前提。
- GitHub 原生添加/移除本人 Assignee 都应生效；取消只移除本人，保留其他负责人和已有成果。
- Issue 工作台负责展示和操作入口。接收走 `official.github-operations` 的通用 GitHub 连接，使用公共 SDK `messaging.send` 进入 Host 普通会话路由；不依赖 Issue 工作台、其 MCP、其收件存储或特殊评论格式。
- 每位成员在自己的宿主配置其 GitHub 身份、关注仓库、通知对话和协调猫。本次只在原独立实验启用，测试接收人为 YukinaXSer。
- 外部负责人变化是事实观察，不等于远端任何人都能授权本机运行代码。宿主先通知 co-creator；本人明确接手或已有适用的自动开工授权后，沿宿主原 Task/开发流程执行。不会伪造用户消息或绕开 Task admission。
- 取消认领会通知宿主停止把它当作当前认领；未开工不再启动，已开工由原宿主责任人处理暂停/交接，保留成果。

Architecture cell：GitHub Work Item Signals。
Map delta：在既有 GitHub 采集归属内增加本人认领观察；不增 Host 私有接口或第二套执行任务权威。
Why：GitHub 是跨成员公共事实，Host 负责对话、目标、授权与开发执行。

## 实施与验证

1. `packages/github-operations/src/assignment-provider.ts`：使用现行 gh 传输、完整分页、当前账号与 assigned/unassigned 事件 ID；失败不能解释为空认领。
2. `assignment-inbox.ts`：显式启用后的首次补收、持久去重、撤销/关闭/重认领、失败恢复、配置/身份变化与 stop；只投递受限元数据和标准 Issue URL。
3. 通过现行 manifest Settings/定时调度/重试动作和插件生命周期接入；沿用宿主公开 messaging 能力。
4. 真实隔离宿主安装打包制品，禁用 Issue 工作台后，在本人 fork 测试 Issue #1 上认领→收到 Host 消息→取消→收到撤销；重启、重放不重复，外部操作不触达其他成员或业务 Issue。
5. 接收、通知、授权开工、实际开发分别留证，不能用消息 ID 冒充开发已启动。成员 Mac/Windows 分工仍是同一 Task 的另一个未完成结果。

验收重点：接收方无 Issue 工作台仍收到；GitHub 上其他成员能看到同一负责人；撤销不被旧 pending 消息重新启动；离线新认领首次补收；同账号重新认领以新 GitHub 事件区分；源读取失败不发送假撤销；来源正文不得携带 Host 路由或执行权限。

## 手工验收入口（独立实验）

1. 打开 [实验宿主](http://localhost:5142/) 和 [认领收件对话](http://localhost:5142/thread/thread_mvkpxzwvqanuqkru)。原工作实例不重启、不改配置。
2. 在实验 Settings → Plugins → GitHub Operations 查看：接收我的 GitHub 认领开启，仓库 `YukinaXSer/clowder-ai`，通知对话 `thread_mvkpxzwvqanuqkru`，协调猫 `issue-lab-analyst`。在测试接收时停用 Issue 工作台，以验证它不是前提。
3. 用本人账号打开 [测试 Issue #1](https://github.com/YukinaXSer/clowder-ai/issues/1)，在 Assignees 中选择本人 YukinaXSer。GitHub 页面与 assigned 时间线应公开显示本人。
4. 等待一分钟左右，或在 GitHub Operations 中点击「重试认领同步」。宿主对话应收到仓库、编号、本人账号及来源链接；协调猫向本人转达。重复点击不重复投递同一次认领。
5. 在 GitHub Assignees 中移除本人。公开当前负责人应为空，时间线保留撤销历史；宿主收到取消通知，不按旧认领启动新的开发。
6. 再次添加本人应形成一条新的认领通知；停启 GitHub Operations 后重试，同一次认领不重复。
7. 最后移除本人，保留测试 Issue 为 Open、无负责人，供下一次手工验证。恢复 Issue 工作台以继续查看问题，但它的旧收件开关关闭，避免两个接收器重复通知。

本测试 Issue 的正文明确只允许通知验收，不要求实际修代码。实际开发的入口是宿主普通对话，由本人明确接手或适用的已有授权驱动；本轮不把收到通知或猫被唤醒当作「已完成开发」。成员角色/系统权重仍在原 Task 内续做，当前未配置成已生效规则。

## 本轮自检记录

- 真实宿主发现并修复了 Settings operation 缺少 `render`，补了失败回归。
- 真实宿主拒绝 `threads.get` 的 `thread.readContent` 权限；改用已有 `threads.getCats` 元数据能力校验目的对话和可路由猫，不扩大宿主权限，补了默认无内容读取权的回归。
- GitHub 包 610 项测试、typecheck/build 通过；制品已安装到 3142/5142 独立宿主。当前制品以同目录 `artifacts/public-claims-2026-10-26/github-pack-v4.json` 和 candidate catalog 摘要为准。
- 认领消息：`0001792980286142-000000-8718addf`；原生 GitHub assignment event：`34217307307`。实验猫已启动，后续以真实回复和撤销/停启证据补录。
- GitHub 全仓门禁、最终提交/远端 HEAD、独立 review 仍待核验；未合入、未发布 npm。

Architecture ownership：既有 GitHub Signals cell 内扩展采集和事实通知；普通 Host 消息负责持久投递与唤醒。Host 源码、权限策略和 Task admission 无新增修改。插件仓不具备家内 `check:architecture-ownership` / tips seed 检查入口；操作指引随双语 README 和本验收文档交付。
