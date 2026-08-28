import { describe, expect, it } from 'vitest'
import { chipsPriceSol, intervalLabel, sol, usdApprox } from './data'
import {
  COST_LINES,
  DAILY_COST_USD,
  HISTORY,
  JOBS,
  JOB_PRIVATE,
  OPENING_USD,
  SERVICES,
  TREASURY,
  chipsPrice,
  closestCall,
  costTotal,
  deliveredToday,
  measuredTurnaroundMins,
  openJobs,
  pendingEtaMins,
  runwayDays,
  today,
} from './data'

/**
 * These tests exist because of specific bugs that shipped, not for coverage.
 * Each block names the failure it prevents from returning.
 */

describe('day ledger', () => {
  it('every row balances: open + earned − spent − cost === close', () => {
    for (const d of HISTORY) {
      expect(d.closeUsd).toBeCloseTo(d.openUsd + d.earnedUsd - d.spentUsd - d.costUsd, 6)
    }
  })

  it('each day opens where the previous day closed', () => {
    HISTORY.slice(1).forEach((d, i) => {
      expect(d.openUsd).toBeCloseTo(HISTORY[i].closeUsd, 6)
    })
  })

  it('starts at the declared opening balance', () => {
    expect(HISTORY[0].openUsd).toBe(OPENING_USD)
  })

  it('net equals earned − spent − cost', () => {
    for (const d of HISTORY) {
      expect(d.netUsd).toBeCloseTo(d.earnedUsd - d.spentUsd - d.costUsd, 6)
    }
  })
})

describe('headline figures are derived, not asserted', () => {
  it("treasury balance IS the ledger's last close — they cannot drift apart", () => {
    expect(TREASURY.balanceUsd).toBe(today().closeUsd)
  })

  it('runway is balance ÷ daily cost', () => {
    expect(runwayDays()).toBeCloseTo(TREASURY.balanceUsd / TREASURY.dailyCostUsd, 6)
  })

  it('closestCall is the true minimum of the ledger, not a hand-typed claim', () => {
    const low = closestCall()
    const min = Math.min(...HISTORY.map((d) => d.closeUsd))
    expect(low.closeUsd).toBe(min)
    // regression: the docs FAQ once claimed "4.1 days on day 17"
    expect(low.runwayDays).toBeCloseTo(low.closeUsd / DAILY_COST_USD, 6)
  })
})

describe('turnaround vs wait — these are different numbers', () => {
  // Regression: pendingEtaMins() was once rendered as "average turnaround".
  // It measures remaining wait on unfinished work and says nothing about
  // how long completed work took.
  it('measured turnaround is computed only from DELIVERED jobs', () => {
    const delivered = JOBS.filter((j) => j.status === 'delivered')
    expect(delivered.length).toBeGreaterThan(0)
    expect(measuredTurnaroundMins()).toBeGreaterThan(0)
  })

  it('pending wait is computed only from OPEN jobs', () => {
    const open = openJobs()
    expect(open.length).toBeGreaterThan(0)
    expect(open.every((j) => j.status !== 'delivered')).toBe(true)
    expect(pendingEtaMins()).toBeGreaterThan(0)
  })

  it('the two are not interchangeable', () => {
    expect(measuredTurnaroundMins()).not.toBe(pendingEtaMins())
  })

  it('measured turnaround equals the median of deliveredAt − paidAt', () => {
    const mins = JOBS.filter((j) => j.status === 'delivered' && j.deliveredAt)
      .map((j) => {
        const t = (x: string) => {
          const [h, m, s] = x.split(':').map(Number)
          return h * 60 + m + (s ?? 0) / 60
        }
        return t(j.deliveredAt!) - t(j.paidAt)
      })
      .sort((a, b) => a - b)
    const mid = Math.floor(mins.length / 2)
    const median = mins.length % 2 ? mins[mid] : (mins[mid - 1] + mins[mid]) / 2
    expect(measuredTurnaroundMins()).toBe(Math.round(median))
  })
})

