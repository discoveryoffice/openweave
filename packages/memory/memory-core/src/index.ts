/**
 * Cordis-free layered-memory core: entry identity, expiry, scope filtering,
 * lexical recall ranking, prompt budgets, and the four read-mode selectors.
 *
 * The four reads mirror DS Bot: resident entries are frozen at segment start so
 * the system prompt stays byte-identical for prefix caching; incremental entries
 * changed since the last step are appended as one user message; auto-recall picks
 * a few lexically relevant entries on the first step; on-demand entries are read
 * through a `recall` tool. Only the text these selectors emit is model-visible,
 * and a Host driver logs the same text, preserving model-visible ⟺ logged.
 * @module @deepseek-ai/dsh-memory-core
 */

import type {
  MemoryBudget, MemoryEntry, MemoryEntryId, MemoryEntryInput, MemoryReadMode,
  MemoryScope, ScoredEntry,
} from './types.ts'

export type {
  MemoryBudget, MemoryEntry, MemoryEntryId, MemoryEntryInput, MemoryReadMode,
  MemoryScope, ScoredEntry,
} from './types.ts'

/** Brand a string as a MemoryEntryId. */
export function memoryEntryId(value: string): MemoryEntryId {
  return value as MemoryEntryId
}

/**
 * Create an entry, deriving a stable short id from the body when none is given.
 * @param input - entry fields; id defaults to a fingerprint of the body.
 * @returns a normalized entry with a pinned default of false.
 */
export function createEntry(input: MemoryEntryInput): MemoryEntry {
  return {
    id: memoryEntryId(input.id ?? fingerprint(input.body)),
    body: input.body,
    source: input.source,
    by: input.by,
    added: input.added,
    ...(input.until === undefined ? {} : { until: input.until }),
    pinned: input.pinned ?? false,
    ...(input.topic === undefined ? {} : { topic: input.topic }),
  }
}

/**
 * Format one entry as the Agent Memory Repo compatible line. Only the body
 * counts against budgets; metadata is appended for source traceability.
 * @param entry - entry to render.
 * @returns a single `- body [id: …; source: …; by: …; added: …]` line.
 */
export function formatEntry(entry: MemoryEntry): string {
  const meta = [`id: ${entry.id}`, `source: ${entry.source}`, `by: ${entry.by}`, `added: ${entry.added}`]
  if (entry.until !== undefined) meta.push(`until: ${entry.until}`)
  if (entry.pinned) meta.push('pinned: user')
  return `- ${entry.body} [${meta.join('; ')}]`
}

/**
 * Whether an entry is still live at a given instant. Pinned entries never expire;
 * an entry with no `until` never expires either.
 * @param entry - entry to check.
 * @param now - ISO instant to compare against.
 * @returns whether the entry should be injected or recalled.
 */
export function isLive(entry: MemoryEntry, now: string): boolean {
  return entry.pinned || entry.until === undefined || entry.until > now
}

/**
 * Filter entries to one scope and drop expired ones.
 * @param entries - all entries.
 * @param scope - scope to keep.
 * @param now - ISO instant for expiry checks.
 * @returns live entries in the requested scope.
 */
export function entriesForScope(entries: readonly MemoryEntry[], scope: MemoryScope, now: string): MemoryEntry[] {
  return entries.filter(entry => entry.topic === undefined && isLive(entry, now) && scopeOf(entry, scope))
}

/**
 * Resident entries across all three scopes (self/team/group) that have no topic,
 * i.e. MEMORY.md lines. These are frozen at segment start.
 * @param entries - all entries.
 * @param now - ISO instant for expiry checks.
 * @returns live MEMORY.md entries from every scope.
 */
export function residentEntries(entries: readonly MemoryEntry[], now: string): MemoryEntry[] {
  return entries.filter(entry => entry.topic === undefined && isLive(entry, now))
}

/** Scope matching helper: entries carry scope in their source namespace. */
function scopeOf(entry: MemoryEntry, scope: MemoryScope): boolean {
  return entry.source.startsWith(`${scope}:`)
}

/**
 * Resolve the effective character budget: the smaller of the configured chars
 * and the window share, so no layer floods a small model window.
 * @param budget - configured chars, window share, and usable window.
 * @returns the effective character budget (at least 0).
 */
