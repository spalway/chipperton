import { beforeEach, describe, expect, it, vi } from 'vitest'
import { myOrders, orderToken, rememberOrder, secondsLeft } from './order'

beforeEach(() => localStorage.clear())

describe('secondsLeft — a dead quote must never look alive', () => {
  const at = '2026-08-28T07:00:00.000Z'
  const now = Date.parse(at)

  it('counts down while the quote is held', () => {
    expect(secondsLeft(at, now - 60_000)).toBe(60)
    expect(secondsLeft(at, now - 1_500)).toBe(1)
  })

  it('floors at zero rather than going negative', () => {
    // A negative countdown rendered as a progress bar reads as "plenty of
    // time"; the buyer would approve a price the server has already dropped.
    expect(secondsLeft(at, now)).toBe(0)
    expect(secondsLeft(at, now + 500_000)).toBe(0)
  })

  it('treats an unparseable expiry as already expired', () => {
    expect(secondsLeft('never', now)).toBe(0)
  })
})

describe('access tokens', () => {
  it('persists and returns a token', () => {
    rememberOrder('0401', 'tok-a')
    expect(orderToken('0401')).toBe('tok-a')
  })

  it('returns null for an order this browser never placed', () => {
    expect(orderToken('9999')).toBeNull()
  })

  it('keeps tokens for several orders and lists them newest first', () => {
    vi.setSystemTime(new Date('2026-08-28T07:00:00.000Z'))
    rememberOrder('0401', 'tok-a')
    vi.setSystemTime(new Date('2026-08-28T08:00:00.000Z'))
    rememberOrder('0402', 'tok-b')
    vi.useRealTimers()

    expect(myOrders().map((o) => o.orderId)).toEqual(['0402', '0401'])
    expect(orderToken('0401')).toBe('tok-a')
  })

  it('does not throw when storage holds corrupt JSON', () => {
    // A thrown error here would take down the purchase over a cosmetic feature.
    localStorage.setItem('chipperton:orders', '{ not json')
    expect(() => orderToken('0401')).not.toThrow()
    expect(orderToken('0401')).toBeNull()
    expect(myOrders()).toEqual([])
  })
})
