import { describe, expect, it } from 'vitest'
import { buildActivity, clockOf } from './activity'
import type { CostEntry, CostsResponse, QueuePage, QueueResponse } from './api'

const row = (o: Partial<QueueResponse>): QueueResponse => ({
  id: '0401',
  serviceId: 'safety',
  serviceName: 'Token safety check',
  status: 'delivered',
  currency: 'SOL',
  amountSol: 0.05,
  amountUsd: 5.38,
  createdAt: '2026-08-28T06:00:00.000Z',
  paidAt: '2026-08-28T06:01:00.000Z',
  etaMinutes: null,
  etaBasis: 'declared',
  etaDeadline: null,
  terminal: true,
  awaitingDelivery: false,
  deliveredAt: '2026-08-28T06:20:00.000Z',
  paymentSig: 'PAYSIG1111',
  receiptSig: 'RCPTSIG222',
  reportHash: 'abc123',
  paymentUrl: 'https://explorer.example/tx/PAYSIG1111',
  receiptUrl: 'https://explorer.example/tx/RCPTSIG222',
  ...o,
})

const queue = (rows: QueueResponse[]): QueuePage => ({
  rows,
  total: rows.length,
  limit: 25,
  truncated: false,
})

const cost = (o: Partial<CostEntry>): CostEntry => ({
  id: '1',
  orderId: '0401',
  kind: 'inference',
  usd: 0.027,
  detail: { priced: true },
  createdAt: '2026-08-28T06:10:00.000Z',
  ...o,
})

const costs = (entries: CostEntry[]): CostsResponse => ({
  entries,
  totalsByKind: {},
  measuredDailyCostUsd: null,
})

describe('buildActivity', () => {
  it('never attaches a signature to a spending row', () => {
    // Costs are internal accounting, not transactions. Giving them a signature
    // is the fabricated-proof bug: a real number dressed as on-chain evidence.
    const events = buildActivity(null, costs([cost({}), cost({ kind: 'rpc' })]))
    expect(events).toHaveLength(2)
    for (const e of events) {
      expect(e.sig).toBeNull()
      expect(e.url).toBeNull()
    }
  })

  it('does not claim a receipt for a delivery that has no receipt signature', () => {
    const [, delivered] = buildActivity(queue([row({ receiptSig: null, receiptUrl: null })]), null)
      .slice()
      .reverse()
    expect(delivered.note).toBe('no receipt broadcast')
    expect(delivered.sig).toBeNull()
  })

  it('marks an unpriced cost as unpriced rather than as $0.00 spent', () => {
    // A model missing from the rate table recorded 0. Rendering "$0.00 on model
    // inference" states a measurement that was never made.
    const [e] = buildActivity(null, costs([cost({ usd: 0, detail: { priced: false } })]))
    expect(e.msg).toContain('not priced')
    expect(e.msg).not.toContain('$0.00')
  })

  it('emits nothing for an order that has not been paid for', () => {
    // A pending order has no paidAt and no deliveredAt — there is no event yet.
    const events = buildActivity(
      queue([row({ paidAt: null, deliveredAt: null, status: 'queued' })]),
      null,
    )
    expect(events).toHaveLength(0)
  })

  it('emits payment and delivery separately for one order', () => {
    const events = buildActivity(queue([row({})]), null)
    expect(events.map((e) => e.action)).toEqual(['JOB', 'IN'])
  })

  it('sorts newest first across both sources', () => {
    const events = buildActivity(queue([row({})]), costs([cost({})]))
    const times = events.map((e) => e.at)
    expect(times).toEqual([...times].sort((a, b) => b.localeCompare(a)))
    // delivery 06:20 > cost 06:10 > payment 06:01
    expect(events.map((e) => e.action)).toEqual(['JOB', 'OUT', 'IN'])
  })

  it('passes explorer URLs through untouched rather than building them', () => {
    // A client-built ?cluster=devnet keeps resolving after the mainnet flip —
    // to the wrong chain, with no error.
    const [delivered] = buildActivity(queue([row({})]), null)
    expect(delivered.url).toBe('https://explorer.example/tx/RCPTSIG222')
  })

  it('survives both sources being absent', () => {
    expect(buildActivity(null, null)).toEqual([])
  })
})

describe('clockOf', () => {
  it('renders the time of day from an ISO timestamp', () => {
    expect(clockOf('2026-08-28T06:20:09.000Z')).toBe('06:20:09')
  })

  it('returns a dash rather than "Invalid Date" for junk', () => {
    expect(clockOf('not a date')).toBe('—')
  })
})
