/**
 * Context-steward decision model: window-derived thresholds and the compact-vs-switch
 * choice that keeps a long-lived conversation inside its model's context window.
 *
 * A steward watches one conversation segment. When pressure crosses a model-relative
 * line it decides once: `compact` condenses work still in progress in place, `switch`
 * hands off to a fresh segment at a stopping point. No token count is hard-coded here;
 * every line follows the model's declared window, matching DS Bot's context model.
 * This module is deliberately cordis-free so both Host policy and tests can share it.
 * @module @deepseek-ai/dsh-compaction/steward
 */

/** Action a context steward may choose for one segment. */
export type StewardAction = 'compact' | 'switch'

/** Thresholds derived from a model's window for one segment. */
export interface StewardThresholds {
  /** Declared context window W; 500000 when the model declares none. */
  readonly window: number
  /** Usable window U = W - reply reserve, floored at W/2. */
  readonly usable: number
  /** Hard line H = 0.95 × U; a mid-turn check happens at or above it. */
  readonly hard: number
  /** Check line C = checkRatio × U capped at H; a turn-end check happens at or above it. */
  readonly check: number
}

/** Model window information the thresholds need. */
export interface StewardModelWindow {
  /** Declared context window, when the adapter reports one. */
  readonly contextWindow?: number
}

/** Configuration for threshold derivation. */
export interface StewardConfig {
  /** Share of the usable window that arms a turn-end check, in (0, 1]. */
  readonly checkRatio: number
  /** Reserved reply tokens subtracted from the window; non-negative. */
  readonly maxTokens: number
}

/** Where in the turn a decision is being requested. */
export type StewardPhase = 'turn-end' | 'mid-turn'

/** Inputs to a single steward decision. */
export interface StewardDecisionInput {
  /** Tokens currently occupying the segment's context. */
  readonly pressureTokens: number
  /** Thresholds for the segment's model. */
  readonly thresholds: StewardThresholds
  /** Whether the turn ended or a mid-turn fallback check fired. */
  readonly phase: StewardPhase
  /** Provider confirmed a context overflow; forces a switch without a handoff. */
  readonly overflow?: boolean
  /** Compactions already performed in this segment; raises switch tendency. */
  readonly compactCount: number
  /** The steward's one-line answer, when one was obtained. */
  readonly answer?: string
}

/** A steward decision and the logged reason behind it. */
export interface StewardDecision {
  /** Chosen action. */
  readonly action: StewardAction
  /** Short reason suitable for a log-only record. */
  readonly reason: string
}

/** Default context window when a model declares none. */
export const DEFAULT_CONTEXT_WINDOW = 500_000
/** Reply-reserve share of the window used when the caller supplies none. */
export const DEFAULT_CHECK_RATIO = 0.8
/** Hard line as a fraction of the usable window. */
export const HARD_LINE_RATIO = 0.95
/** Hysteresis band: after a check, pressure must rise this share of U to check again. */
export const CHECK_HYSTERESIS_RATIO = 0.25

/**
 * Derive the window-relative thresholds for one model.
 * @param model - model window information from the resolved route.
 * @param config - check ratio and reply reserve.
 * @returns the W / U / H / C lines for the segment.
 */
export function stewardThresholds(model: StewardModelWindow, config: StewardConfig): StewardThresholds {
  const declared = model.contextWindow
  const window = declared === undefined || !Number.isFinite(declared) || declared <= 0
    ? DEFAULT_CONTEXT_WINDOW
    : declared
  const usable = Math.max(window / 2, window - Math.max(0, config.maxTokens))
  const hard = HARD_LINE_RATIO * usable
  const check = Math.min(config.checkRatio * usable, hard)
  return { window, usable, hard, check }
}

/**
 * Whether a decision should be requested now. A turn-end check is armed at C;
 * the mid-turn fallback is armed only at H, so an ordinary turn does not trigger
 * a steward call on every message.
 * @param input - decision inputs including pressure, phase, and thresholds.
 * @returns whether the steward should be consulted.
 */
export function shouldCheckSteward(input: Pick<StewardDecisionInput, 'pressureTokens' | 'phase' | 'thresholds'>): boolean {
  const line = input.phase === 'mid-turn' ? input.thresholds.hard : input.thresholds.check
  return input.pressureTokens >= line
}

/**
 * Parse a steward's one-line JSON answer into an action. Any answer that is not
 * a well-formed object with `action: "compact" | "switch"` is treated as a failed
 * decision, which fails loud to `switch` so work cannot silently overflow.
 * @param answer - raw one-line answer from the steward model.
 * @returns the parsed action, or undefined when the answer is unusable.
 */
export function parseStewardAnswer(answer: string): StewardAction | undefined {
  let value: unknown
  try {
    value = JSON.parse(answer.trim())
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const action = (value as { action?: unknown }).action
  return action === 'compact' || action === 'switch' ? action : undefined
}

/**
 * Decide compact vs switch once pressure crossed a line. Provider overflow always
 * switches. A missing or malformed steward answer also switches (fail loud). A
 * compact answer is honored unless the segment has been compacted enough that a
 * further summary would lose more than a handoff; that bias grows with each compact.
 * @param input - decision inputs including phase, pressure, and steward answer.
 * @returns the action and a short log-only reason.
 */
export function decideStewardAction(input: StewardDecisionInput): StewardDecision {
  if (input.overflow === true) {
    return { action: 'switch', reason: 'provider context overflow' }
  }
  const parsed = input.answer === undefined ? undefined : parseStewardAnswer(input.answer)
  if (parsed === undefined) {
    return { action: 'switch', reason: 'steward failed or returned an unusable answer' }
  }
  if (input.phase === 'mid-turn' && parsed === 'compact' && input.pressureTokens >= input.thresholds.hard) {
    return { action: 'compact', reason: 'steward chose compact at the hard line mid-turn' }
  }
  // Each prior compact makes a further summary more lossy; past a second compact,
  // prefer a handoff on a reasonable stopping point. This is a tendency, not a rule
  // that overrides an explicit compact at the hard line.
  if (parsed === 'compact' && input.phase === 'turn-end' && input.compactCount >= 2) {
    return { action: 'switch', reason: 'steward chose compact after repeated checkpoints' }
  }
  return { action: parsed, reason: 'steward decision' }
}

/**
 * Whether a fresh check is armed after a decision. After checking, pressure must
 * rise by a quarter of the usable window before another turn-end check, so a very
 * large system prompt does not trigger a steward call every turn.
 * @param lastCheckedTokens - pressure recorded at the last check.
 * @param pressureTokens - current pressure.
 * @param thresholds - thresholds for the segment's model.
 * @returns whether another turn-end check is armed.
 */
export function stewardCheckRearmed(
  lastCheckedTokens: number,
  pressureTokens: number,
  thresholds: StewardThresholds,
): boolean {
  return pressureTokens >= lastCheckedTokens + CHECK_HYSTERESIS_RATIO * thresholds.usable
}
