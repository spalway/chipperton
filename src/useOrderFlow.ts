import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createOrder,
  getOrder,
  OrderError,
  secondsLeft,
  type CreateOrderResponse,
  type OrderDetail,
} from './order'
import { signAndSend } from './wallet'
import { useWallet } from './WalletProvider'

/**
 * Where the buyer is in the purchase, for the half of it that happens before
 * the server knows anything. Once a payment is signed the server's own `status`
 * takes over — there is no point maintaining a second opinion about it here.
 */
export type Phase =
  | 'form' // choosing what to ask about
  | 'quoting' // POST /api/orders in flight
  | 'quoted' // quote held, waiting for the buyer to approve in their wallet
  | 'signing' // wallet popup is open
  | 'tracking' // signed and sent; the server is the source of truth now
  | 'failed' // could not get as far as a signature

export type OrderFlow = ReturnType<typeof useOrderFlow>

/** Poll fast while a payment is landing, then back off for the long wait. */
const pollDelay = (n: number) => (n < 12 ? 5_000 : 15_000)

export function useOrderFlow(serviceId: string) {
  const { wallet, account, chain } = useWallet()

  const [phase, setPhase] = useState<Phase>('form')
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<CreateOrderResponse | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [left, setLeft] = useState(0)

  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // countdown on the held quote — a buyer must never be able to approve a dead
  // one, because the server will reject it after they have already agreed
  useEffect(() => {
    if (!quote || phase !== 'quoted') return
    const tick = () => setLeft(secondsLeft(quote.quoteExpiresAt))
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [quote, phase])

  const expired = phase === 'quoted' && left <= 0

  const reset = useCallback(() => {
    setPhase('form')
    setError(null)
    setQuote(null)
    setSignature(null)
    setDetail(null)
  }, [])

  /** Ask the server for a price and a transaction. Nothing is spent here. */
  const requestQuote = useCallback(
    async (input: string) => {
      if (!account) {
        setError('Connect a wallet first.')
        return
      }
      setPhase('quoting')
      setError(null)
      try {
        const q = await createOrder({ serviceId, input: input.trim(), payer: account.address })
        if (!alive.current) return
        setQuote(q)
        setPhase('quoted')
      } catch (e) {
        if (!alive.current) return
        // the server distinguishes an unfunded wallet from an inactive service
        // from a bad address; its wording is more useful than ours would be
        setError(e instanceof OrderError ? e.message : 'Could not create the order.')
        setPhase('failed')
      }
    },
    [account, serviceId],
  )

  /** Hand the server's transaction to the wallet. This is where money moves. */
  const approve = useCallback(async () => {
    if (!quote || !wallet || !account) return
    if (!chain) {
      setError('The payment cluster is unknown, so nothing will be signed.')
      return
    }
    if (secondsLeft(quote.quoteExpiresAt) <= 0) {
      setError('That quote expired before it was approved. Start again for a fresh price.')
      return
    }
    setPhase('signing')
    setError(null)
    try {
      const sig = await signAndSend(wallet, account, quote.transaction, chain)
      if (!alive.current) return
      setSignature(sig)
      setPhase('tracking')
    } catch (e) {
      if (!alive.current) return
      const msg = e instanceof Error ? e.message : 'The wallet did not complete the payment.'
      // rejecting in the wallet is a decision, not a fault — say so plainly and
      // leave the quote intact so it can still be approved if time remains
      setError(/reject|denied|cancel/i.test(msg) ? 'You rejected the payment in your wallet.' : msg)
      setPhase('quoted')
    }
  }, [quote, wallet, account, chain])

  // once signed, the server is the only thing that knows what happened
  useEffect(() => {
    if (phase !== 'tracking' || !quote) return
    let n = 0
    let timer: ReturnType<typeof setTimeout>
    const ac = new AbortController()

    const poll = async () => {
      try {
        const d = await getOrder(quote.orderId, quote.accessToken, ac.signal)
        if (ac.signal.aborted) return
        setDetail(d)
        if (d.terminal) return
      } catch {
        // a transient lookup failure must not end the watch — the payment is
        // already on chain and the order is still real
      }
      if (!ac.signal.aborted) timer = setTimeout(poll, pollDelay(n++))
    }
    void poll()

    return () => {
      ac.abort()
      clearTimeout(timer)
    }
  }, [phase, quote])

  return {
    phase,
    error,
    quote,
    signature,
    detail,
    secondsLeft: left,
    expired,
    canPay: !!account && !!chain,
    requestQuote,
    approve,
    reset,
  }
}