describe('cost', () => {
  it('the declared breakdown sums to the declared daily cost', () => {
    expect(costTotal()).toBeCloseTo(DAILY_COST_USD, 6)
  })

  // Regression: cost lines once carried a tx signature and were shown as
  // "settled in one transaction" — fabricated proof for a typed constant.
  it('cost lines carry no transaction signature while cost is declared', () => {
    for (const line of COST_LINES) {
      expect(line).not.toHaveProperty('sig')
    }
  })
})

describe('privacy — the public job shape must not carry payer data', () => {
  // Regression: the public queue once joined payerWallet ↔ queried address,
  // which deanonymises buyers.
  it('no public job exposes `input` or `payerWallet`', () => {
    for (const j of JOBS) {
      expect(j).not.toHaveProperty('input')
      expect(j).not.toHaveProperty('payerWallet')
    }
  })

  it('those fields live only behind the payer-gated map', () => {
    for (const j of JOBS) {
      expect(JOB_PRIVATE[j.id]).toBeDefined()
      expect(JOB_PRIVATE[j.id].payerWallet).toBeTruthy()
    }
  })
})

describe('pricing', () => {
  it('the $CHIPS price is derived at exactly 10% off, never hand-typed', () => {
    for (const s of SERVICES) {
      expect(chipsPriceSol(s.priceSol)).toBe(sol(s.priceSol * 0.9))
      if (s.price != null) {
        expect(chipsPrice(s.price)).toBe(`$${(s.price * 0.9).toFixed(2)}`)
      }
    }
  })

  it('every service carries an exact SOL price, which is never null', () => {
    // priceUsd can vanish when the price feed fails; priceSol cannot, which is
    // why it is the figure the cards lead with.
    for (const s of SERVICES) {
      expect(typeof s.priceSol).toBe('number')
      expect(s.priceSol).toBeGreaterThan(0)
    }
  })

  it('renders SOL exactly, without inventing precision', () => {
    expect(sol(0.05)).toBe('0.05 SOL')
    expect(sol(0.0675)).toBe('0.0675 SOL')
    expect(sol(1)).toBe('1 SOL')
  })

  it('marks the USD conversion as approximate', () => {
    // It is recomputed per request from a 30s-cached SOL price, so a bare
    // "$5.34" claims a precision that expires in half a minute.
    expect(usdApprox(5.337107204740733)).toBe('~$5.34')
  })

  it('returns nothing — never $0.00 — when the price feed gave no conversion', () => {
    // A feed outage rendering as "$0.00" would advertise the job as free.
    expect(usdApprox(null)).toBeNull()
    expect(usdApprox(undefined)).toBeNull()
    expect(chipsPrice(null)).toBeNull()
  })
})

describe('service availability is data-driven', () => {
  it('every service declares `active`', () => {
    for (const s of SERVICES) {
      expect(typeof s.active).toBe('boolean')
    }
  })
})

describe('counts match the underlying rows', () => {
  it('backlog counts open jobs', () => {
    expect(openJobs().length).toBe(JOBS.filter((j) => j.status !== 'delivered').length)
  })

  it('delivered count matches delivered rows', () => {
    expect(deliveredToday()).toBe(JOBS.filter((j) => j.status === 'delivered').length)
  })
})

describe('intervalLabel — the tick that dropped from 900s to 60s', () => {
  it('says "minute", not "1 min", at a 60-second tick', () => {
    // Math.round(60/60) rendered "every 1 min", and the prose read
    // "every 1 minutes". The worker actually ticks every 60 seconds.
    expect(intervalLabel(60)).toBe('minute')
  })

  it('keeps sub-minute intervals in seconds instead of rounding them up', () => {
    // 45s rounding to "1 min" overstates the gap by a third
    expect(intervalLabel(45)).toBe('45 sec')
    expect(intervalLabel(30)).toBe('30 sec')
  })

  it('still reads correctly at the old 15-minute tick', () => {
    expect(intervalLabel(900)).toBe('15 min')
  })

  it('does not print a fake number for a nonsense interval', () => {
    expect(intervalLabel(0)).toBe('tick')
    expect(intervalLabel(Number.NaN)).toBe('tick')
  })
})
