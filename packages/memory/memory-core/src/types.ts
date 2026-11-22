/**
 * Layered-memory data types: one entry model shared by all four read modes.
 * This module is cordis-free and has no workspace dependencies.
 * @module @deepseek-ai/dsh-memory-core/types
 */

/** Scope a memory entry belongs to. */
export type MemoryScope = 'self' | 'team' | 'group'

/** How a memory entry reaches the model. */
export type MemoryReadMode = 'resident' | 'incremental' | 'auto-recall' | 'on-demand'

/** Branded stable id of one memory entry. */
export type MemoryEntryId = string & { readonly __memoryEntryId: unique symbol }

/** One memory entry, compatible with the Agent Memory Repo line format. */
export interface MemoryEntry {
  /** Stable short id (derived from the body when absent). */
  readonly id: MemoryEntryId
  /** The fact itself; only this counts against the character budget. */
  readonly body: string
  /** Where the fact came from. */
  readonly source: string
  /** Who wrote it. */
  readonly by: string
  /** ISO date the entry was added. */
  readonly added: string
  /** ISO date after which the entry stops being injected or recalled; absent means no expiry. */
  readonly until?: string
  /** User-set pin; pinned entries survive tidying and budget eviction. */
  readonly pinned: boolean
  /** Optional topic a detailed entry was moved to. */
  readonly topic?: string
}

/** Input to create an entry; id defaults to a body-derived fingerprint. */
export interface MemoryEntryInput {
  readonly id?: string
  readonly body: string
  readonly source: string
  readonly by: string
  readonly added: string
  readonly until?: string
  readonly pinned?: boolean
  readonly topic?: string
}

/** Budget configuration for prompt injection. */
export interface MemoryBudget {
  /** Character budget for this layer's prompt slice. */
  readonly chars: number
  /** Fraction of the usable context window this layer may occupy, e.g. 0.02. */
  readonly windowShare: number
  /** Current usable context window, to convert windowShare into characters. */
  readonly usableWindow: number
}

/** Candidate entry with a precomputed relevance score for auto-recall. */
export interface ScoredEntry {
  readonly entry: MemoryEntry
  /** Higher is more relevant; 0 means no lexical match. */
  readonly score: number
}
