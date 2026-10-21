# Issue 工作台真实交付路径

续办来源：`thread_mucwsgsjtlbabfcq#0001792571187005-000021-9148af61`。
2026-10-21 核验；插件 PR #80 / `0bad8b9a973b48b628a6367eca5bd247a4413266`。

终点：在工作台选本猫咖成员，启动真实 Issue 自动分类，查看有原文依据的类别和
优先级，再按既定组织规则派工；接收者的猫咖启动后能补收、接手、回报。
保留独立的人工研判路径。已有分类种子和合成测试不构成该旅程完成。

## 已核实的两个外部前提

1. **宿主接入授权仍缺失**。公开 Core main
   `36e325a1087641b3b7785d121239ee6068252f22` 有 module 载体，但
   `manager/official-plugin-host-policies.ts` 未登记 `dev.clowder.issue-workbench`。
   `manager/machine-catalog-provider.ts:resolveLocalPluginEffectiveGrants` 对未登记
   插件返回空权限；`index.ts` 确实以此方法提供 `localGrantPolicy`。
   本地目录安装、Git 安装或改插件 manifest 都不能自行取得成员读取、消息投递权限。
   这不是一项能在插件设置里补填的字段。当前产品文档另明确 C2 任意插件 UI
   注入尚未交付，独立 5198 预览没有已授权的宿主 owner request。
2. **实际仓库派工权限缺失**。2026-10-21 只读查询：当前 GitHub 用户
   `YukinaXSer`；`meow-club` membership 为 active/member；
   `zts212653/clowder-ai` 的 viewerPermission 为 `READ`。
   能读取组织成员不等于能在该仓库添加 assignee。需要有实际派工权限的登录账号，
   或由仓库管理员授予当前账号相应权限；插件不代改成员权限或切换身份。

运行环境核验：API PID 90710 cwd 位于 `/Users/yuki/Documents/AINest/clowder-ai/packages/api`；
该 checkout HEAD 为 `466d4549fe2d75c9cc5c96b9497f47e464d13cf2`，source/dist 中未找到
module 载体。未修改或重启该运行实例。即使更新到上述公开 main，缺失的插件 grants
也不会自动出现。

可复核来源：

- [当前 Host 权限策略](https://github.com/zts212653/clowder-ai/blob/36e325a1087641b3b7785d121239ee6068252f22/packages/api/src/domains/plugin/manager/official-plugin-host-policies.ts)
- [本地插件权限解析](https://github.com/zts212653/clowder-ai/blob/36e325a1087641b3b7785d121239ee6068252f22/packages/api/src/domains/plugin/manager/machine-catalog-provider.ts)
- [实际 composition](https://github.com/zts212653/clowder-ai/blob/36e325a1087641b3b7785d121239ee6068252f22/packages/api/src/index.ts)
- 本仓 `docs/plugin-development.md`：管理生命周期及 C2 UI 支持边界。
- 只读命令：`gh api user --jq .login`；`gh repo view zts212653/clowder-ai --json viewerPermission`；
  `gh api user/memberships/orgs/meow-club`（仅记录 organization/state/role）。

## 需明确的范围决定

用户此前要求只更新插件 PR #80，并要求撤回宿主改动：
`0001792508660364-000060-9580a33b`、`0001792509520767-000070-c6435188`。
当前“继续完成”没有明确撤销这项边界；不得重建 #1639 或自行新增专属白名单。

建议的完整交付路径需要另行允许一项**通用插件接入**：

- 复用 Plugin Manager 安装实例、包摘要、owner 确认和当前 grants 存储，支持
  安装者明确批准声明权限；不是由 manifest、插件 ID 或浏览器正文自授权。
- 通过受监管的插件页面/现有 owner-operation 载体连接当前工作台，绑定同一
  安装实例、同源权限与生命周期；不暴露内部凭据，不搭可绕过授权的旁路代理。
- 以独立 PR 展示接口与撤销/重装/隔离测试；未经批准不合入、不部署到运行实例。
- Issue 业务、分类、分工策略和三栏 UI 继续只在插件仓维护。

若仍严格限定只改插件，可继续完善插件代码，但无法诚实交付当前缺失的真实猫咖
联动。不得用固定猫名单、直接读取生产数据或替其他插件冒用身份来填补这项缺口。

## 插件内继续完成的功能与验收

1. 可理解的配置流程：仓库、组织、人工/猫猫模式、配置成员及研判对话、
   自动派工开关、Feature/分类分工；用实际账号与仓库权限给出明确诊断。
2. 自动分类为显式启用的持久队列：真实目录、单问题版本、所选猫、去重、
   进度与失败恢复；不能把初始静态标签的显示当自动分析。暂停或停止队列后不再
   新投递或自动派工；单条 Issue 的人工/猫模式切换不改变已明确启动的批量队列。
3. 分配只允许当前 Organization 成员；成员自提优先本人；其余按 Feature、
   分类的唯一分工；冲突交给人判断。保持已有负责人，发送/写入前复验权限与原文。
4. 优先级给出 1–10 分及证据；阻塞猫咖运行通常为 8–9，证据不足不伪评分。
5. 真实写入使用已授权账号并读回 GitHub；公开通知建议提交者参与合入前验收。
   接收端使用自己的账号、线程和猫配置，启动补收，持久去重；投递不冒称接手。
6. 验收经过安装、配置、真实分类、真实派工、接收端启动补收、回报；
   记录撤权、网络失败、重启/重装后恢复和原有用户记录保留。每项分别报告。

本文件是接入事实与待决定范围，不是完成证据，也不授予宿主修改或真实派工权限。
