import { describe, expect, it } from 'vitest'
import {
  createEntry, effectiveBudget, entriesForScope, fitBudget, formatEntry, isLive,
  memoryEntryId, readModeOf, recall, renderIncremental, renderRecallResults, renderResident,
  residentEntries,
} from '@deepseek-ai/dsh-memory-core'
import type { MemoryBudget, MemoryEntry } from '@deepseek-ai/dsh-memory-core'

const now = '2026-11-22T00:00:00.000Z'

function entry(overrides: Partial<MemoryEntry> & { body: string; source: string }): MemoryEntry {
  return createEntry({ by: 'bot-1', added: '2026-11-01T00:00:00.000Z', ...overrides })
}

const budget = (chars: number, windowShare = 0.02, usableWindow = 100_000): MemoryBudget =>
  ({ chars, windowShare, usableWindow })

describe('createEntry and formatEntry', () => {
  it('derives a stable id from the body and defaults pinned to false', () => {
    const first = createEntry({ body: 'the sky is blue', source: 'self:user', by: 'u', added: now })
    const second = createEntry({ body: 'the sky is blue', source: 'self:user', by: 'u', added: now })
    expect(first.id).toBe(second.id)
    expect(first.id).toMatch(/^[0-9a-f]{8}$/)
    expect(first.pinned).toBe(false)
  })

  it('keeps an explicit id and renders the compatible metadata line', () => {
    const e = entry({ body: 'prefers dark mode', source: 'self:user', id: '7f3a', pinned: true, until: '2027-01-01' })
    expect(e.id).toBe(memoryEntryId('7f3a'))
    expect(formatEntry(e)).toBe(
      '- prefers dark mode [id: 7f3a; source: self:user; by: bot-1; added: 2026-11-01T00:00:00.000Z; until: 2027-01-01; pinned: user]',
    )
  })
})

describe('isLive, scope, and read mode', () => {
  const entries = [
    entry({ body: 'a', source: 'self:user' }),
    entry({ body: 'b', source: 'team:main' }),
    entry({ body: 'c', source: 'group:general' }),
    entry({ body: 'old', source: 'self:user', until: '2026-11-21T00:00:00.000Z' }),
    entry({ body: 'pin', source: 'self:user', until: '2026-11-21T00:00:00.000Z', pinned: true }),
    entry({ body: 'topic', source: 'self:user', topic: 'architecture' }),
  ]

  it('expires past-due entries unless pinned', () => {
    expect(isLive(entries[3]!, now)).toBe(false)
    expect(isLive(entries[4]!, now)).toBe(true)
    expect(isLive(entries[0]!, now)).toBe(true)
  })

  it('filters by scope and excludes topic entries', () => {
    expect(entriesForScope(entries, 'self', now).map(e => e.body)).toEqual(['a', 'pin'])
    expect(entriesForScope(entries, 'team', now).map(e => e.body)).toEqual(['b'])
    expect(entriesForScope(entries, 'group', now).map(e => e.body)).toEqual(['c'])
  })

  it('returns all-scope MEMORY.md lines as resident', () => {
    expect(residentEntries(entries, now).map(e => e.body)).toEqual(['a', 'b', 'c', 'pin'])
  })

  it('classifies by topic', () => {
    expect(readModeOf(undefined)).toBe('resident')
    expect(readModeOf('architecture')).toBe('on-demand')
  })
})

describe('budgets', () => {
  const entries = [
    entry({ body: '12345', source: 'self:user' }),
    entry({ body: '1234567890', source: 'self:user' }),
    entry({ body: 'pinned-long-body', source: 'self:user', pinned: true }),
  ]

  it('takes the smaller of chars and window share', () => {
    expect(effectiveBudget(budget(1000, 0.02, 100_000))).toBe(1000)
    expect(effectiveBudget(budget(1000, 0.02, 10_000))).toBe(200)
  })

  it('keeps bodies within budget, skipping whole oversized entries', () => {
    expect(fitBudget(entries.slice(0, 2), budget(6)).map(e => e.body)).toEqual(['12345'])
  })

  it('never evicts a pinned entry even over budget', () => {
    expect(fitBudget(entries.slice(2), budget(1)).map(e => e.body)).toEqual(['pinned-long-body'])
    expect(fitBudget(entries, budget(6)).map(e => e.body)).toEqual(['12345', 'pinned-long-body'])
  })

  it('renders resident lines with the budget applied', () => {
    expect(renderResident(entries, budget(6))).toEqual([
      '- 12345 [id: ' + entries[0]!.id + '; source: self:user; by: bot-1; added: 2026-11-01T00:00:00.000Z]',
      '- pinned-long-body [id: ' + entries[2]!.id + '; source: self:user; by: bot-1; added: 2026-11-01T00:00:00.000Z; pinned: user]',
    ])
  })
})

describe('recall ranking', () => {
  const entries = [
    entry({ body: '用户喜欢深色模式 dark mode', source: 'self:user' }),
    entry({ body: '部署使用 Docker', source: 'team:main' }),
    entry({ body: '深色主题 the dark theme', source: 'self:user' }),
  ]

  it('matches two-character Chinese terms and ranks by score', () => {
    const results = recall(entries, '深色', 10)
    expect(results.map(r => r.entry.body)).toEqual(['用户喜欢深色模式 dark mode', '深色主题 the dark theme'])
    expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score)
  })

  it('drops non-matching entries and respects the limit', () => {
    expect(recall(entries, 'Docker', 10).map(r => r.entry.body)).toEqual(['部署使用 Docker'])
    expect(recall(entries, '深色', 1)).toHaveLength(1)
    expect(recall(entries, 'zzzz', 10)).toEqual([])
  })

  it('returns no results for an empty query', () => {
    expect(recall(entries, '   ', 10)).toEqual([])
  })

  it('skips entries with an empty body', () => {
    const withEmpty = [...entries, entry({ body: '!!!', source: 'self:user' })]
    expect(recall(withEmpty, '深色', 10).map(r => r.entry.body)).not.toContain('!!!')
  })

  it('renders recall results as traceable lines', () => {
    const lines = renderRecallResults(recall(entries, 'Docker', 10))
    expect(lines[0]).toContain('部署使用 Docker')
    expect(lines[0]).toContain('id: ')
  })
})

describe('renderIncremental', () => {
  it('returns undefined when nothing changed', () => {
    expect(renderIncremental([])).toBeUndefined()
  })

  it('renders changed entries as one message', () => {
    const changed = [entry({ body: 'new fact', source: 'self:user' })]
    expect(renderIncremental(changed)).toBe('Memory changed:\n- new fact [id: ' + changed[0]!.id + '; source: self:user; by: bot-1; added: 2026-11-01T00:00:00.000Z]')
  })
})
