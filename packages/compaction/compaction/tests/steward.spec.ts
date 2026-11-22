import { describe, expect, it } from 'vitest'
import {
  CHECK_HYSTERESIS_RATIO, DEFAULT_CHECK_RATIO, DEFAULT_CONTEXT_WINDOW, HARD_LINE_RATIO,
  decideStewardAction, parseStewardAnswer, shouldCheckSteward, stewardCheckRearmed, stewardThresholds,
} from '@deepseek-ai/dsh-compaction'
import type { StewardDecisionInput, StewardThresholds } from '@deepseek-ai/dsh-compaction'

const config = { checkRatio: DEFAULT_CHECK_RATIO, maxTokens: 20_000 }

describe('stewardThresholds', () => {
  it('derives W, U, H, and C from a declared window', () => {
    expect(stewardThresholds({ contextWindow: 200_000 }, config)).toEqual({
      window: 200_000, usable: 180_000, hard: 171_000, check: 144_000,
    })
    expect(HARD_LINE_RATIO).toBe(0.95)
  })

  it('falls back to the default window when none is declared or it is invalid', () => {
    const expected = stewardThresholds({ contextWindow: DEFAULT_CONTEXT_WINDOW }, config)
    expect(stewardThresholds({}, config)).toEqual(expected)
    expect(stewardThresholds({ contextWindow: 0 }, config)).toEqual(expected)
    expect(stewardThresholds({ contextWindow: Number.NaN }, config)).toEqual(expected)
  })

  it('floors the usable window at half the window when the reserve is too large', () => {
    expect(stewardThresholds({ contextWindow: 100 }, { checkRatio: 1, maxTokens: 90 }).usable).toBe(50)
  })

  it('caps the check line at the hard line', () => {
    const result = stewardThresholds({ contextWindow: 100_000 }, { checkRatio: 1, maxTokens: 0 })
    expect(result.check).toBe(result.hard)
  })

  it('treats a negative reserve as zero', () => {
    expect(stewardThresholds({ contextWindow: 100_000 }, { checkRatio: 0.8, maxTokens: -5 }).usable)
      .toBe(100_000)
  })
})

describe('shouldCheckSteward', () => {
  const thresholds = stewardThresholds({ contextWindow: 200_000 }, config)

  it('arms a turn-end check at C but not below it', () => {
    expect(shouldCheckSteward({ pressureTokens: thresholds.check - 1, thresholds, phase: 'turn-end' })).toBe(false)
    expect(shouldCheckSteward({ pressureTokens: thresholds.check, thresholds, phase: 'turn-end' })).toBe(true)
  })

  it('arms a mid-turn check only at H', () => {
    expect(shouldCheckSteward({ pressureTokens: thresholds.check, thresholds, phase: 'mid-turn' })).toBe(false)
    expect(shouldCheckSteward({ pressureTokens: thresholds.hard, thresholds, phase: 'mid-turn' })).toBe(true)
  })
})

describe('parseStewardAnswer', () => {
  it('parses compact and switch answers', () => {
    expect(parseStewardAnswer('{"action":"compact","reason":"still working"}')).toBe('compact')
    expect(parseStewardAnswer('  {"action":"switch"}  ')).toBe('switch')
  })

  it('rejects malformed, non-object, and wrong-action answers', () => {
    expect(parseStewardAnswer('not json')).toBeUndefined()
    expect(parseStewardAnswer('[]')).toBeUndefined()
    expect(parseStewardAnswer('null')).toBeUndefined()
    expect(parseStewardAnswer('{"action":"pause"}')).toBeUndefined()
    expect(parseStewardAnswer('{}')).toBeUndefined()
  })
})

function decision(overrides: Partial<StewardDecisionInput> = {}): StewardDecisionInput {
  const thresholds: StewardThresholds = stewardThresholds({ contextWindow: 200_000 }, config)
  return {
    pressureTokens: thresholds.check,
    thresholds,
    phase: 'turn-end',
    compactCount: 0,
    ...overrides,
  }
}

describe('decideStewardAction', () => {
  it('switches without a handoff on provider overflow', () => {
    expect(decideStewardAction(decision({ overflow: true, answer: '{"action":"compact"}' })))
      .toEqual({ action: 'switch', reason: 'provider context overflow' })
  })

  it('fails loud to switch on a missing or unusable answer', () => {
    expect(decideStewardAction(decision())).toMatchObject({ action: 'switch' })
    expect(decideStewardAction(decision({ answer: 'garbage' }))).toMatchObject({ action: 'switch' })
  })

  it('honors a compact decision in progress', () => {
    expect(decideStewardAction(decision({ answer: '{"action":"compact"}' })))
      .toEqual({ action: 'compact', reason: 'steward decision' })
  })

  it('honors an explicit compact at the hard line mid-turn', () => {
    const input = decision({ phase: 'mid-turn', pressureTokens: 200_000, answer: '{"action":"compact"}' })
    expect(decideStewardAction(input)).toMatchObject({ action: 'compact' })
  })

  it('prefers a handoff after repeated checkpoints at a turn end', () => {
    const input = decision({ compactCount: 2, answer: '{"action":"compact"}' })
    expect(decideStewardAction(input))
      .toEqual({ action: 'switch', reason: 'steward chose compact after repeated checkpoints' })
  })

  it('honors a switch decision', () => {
    expect(decideStewardAction(decision({ answer: '{"action":"switch"}' }))).toMatchObject({ action: 'switch' })
  })
})

describe('stewardCheckRearmed', () => {
  it('requires a quarter-usable-window rise before another check', () => {
    const thresholds = stewardThresholds({ contextWindow: 200_000 }, config)
    const last = 100_000
    expect(stewardCheckRearmed(last, last + CHECK_HYSTERESIS_RATIO * thresholds.usable - 1, thresholds)).toBe(false)
    expect(stewardCheckRearmed(last, last + CHECK_HYSTERESIS_RATIO * thresholds.usable, thresholds)).toBe(true)
  })
})
