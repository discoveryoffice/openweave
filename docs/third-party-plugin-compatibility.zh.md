# 第三方插件兼容性台账

[English](third-party-plugin-compatibility.md) | 中文

## 概述

本参考记录一个独立插件针对公开扩展点报告的限制，以及当前工作区对每一项的核验证据。[下游台账](https://github.com/Fei2411/DS-Bot/blob/main/docs/plans/2026-10-13-dsh-concessions.md)把这些案例编号为 C1–C15；它是下游的单方观察，不是本仓库的契约。每一行都指明拥有当前行为的 API 或源码，因此只有该所有者发生变化，行的内容才会变化。

## 目录

- [状态口径](#status-vocabulary)
- [台账](#register)
- [保持扩展点稳定](#keeping-the-extension-points-stable)
- [更新台账](#updating-the-register)
- [开发备注](#dev-note)

<a id="status-vocabulary"></a>
## 状态口径

- **已解决**：当前工作区已有公开机制覆盖所报告的限制，无需改动 API。
- **部分具备**：机制存在，但未覆盖报告的用法，或只覆盖其中一部分；该行写明剩余缺口。
- **仍缺**：当前工作区未找到拥有该行为的机制。
- **不适用**：限制属于应用外壳或部署，不属于插件扩展点。

<a id="register"></a>
## 台账

| 编号 | 下游报告的限制 | 状态 | 证据 | 下一步 |
|---|---|---|---|---|
| C1 | PTC preset 下模型可见的工具表现为 `run_code` 子调用，且单次程序运行有时长上限。 | 部分具备 | [PTC executor](../packages/core/tool-executor-ptc/README.zh.md)把内部派发事件保留为仅落日志；[spill policy](../packages/spill/spill-policy/README.zh.md)保留相同内容。 | 为内部派发事件提供由工具视图共用的展示 projection（投影）。 |
| C2 | 命令全局注册，插件无法为某个 Session 隐藏或禁用全局命令。 | 已解决 | [commands](../packages/interaction/commands/README.zh.md)在发现、查找与执行时求值按 agent 的 `visible(agent)` 谓词；不可见的 agent 作用域同名覆盖可隐藏交付的全局命令；[tools](../packages/core/tools/README.zh.md)已用 `ctx.tools.restrict()` 作用域化工具遮罩。 | 无。 |
| C3 | `@` 引用源全局注册，无法为某个 Session 隐藏或重排。 | 已解决 | [ui-input-trigger](../packages/client/ui-input-trigger/README.zh.md)用 `order` 排序分组，并通过 `ctx.inputTriggers.registerFilter()` 按会话隐藏任意已注册 source；[ui-reference](../packages/client/ui-reference/README.zh.md)就是这样的 source。 | 无。 |
| C4 | 插件无法移除交付的指令菜单项。 | 已解决 | [commands](../packages/interaction/commands/README.zh.md)用不可见的作用域同名覆盖隐藏菜单项，注销后原命令恢复；其余菜单贡献由 [slots](subsystems/slots.zh.md)拥有。 | 无。 |
| C5 | profile patch 缺少条件语法，关掉 auto 搜索 provider 后没有回落。 | 已解决 | [cordis primer](cordis-primer.zh.md)在 `config` 与 `disabled` 下解析 `!!js`；[web service](../packages/web/web/README.zh.md)给出条件配置范例，并刻意保持选择不依赖顺序、缺失 id 时 fail loud。 | 无。 |
| C6 | MCP 客户端把上游响应体写进日志，插件无法脱敏密钥值。 | 已解决 | [MCP client](../packages/mcp/mcp-client/README.zh.md)把成功工具结果作为权威工具输出返回，不写进日志；[diagnostic](../packages/mcp/mcp-client/src/diagnostic.ts)对 `expandTemplates` 下写出的每条诊断脱敏。 | 无。 |
| C7 | 其他插件的 CSS 覆盖插件 UI，插件依赖私有类名。 | 已解决 | [web styling](web-styling.zh.md)使用 CSS Modules，并把 [ui-primitives](../packages/client/ui-primitives/README.zh.md)定为跨 feature 包的唯一通道；[dockkit](../packages/client/ui-dockkit/README.zh.md)明确不发布 stylesheet 契约。 | 无；cookbook 写明浏览器 UI 规则。 |
| C8 | slot 无法组合多个插件的工具视图。 | 已解决 | [slots](subsystems/slots.zh.md)支持 `list`、`keyed`、`chain` 与 `hoc` 组合。 | 无。 |
| C9 | 显式默认模型不可用时静默回落到模型目录第一项。 | 已解决 | [session controller](../packages/api/session-controller/src/commands.ts)的 `requireModel()` 抛出 `session/model-unavailable`；[agent default model](../packages/core/agent-default-model/README.zh.md)拥有首次选择。 | 无。 |
| C10 | profile 中禁用插件行后什么都不加载，也没有诊断。 | 部分具备 | [app-boot](../packages/boot/app-boot/README.zh.md)把 Loader 的 import 失败连同原始堆栈列为「Failed plugins」逐行报告，CLI 保存完整启动诊断；[plugin manager](../packages/boot/plugin-manager/README.zh.md)在 `listBundles` 上显示管理类错误。 | 在 composition 启动前暴露 Loader 失败；需要 `vendor/loader` 记录失败或提供事件。 |
| C11 | 模型流卡死时回合不会结束。 | 已解决 | [DeepSeek adapter](../packages/llm/llm-deepseek/src/adapter.ts)以 `MESSAGES_IDLE` 运行 `idleWatchdog`；[retry policy](../packages/llm/llm/src/retry-policy.ts)把 `TIMEOUT` 列为可重试。 | 无。 |
| C12 | 超长工具结果被截断，刷新后回复可能不见。 | 部分具备 | [spill policy](../packages/spill/spill-policy/README.zh.md)让 `maxInlineTokens` 可配置，并保留 head/tail 预览与 [spill](../packages/spill/spill/README.zh.md)中的全文定位。 | 评估长结果只留锚点的 projection。 |
| C13 | agent preset 是全局的，插件无法为自己的 Session 固定一个。 | 已解决 | [preset registry](../packages/preset/agent-preset-registry/src/index.ts)读取 `presetForSession()` 并记录 `agent-preset/locked`。 | 无。 |
| C14 | Windows 标题栏布局没有让窗口材质透出的接口。 | 不适用 | [desktop layout](../apps/desktop/src/windows-layout.ts)在应用外壳中拥有 `WINDOWS_TITLEBAR_HEIGHT`。 | 由桌面外壳负责。 |
| C15 | 账号登录与退出条目由账号插件注入，插件没有自己的账号界面。 | 已解决 | [account controller](../packages/api/account-controller/README.zh.md)把 `getState`、`startSignIn`、`signOut` 与 `watch` 暴露为 Remote 命令。 | 无；插件用 Remote 与 slot 自建条目。 |

<a id="keeping-the-extension-points-stable"></a>
## 保持扩展点稳定

「部分具备」与「仍缺」的行要通过公开能力来收口，而不是让插件伸手进交付的展示层。[extension cookbook](cookbook/extension-cookbook.zh.md)写明协议驱动的浏览器 UI 规则，并链接到各自的所有者：[slots](subsystems/slots.zh.md)、[web styling](web-styling.zh.md)与 [ui-primitives](../packages/client/ui-primitives/README.zh.md)。

<a id="updating-the-register"></a>
## 更新台账

当某行的拥有者 API 发生变化，或有下游插件报告新限制时，重新核对该行。把证据链接换成新的所有者，不要把下游 issue 编号与日期写成当前行为。双语配对与一致性记录一起更新，命令为 `pnpm run verify-translation-pairing --write docs/third-party-plugin-compatibility.md`。

<a id="dev-note"></a>
## 开发备注

无。
