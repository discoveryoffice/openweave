# Third-party plugin compatibility register

English | [中文](third-party-plugin-compatibility.zh.md)

## Summary

This reference records the limitations an independent plugin reported against the public extension points, together with the current checkout's evidence for each one. The [downstream register](https://github.com/Fei2411/DS-Bot/blob/main/docs/plans/2026-10-13-dsh-concessions.md) numbers the cases C1–C15; it is a downstream observation, not a repository contract. Each row names the API or source that owns current behavior, so a change to that owner is what changes the row.

## Table of Contents

- [Status vocabulary](#status-vocabulary)
- [Register](#register)
- [Keeping the extension points stable](#keeping-the-extension-points-stable)
- [Updating the register](#updating-the-register)
- [Dev Note](#dev-note)

<a id="status-vocabulary"></a>
## Status vocabulary

- **Resolved**: the checkout exposes a public mechanism that covers the reported limitation; no API change is needed.
- **Partial**: a mechanism exists but does not cover the reported use, or covers only part of it; the row names the remaining gap.
- **Open**: no owning mechanism was found in the checkout.
- **Out of scope**: the limitation belongs to an application shell or a deployment, not to a plugin extension point.

<a id="register"></a>
## Register

| Case | Reported limitation | State | Evidence | Next action |
|---|---|---|---|---|
| C1 | PTC presets expose model-visible tools as `run_code` child calls, and one program run has a time bound. | Partial | [PTC executor](../packages/core/tool-executor-ptc/README.md) keeps inner dispatch events log-only; [spill policy](../packages/spill/spill-policy/README.md) retains the same content. | Give inner dispatch events a presentation projection shared by tool views. |
| C2 | Commands register globally; a plugin cannot hide or disable a global command for one Session. | Resolved | [commands](../packages/interaction/commands/README.md) evaluates a per-agent `visible(agent)` predicate for discovery, lookup, and execution; an invisible agent-scoped shadow hides a shipped global command, and [tools](../packages/core/tools/README.md) already scopes tool masks with `ctx.tools.restrict()`. | None. |
| C3 | `@` reference sources register globally and cannot be hidden or reordered for one Session. | Resolved | [ui-input-trigger](../packages/client/ui-input-trigger/README.md) orders groups by `order` and hides any registered source per session through `ctx.inputTriggers.registerFilter()`; [ui-reference](../packages/client/ui-reference/README.md) is one such source. | None. |
| C4 | A plugin cannot remove a shipped command menu item. | Resolved | [commands](../packages/interaction/commands/README.md) hides the item with an invisible scoped shadow whose disposer restores the original; [slots](subsystems/slots.md) own the remaining menu contributions. | None. |
| C5 | Profile patches lack conditional syntax, and disabling the auto search provider leaves no fallback. | Resolved | [cordis primer](cordis-primer.md) resolves `!!js` under `config` and `disabled`; the [web service](../packages/web/web/README.md) documents the conditional-patch pattern and deliberately keeps selection order-independent and fail-loud for a missing id. | None. |
| C6 | The MCP client writes upstream response bodies to logs and a plugin cannot redact secret values. | Resolved | [MCP client](../packages/mcp/mcp-client/README.md) keeps successful tool results as canonical tool output rather than logger input; [diagnostic](../packages/mcp/mcp-client/src/diagnostic.ts) redacts every diagnostic written under `expandTemplates`. | None. |
| C7 | Other plugins' CSS overrides a plugin's UI, and a plugin depends on private class names. | Resolved | [web styling](web-styling.md) uses CSS Modules and names [ui-primitives](../packages/client/ui-primitives/README.md) as the only cross-feature channel; [dockkit](../packages/client/ui-dockkit/README.md) publishes no stylesheet contract. | None; the cookbook states the browser-UI rule. |
| C8 | Slots cannot combine several plugins' tool views. | Resolved | [slots](subsystems/slots.md) supports `list`, `keyed`, `chain`, and `hoc` composition. | None. |
| C9 | An unavailable explicit default model silently falls back to the first catalog entry. | Resolved | [session controller](../packages/api/session-controller/src/commands.ts) raises `session/model-unavailable` from `requireModel()`; [agent default model](../packages/core/agent-default-model/README.md) owns first selection. | None. |
| C10 | A disabled plugin entry loads nothing and gives no diagnostic. | Partial | [app-boot](../packages/boot/app-boot/README.md) reports Loader import failures as "Failed plugins" lines with original stacks, and the CLI saves full startup diagnostics; [plugin manager](../packages/boot/plugin-manager/README.md) shows management errors on `listBundles`. | Expose the Loader failure before composition starts; that needs a `vendor/loader` failure record or event. |
| C11 | A stalled model stream never ends the turn. | Resolved | [DeepSeek adapter](../packages/llm/llm-deepseek/src/adapter.ts) runs `idleWatchdog` with `MESSAGES_IDLE`; [retry policy](../packages/llm/llm/src/retry-policy.ts) treats `TIMEOUT` as retryable. | None. |
| C12 | Long tool results are truncated and replies disappear after a reload. | Partial | [spill policy](../packages/spill/spill-policy/README.md) makes `maxInlineTokens` configurable and keeps a head/tail preview plus a full-result locator in [spill](../packages/spill/spill/README.md). | Consider an anchor-only projection for long results. |
| C13 | Agent presets are global and a plugin cannot pin one for its own Sessions. | Resolved | [preset registry](../packages/preset/agent-preset-registry/src/index.ts) reads `presetForSession()` and records `agent-preset/locked`. | None. |
| C14 | The Windows titlebar layout exposes no hook for window material. | Out of scope | [desktop layout](../apps/desktop/src/windows-layout.ts) owns `WINDOWS_TITLEBAR_HEIGHT` in the application shell. | Owned by the desktop shell. |
| C15 | Account sign-in and sign-out entries are injected by the account plugin, so a plugin has no account surface. | Resolved | [account controller](../packages/api/account-controller/README.md) exposes `getState`, `startSignIn`, `signOut`, and `watch` as Remote commands. | None; plugins build their own entry from the Remote and a slot. |

<a id="keeping-the-extension-points-stable"></a>
## Keeping the extension points stable

A Partial or Open row is closed by publishing a capability, not by a plugin reaching into shipped presentation. The [extension cookbook](cookbook/extension-cookbook.md) states the browser-UI rule for protocol drivers and links the owners: [slots](subsystems/slots.md), [web styling](web-styling.md), and [ui-primitives](../packages/client/ui-primitives/README.md).

<a id="updating-the-register"></a>
## Updating the register

Recheck a row when its owning API changes or a downstream plugin reports a new limitation. Replace the evidence link with the new owner, and keep downstream issue numbers and dates out of the current-behavior rows. The bilingual pair and its consistency record update together with `pnpm run verify-translation-pairing --write docs/third-party-plugin-compatibility.md`.

<a id="dev-note"></a>
## Dev Note

None.
