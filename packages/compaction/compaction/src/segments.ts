/**
 * Long-lived conversation segment model: stable Bot identity across ordered
 * segments, plus the checkpoint and handoff content contract a steward writes
 * when it compacts in place or switches to a fresh segment.
 *
 * A Bot owns a stable id. Each segment is one DSH Session; switching appends a
 * new segment that inherits the previous one through a handoff, so the identity
 * outlives any single model window. This module is cordis-free: it defines the
 * data contract and pure transitions; the Host driver records them as log-only
 * events and performs the actual compact/fork. No state here is model-visible
 * unless the driver folds it into a request, keeping model-visible ⟺ logged.
 * @module @deepseek-ai/dsh-compaction/segments
 */

/** Stable identity of one long-lived Bot, independent of any single segment. */
export type BotId = string & { readonly __botId: unique symbol }

/** Ordinal of a segment within one Bot, starting at 1. */
export type SegmentIndex = number & { readonly __segmentIndex: unique symbol }

/** Why a segment ended and a successor began. */
export type SegmentEndReason = 'handoff' | 'overflow' | 'workspace-change'

/** Identity and lineage of one segment of a Bot. */
export interface SegmentIdentity {
  /** Stable Bot identity shared by every segment. */
  readonly botId: BotId
  /** Ordinal of this segment within the Bot. */
  readonly index: SegmentIndex
  /** Session id backing this segment. */
  readonly sessionId: string
  /** Previous segment ordinal, absent for the first segment. */
  readonly previousIndex?: SegmentIndex
  /** Why the previous segment ended, absent for the first segment. */
  readonly previousReason?: SegmentEndReason
}

/** A verbatim quote that must survive a checkpoint or handoff unchanged. */
export interface VerbatimQuote {
  /** Who authored the original message. */
  readonly author: string
  /** Original message text, kept byte-for-byte. */
  readonly text: string
  /** Optional anchor (part and sequence) locating the original in the log. */
  readonly anchor?: string
}

/** Inputs to build a checkpoint summary for an in-place compaction. */
export interface CheckpointInput {
  /** One-based checkpoint ordinal within the segment. */
  readonly number: number
  /** Model-written summary of current state, decisions, constraints, and next steps. */
  readonly summary: string
  /** User and other-Bot messages to preserve verbatim, newest first. */
  readonly quotes: readonly VerbatimQuote[]
  /** Maximum total verbatim characters to retain; excess newest-first quotes are dropped. */
  readonly quoteBudget: number
}

/** Inputs to build the handoff package that opens a fresh segment. */
export interface HandoffInput {
  /** Model-written note describing where the work stands and what remains. */
  readonly note: string
  /** Most recent raw messages carried into the new segment. */
  readonly recentMessages: readonly VerbatimQuote[]
  /** Pointer to where the full earlier history can be read. */
  readonly archiveLocation: string
  /** Earlier messages-to-Bot list with anchors, attached only to private-chat segments. */
  readonly inboundAnchors?: readonly VerbatimQuote[]
}

/** The handoff package placed at the start of a new segment. */
export interface HandoffPackage {
  /** Model-written handoff note. */
  readonly note: string
  /** Recent messages carried verbatim. */
  readonly recentMessages: readonly VerbatimQuote[]
  /** Where the rest of the history lives. */
  readonly archiveLocation: string
  /** Earlier messages-to-Bot with anchors, when this is a private-chat segment. */
  readonly inboundAnchors?: readonly VerbatimQuote[]
}

/** Brand a string as a BotId. */
export function botId(value: string): BotId {
  return value as BotId
}

/** Brand an ordinal as a SegmentIndex. */
export function segmentIndex(value: number): SegmentIndex {
  return value as SegmentIndex
}

/**
 * Render the in-place checkpoint block. The header makes successive checkpoints
 * distinguishable; user and other-Bot words are appended verbatim, newest first,
 * within the budget. Nothing is paraphrased.
 * @param input - checkpoint number, summary, quotes, and verbatim budget.
 * @returns the checkpoint text to feed back as compacted context.
 */
export function renderCheckpoint(input: CheckpointInput): string {
  const kept: string[] = []
  let used = 0
  for (const quote of input.quotes) {
    const line = formatQuote(quote)
    // A fragment is no longer verbatim, so a quote that does not fit is skipped
    // whole. Newest-first order means the least recent words are lost first.
    if (used + line.length > input.quoteBudget) continue
    kept.push(line)
    used += line.length
  }
  const parts = [`[Checkpoint ${input.number}]`, input.summary.trim()]
  if (kept.length > 0) parts.push(kept.join('\n'))
  return parts.join('\n')
}

/**
 * Build the handoff package that opens a successor segment. Private-chat
 * segments attach the anchored inbound list; group segments carry only recent
 * messages because one group message already represents a whole turn.
 * @param input - handoff note, recent messages, archive pointer, and optional anchors.
 * @returns the handoff package for the new segment's opening.
 */
export function buildHandoff(input: HandoffInput): HandoffPackage {
  return {
    note: input.note.trim(),
    recentMessages: input.recentMessages.map(quote => ({ ...quote })),
    archiveLocation: input.archiveLocation,
    ...(input.inboundAnchors === undefined
      ? {}
      : { inboundAnchors: input.inboundAnchors.map(quote => ({ ...quote })) }),
  }
}

/**
 * Produce the identity of the successor segment. Overflow and workspace changes
 * end the previous segment with their reason; an ordinary handoff uses `handoff`.
 * @param current - identity of the segment being closed.
 * @param nextSessionId - Session id backing the new segment.
 * @param reason - why the current segment ended; undefined means a plain handoff.
 * @returns the successor segment identity.
 */
export function nextSegment(
  current: SegmentIdentity,
  nextSessionId: string,
  reason?: SegmentEndReason,
): SegmentIdentity {
  return {
    botId: current.botId,
    index: segmentIndex(current.index + 1),
    sessionId: nextSessionId,
    previousIndex: current.index,
    ...(reason === undefined ? { previousReason: 'handoff' as const } : { previousReason: reason }),
  }
}

/** Format one verbatim quote with an optional anchor prefix. */
function formatQuote(quote: VerbatimQuote): string {
  return quote.anchor === undefined
    ? `${quote.author}: ${quote.text}`
    : `[${quote.anchor}] ${quote.author}: ${quote.text}`
}
