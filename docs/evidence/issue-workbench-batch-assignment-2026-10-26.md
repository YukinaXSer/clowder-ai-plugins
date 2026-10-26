# 一次性 Open 批量派工验收

用户原文：`thread_mucwsgsjtlbabfcq#0001793029470179-000018-8a39ac4a`。接续 PR80 `65b131b`，本轮新增统一看板，不将旧 reviewer approved 当成新增代码结论。

## 真实旅程

顶部“批量派工”读取所有已启用仓库的 Open 快照；缺分类可请已配置猫逐条补齐，仍不派工。看板展示每条分类/系统/职责/分数/推荐及成员分布，允许改人和跳过。既有负责人保留。核对后明确确认才持久执行，刷新/重启恢复；已完成项不重复发。批次提交人标识 system，真实 GitHub 身份与 owner 审计保留，派工说明/记录/收件不再附加提交者验收建议。

既有七人 OS 硬筛选与职责、同系统提交者、Feature/类别、普通池权重优先级保留；批内虚拟配额只影响预览，写入回读成功才提交实际配额。编辑/确认绑定 revision，整体权限/成员/来源/策略预检后，每条写入仍通过原安全边界。已进入批次的问题不被后台自动派工抢发；停止/跳过仍保留这项主人选择，可再准备新批或单条确认。没有向真实成员执行批量测试。

## 验证与留存

插件工位 `packages/issue-workbench/artifacts/batch-assignment-2026-10-26/`：

- `red.log`：新增批次 owner action 尚不存在时，5 组行为用例失败；`ui-red.log`：缺少看板组件时失败。
- `green.log` / `package-test.log`：准备零写入、组织分工/加权、修改与跳过、全量预检、原文/成员变化、权限拒绝、猫分析不自动派工、重复确认、未知发布、停止与后台派工隔离、system 通知、120 条规模下组织读取合并。最终包级团队测试 103 项、UI 31 项，来源/同步/数据测试全部通过。
- `lint.log`：类型与来源边界通过。`browser.log`：打包后的新批次完整交互，以及原单条派工/邀请/收件两条旅程，3 项通过。
- 新旅程用 7 条隔离 fixture 验证可派工、Windows 无成员、手调、跳过、已认领、待分析、跨平台；修改人选并跳过后只有两条实际 fixture 写入。关闭/重启/重开不重复；desktop/mobile 截图为 `board-desktop.png`、`board-mobile.png`、`completed.png`。
- `pack.json` 与 tarball：归档 integrity `sha512-Wl346a9s3b5A3wOVnt5tfGlBYXIFgcgKiT3jIuyYLPDUwn60gUdqkfunsN62TUwDdnRFJGzqcA4e5xovr8rTpQ==`。
- `gate.log`（全仓 gate）与 `host.log`（隔离 Host 组合测试）为执行日志，最终结果在完成后追加，不在运行中预记通过。

独立实验宿主 `/Users/yuki/Documents/AINest/cat-cafe-issue-workbench-lab/.cat-cafe/lab-evidence/batch-assignment-2026-10-26/`：

- `installation.json`：同一插件实例更新为上述 integrity、lifecycleRevision 39、running，未修改已有配置。
- `browser.json` 与 `installed-board.png` / `installed-board-mobile.png`：本人实际打开已安装 Host 入口 → 批量派工 → 准备完整已启用来源快照（当前本人 fork 1 条）→ 刷新重开保持同一批次；窄屏无横向溢出，pageerror 为 0。
- 真实页面仅调用 coordination/summary/getAssignmentBatch/planAssignments，无 confirm/retry 或 GitHub 写入。`github-before.json` / `github-final.json` 独立回读现有 Issue 状态和负责人，保留用户真实操作。
- 入口 `http://localhost:3142/api/plugins/dev.clowder.issue-workbench/workbench/installed.html`，完整 Hub `http://localhost:5142/`，独立 Redis 6358。托管 launchd 租期截至 2026-10-27 08:10:53 Asia/Shanghai；未改动原宿主。

证据边界：大批量执行和异常路径在真实打包 UI + 隔离 provider/持久测试存储完成；真实 GitHub/Host 验证只准备/恢复当前已启用来源看板，未向组织成员发起正式批量指派。真实评论作者继续使用登录账号；system 是业务发起标识。

Architecture cell：Issue Workbench team；新增持久批次协调对象，复用 DispatchRecord/分类/Host 调度。共享重复成员选项避免 Host 单值中重复存储名单；无新外部依赖、Host 授权扩张或生产数据修改。