export function effectiveBudget(budget: MemoryBudget): number {
  return Math.max(0, Math.min(budget.chars, Math.floor(budget.windowShare * budget.usableWindow)))
}

/**
 * Select entries that fit a character budget, keeping pinned entries and the
 * newest ones first. Only entry bodies count, matching DS Bot's budget rule.
 * @param entries - candidate entries, already filtered and ordered.
 * @param budget - prompt-injection budget.
 * @returns entries whose formatted lines fit, in the same order.
 */
export function fitBudget(entries: readonly MemoryEntry[], budget: MemoryBudget): MemoryEntry[] {
  const limit = effectiveBudget(budget)
  const kept: MemoryEntry[] = []
  let used = 0
  for (const entry of entries) {
    const size = entry.body.length
    if (!entry.pinned && used + size > limit) continue
    kept.push(entry)
    used += size
  }
  return kept
}

/**
 * Rank entries by lexical relevance to a query using a BM25-like score over
 * whitespace and CJK bigrams, so two-character Chinese terms match (trigram
 * indexes do not). Entries with score 0 are dropped.
 * @param entries - live candidate entries.
 * @param query - the user's just-spoken text.
 * @param limit - maximum number of entries to return.
 * @returns scored, sorted, non-zero entries.
 */
export function recall(entries: readonly MemoryEntry[], query: string, limit: number): ScoredEntry[] {
  const queryTerms = terms(query)
  if (queryTerms.length === 0) return []
  const scores: ScoredEntry[] = []
  for (const entry of entries) {
    const bodyTerms = terms(entry.body)
    if (bodyTerms.length === 0) continue
    const score = queryTerms.reduce((sum, term) => {
      const hits = bodyTerms.filter(bodyTerm => bodyTerm === term).length
      return sum + (hits > 0 ? 1 + Math.log(hits) : 0)
    }, 0)
    if (score > 0) scores.push({ entry, score })
  }
  scores.sort((left, right) => right.score - left.score || left.entry.added.localeCompare(right.entry.added))
  return scores.slice(0, Math.max(0, limit))
}

/**
 * Render the resident slice: frozen at segment start, so callers inject it once
 * into a stable system-prompt section and never change it within the segment.
 * @param entries - resident entries for self/team/group scopes.
 * @param budget - prompt-injection budget.
 * @returns frozen prompt lines, one per entry.
 */
export function renderResident(entries: readonly MemoryEntry[], budget: MemoryBudget): string[] {
  return fitBudget(entries, budget).map(formatEntry)
}

/**
 * Render the incremental slice: entries changed since the last step become a
 * single appended user message. An empty change set yields no message.
 * @param changed - entries added or modified since the previous step.
 * @returns one message text, or undefined when there is nothing to say.
 */
export function renderIncremental(changed: readonly MemoryEntry[]): string | undefined {
  if (changed.length === 0) return undefined
  return `Memory changed:\n${changed.map(formatEntry).join('\n')}`
}

/**
 * Render an on-demand recall result for the `recall` tool's model-visible output.
 * @param results - scored recall results.
 * @returns tool output lines with short ids so full sources need a follow-up read.
 */
export function renderRecallResults(results: readonly ScoredEntry[]): string[] {
  return results.map(({ entry }) => formatEntry(entry))
}

/** Resolve which read mode an entry uses by default: MEMORY.md is resident, a topic is on-demand. */
export function readModeOf(topic: string | undefined): MemoryReadMode {
  return topic === undefined ? 'resident' : 'on-demand'
}

/** Stable short fingerprint of a body, used as its default id. */
function fingerprint(body: string): string {
  let hash = 2166136261
  for (let i = 0; i < body.length; i++) {
    hash ^= body.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Tokenize text into whitespace words and CJK bigrams for lexical recall. */
function terms(text: string): string[] {
  const normalized = text.toLowerCase()
  const words = normalized.match(/[\p{L}\p{N}_]+/gu) ?? []
  const out: string[] = []
  for (const word of words) {
    out.push(word)
    if (/[\p{Script=Han}]/u.test(word)) {
      for (let i = 0; i + 1 < word.length; i++) out.push(word.slice(i, i + 2))
    }
  }
  return out
}
