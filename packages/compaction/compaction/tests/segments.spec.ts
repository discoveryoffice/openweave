import { describe, expect, it } from 'vitest'
import {
  botId, buildHandoff, nextSegment, renderCheckpoint, segmentIndex,
} from '@deepseek-ai/dsh-compaction'
import type { SegmentIdentity, VerbatimQuote } from '@deepseek-ai/dsh-compaction'

const quotes: VerbatimQuote[] = [
  { author: 'user', text: 'keep this decision exactly', anchor: 'part 2 #1234' },
  { author: 'bot-2', text: 'I rejected the cache approach' },
]

describe('renderCheckpoint', () => {
  it('renders a numbered checkpoint with a trimmed summary and verbatim quotes', () => {
    const result = renderCheckpoint({ number: 3, summary: '  work in progress  ', quotes, quoteBudget: 500 })
    expect(result).toBe(
      '[Checkpoint 3]\nwork in progress\n[part 2 #1234] user: keep this decision exactly\nbot-2: I rejected the cache approach',
    )
  })

  it('skips whole tags that do not fit the budget, keeping quotes verbatim', () => {
    const result = renderCheckpoint({ number: 1, summary: 's', quotes, quoteBudget: 20 })
    expect(result).toBe('[Checkpoint 1]\ns')
    const one = renderCheckpoint({ number: 1, summary: 's', quotes, quoteBudget: 47 })
    expect(one).toBe('[Checkpoint 1]\ns\n[part 2 #1234] user: keep this decision exactly')
  })

  it('omits the quote section when there are no quotes', () => {
    expect(renderCheckpoint({ number: 1, summary: 's', quotes: [], quoteBudget: 100 }))
      .toBe('[Checkpoint 1]\ns')
  })

  it('omits the quote section when the budget is zero', () => {
    expect(renderCheckpoint({ number: 1, summary: 's', quotes, quoteBudget: 0 }))
      .toBe('[Checkpoint 1]\ns')
  })
})

describe('buildHandoff', () => {
  it('carries note, recent messages, and archive pointer', () => {
    expect(buildHandoff({
      note: '  handoff note  ', recentMessages: quotes, archiveLocation: 'chat/part-1',
    })).toEqual({
      note: 'handoff note',
      recentMessages: quotes,
      archiveLocation: 'chat/part-1',
    })
  })

  it('attaches the anchored inbound list for private-chat segments', () => {
    const result = buildHandoff({
      note: 'n', recentMessages: [], archiveLocation: 'a', inboundAnchors: quotes,
    })
    expect(result.inboundAnchors).toEqual(quotes)
  })

  it('clones quotes so later mutation cannot change the package', () => {
    const source: VerbatimQuote[] = [{ author: 'user', text: 'x' }]
    const result = buildHandoff({ note: 'n', recentMessages: source, archiveLocation: 'a' })
    source[0] = { author: 'user', text: 'changed' }
    expect(result.recentMessages[0]?.text).toBe('x')
  })
})

function firstSegment(): SegmentIdentity {
  return { botId: botId('bot-1'), index: segmentIndex(1), sessionId: 'session-1' }
}

describe('nextSegment', () => {
  it('inherits the Bot identity and increments the index', () => {
    expect(nextSegment(firstSegment(), 'session-2')).toEqual({
      botId: botId('bot-1'),
      index: segmentIndex(2),
      sessionId: 'session-2',
      previousIndex: segmentIndex(1),
      previousReason: 'handoff',
    })
  })

  it('records overflow and workspace-change reasons', () => {
    expect(nextSegment(firstSegment(), 's2', 'overflow').previousReason).toBe('overflow')
    expect(nextSegment(firstSegment(), 's2', 'workspace-change').previousReason).toBe('workspace-change')
  })

  it('chains a third segment back to its immediate predecessor', () => {
    const second = nextSegment(firstSegment(), 'session-2', 'handoff')
    const third = nextSegment(second, 'session-3')
    expect(third.index).toBe(segmentIndex(3))
    expect(third.previousIndex).toBe(segmentIndex(2))
    expect(third.botId).toBe(botId('bot-1'))
  })
})
