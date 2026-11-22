---
description: "Cordis-free layered-memory data model for long-lived agents: entry format, four read modes, budgets, and the Host wiring contract."
kind: "package-reference"
---

# @deepseek-ai/dsh-memory-core

English | [中文](README.zh.md)

Cordis-free layered-memory data model for long-lived DeepSeek Harness agents. Installable on its own; no runtime dependencies.

## Summary

A long-lived Bot needs memory that survives one model window without loading every fact into every prompt. This package provides the entry model and the four read modes — resident, incremental, auto-recall, and on-demand — as pure functions a Host driver can mount. It does not wire itself into cordis; it defines the data contract and the text that becomes model-visible so a driver can log exactly what it injects.

## Entry model

An entry carries a stable id (derived from its body when absent), the fact body, its source, author, add date, optional expiry, a user-set pin, and an optional topic. Only the body counts against character budgets; metadata is appended for traceability. `formatEntry()` renders the Agent Memory Repo compatible line `- body [id: …; source: …; by: …; added: …; until: …; pinned: user]`.

## Four reads

- **Resident** — `residentEntries()` returns live MEMORY.md lines (no topic) across self/team/group. `renderResident()` applies the budget and produces the lines to freeze at segment start, so the system prompt stays byte-identical for prefix caching.
- **Incremental** — `renderIncremental()` turns entries changed since the last step into a single appended user message; an empty change set produces no message.
- **Auto-recall** — `recall()` ranks live entries against the user's just-spoken text using whitespace terms plus CJK bigrams, so two-character Chinese topics match where trigram indexes do not. `renderRecallResults()` renders the picked entries with short ids for follow-up reads.
- **On-demand** — topic entries are read through a `recall` tool; `readModeOf()` classifies an entry as resident (no topic) or on-demand (has a topic).

## Budgets and expiry

`effectiveBudget()` takes the smaller of the configured characters and a share of the usable context window, so no layer floods a small window. `fitBudget()` keeps whole entries within that budget and never evicts a pinned entry, matching the rule that tidying and eviction must not move pinned facts. `isLive()` drops entries past their `until` date unless they are pinned.

## Host wiring contract

This module only computes text. A Host-side memory plugin owns persistence (for example through `ctx.storageDomain`), registers `recall`/`remember` tools, injects the frozen resident slice into a stable `systemPrompt.section`, appends the incremental slice in `agent/pre-step`, and logs every injected line so model-visible ⟺ logged holds. Entries carry scope in their source namespace (`self:`, `team:`, `group:`), and `entriesForScope()` filters by it.
