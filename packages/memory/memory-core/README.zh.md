---
description: "面向长期存活 agent 的、与 cordis 无关的分层记忆数据模型：条目格式、四种读法、预算与 Host 接线契约。"
kind: "package-reference"
---

# @deepseek-ai/dsh-memory-core

[English](README.md) | 中文

面向长期存活的 DeepSeek Harness agent 的、与 cordis 无关的分层记忆数据模型。可单独安装，无运行时依赖。

## 摘要

长期运行的 Bot 需要一种记忆：既能跨过单个模型窗口，又不必把每条事实都塞进每次提示词。本包把条目模型和四种读法——常驻、增量、自动召回、按需——实现为纯函数，供 Host 驱动挂载。它不把自己接进 cordis；它只定义数据契约与哪些文本会成为模型可见内容，让驱动能精确记录注入了什么。

## 条目模型

条目携带稳定 id（缺省时由正文派生）、事实正文、来源、作者、添加日期、可选到期时间、用户设定的固定标记，以及可选主题。只有正文计入字符预算；元数据附在后面用于追溯。`formatEntry()` 渲染成兼容 Agent Memory Repo 的行：`- 正文 [id: …; source: …; by: …; added: …; until: …; pinned: user]`。

## 四种读法

- **常驻** —— `residentEntries()` 返回所有作用域（self/team/group）中未过期的 MEMORY.md 行（无主题）。`renderResident()` 应用预算并生成在段开始时冻结的行，使系统提示词逐字节不变，从而命中前缀缓存。
- **增量** —— `renderIncremental()` 把自上次步骤以来变动的条目变成一条追加的用户消息；没有变动就不产生消息。
- **自动召回** —— `recall()` 用空白分词加中文二元字组，按用户刚说的话对未过期条目排序，因此两字中文主题也能命中（trigram 索引做不到）。`renderRecallResults()` 用短 id 渲染命中的条目，便于后续取全文。
- **按需** —— 主题条目通过 `recall` 工具读取；`readModeOf()` 把条目归类为常驻（无主题）或按需（有主题）。

## 预算与到期

`effectiveBudget()` 取配置字符数与可用上下文窗口占比中较小的一个，避免任何层淹没小窗口。`fitBudget()` 在预算内保留完整条目、跳过装不下的整条，且绝不驱逐固定条目——与"整理和腾位置都不动 pinned 事实"的规则一致。`isLive()` 丢弃超过 `until` 日期的条目，固定条目除外。

## Host 接线契约

本模块只计算文本。Host 侧记忆插件负责持久化（例如通过 `ctx.storageDomain`）、注册 `recall`/`remember` 工具、把冻结的常驻片段注入稳定的 `systemPrompt.section`、在 `agent/pre-step` 追加增量片段，并记录每一条注入的行，从而保持 model-visible ⟺ logged。条目通过来源命名空间携带作用域（`self:`、`team:`、`group:`），`entriesForScope()` 按它过滤。
