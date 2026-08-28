import { useEffect, useState } from 'react'
import { inputSpec, sol, usdApprox, type Service } from '../data'
import { isSignature, isSolanaAddress, short } from '../wallet'
import { useWallet } from '../WalletProvider'
import { useOrderFlow } from '../useOrderFlow'
import { clusterLabel } from '../wallet'

/**
 * The purchase, start to finish.
 *
 * The rule throughout: never claim a step has happened before the thing that
 * would prove it. "Paid" waits for a signature, "delivered" waits for the
 * server to say `delivered` — not for a timer, and not for the absence of an
 * error.
 */
export default function BuyPanel({ service, onClose }: { service: Service; onClose: () => void }) {
  const spec = inputSpec(service.id)
  const { address, payCluster, chain } = useWallet()
  const flow = useOrderFlow(service.id)
  const [input, setInput] = useState('')

  const valid = spec.kind === 'signature' ? isSignature(input) : isSolanaAddress(input)
  const touched = input.trim().length > 0

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const d = flow.detail
  const status = d?.status ?? (flow.phase === 'tracking' ? 'pending' : null)

  return (
    <div className="ovl" onMouseDown={onClose}>
      <div className="buypanel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="buyhead">
          <div>
            <div className="bt">{service.name}</div>
            <div className="bs">{service.short}</div>
          </div>
          <button className="x" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* ── 1. what to look at ─────────────────────────────────────── */}
        {(flow.phase === 'form' || flow.phase === 'quoting' || flow.phase === 'failed') && (
          <>
            <label className="bl" htmlFor="buy-input">
              {spec.label}
            </label>
            <input
              id="buy-input"
              className={`bin${touched && !valid ? ' bad' : ''}`}
              value={input}
              spellCheck={false}
              autoComplete="off"
              placeholder={spec.placeholder}
              onChange={(e) => setInput(e.target.value)}
              disabled={flow.phase === 'quoting'}
            />
            <div className="bhint">
              {touched && !valid
                ? spec.kind === 'signature'
                  ? 'That is not a transaction signature.'
                  : 'That is not a Solana address.'
                : spec.hint}
            </div>

            <div className="brow">
              <span className="bk">Price</span>
              <span className="bv">
                {sol(service.priceSol)}
                {usdApprox(service.price) && (
                  <span className="mut"> · {usdApprox(service.price)}</span>
                )}
              </span>
            </div>
            <div className="brow">
              <span className="bk">Estimate</span>
              <span className="bv">{service.turnaround}</span>
            </div>
            <div className="brow">
              <span className="bk">Settles on</span>
              <span className="bv">{clusterLabel(payCluster)}</span>
            </div>

            {!address ? (
              <div className="bnote">Connect a wallet to order.</div>
            ) : !chain ? (
              <div className="bnote">
                Payments are disabled: the server named a cluster this page cannot map.
              </div>
            ) : (
              <div className="bnote">
                Paying from <b>{short(address)}</b>. Nothing is spent until you approve it in your
                wallet.
              </div>
            )}

            <button
              className="bgo"
              type="button"
              disabled={!valid || !flow.canPay || flow.phase === 'quoting'}
              onClick={() => void flow.requestQuote(input)}
            >
              {flow.phase === 'quoting' ? 'Getting a price…' : 'Get a price'}
            </button>
          </>
        )}

        {/* ── 2. the quote, which dies in 60 seconds ─────────────────── */}
        {(flow.phase === 'quoted' || flow.phase === 'signing') && flow.quote && (
          <>
            <div className="brow">
              <span className="bk">Order</span>
              <span className="bv">#{flow.quote.orderId}</span>
            </div>
            <div className="brow">
              <span className="bk">Amount</span>
              {/* the quote is denominated in lamports and carries no USD at all —
                  this is exactly what the wallet will be asked to transfer */}
              <span className="bv big">{sol(flow.quote.amountSol)}</span>
            </div>
            <div className="brow">
              <span className="bk">Estimate</span>
              <span className="bv">~{flow.quote.estMinutes} min</span>
            </div>

            {flow.expired ? (
              <div className="bnote bad">
                This quote expired. Prices move with SOL, so it has to be re-issued rather than
                honoured late.
              </div>
            ) : (
              <>
                <div className="bmeter">
                  <i style={{ width: `${Math.min(100, (flow.secondsLeft / 60) * 100)}%` }} />
                </div>
                <div className="bnote">
                  Quote holds for <b>{flow.secondsLeft}s</b>. Approving after that fails — the
                  server will not settle a stale price.
                </div>
              </>
            )}

            {flow.error && <div className="bnote bad">{flow.error}</div>}

            {flow.expired ? (
              <button className="bgo" type="button" onClick={flow.reset}>
                Get a fresh price
              </button>
            ) : (
              <button
                className="bgo"
                type="button"
                disabled={flow.phase === 'signing'}
                onClick={() => void flow.approve()}
              >
                {flow.phase === 'signing' ? 'Confirm in your wallet…' : 'Approve payment'}
              </button>
            )}
          </>
        )}

        {/* ── 3. signed; the server decides what happens now ─────────── */}
        {flow.phase === 'tracking' && flow.quote && (
          <>
            <div className="brow">
              <span className="bk">Order</span>
              <span className="bv">#{flow.quote.orderId}</span>
            </div>
            <div className="brow">
              <span className="bk">Payment</span>
              <span className="bv">
                {d?.paymentUrl ? (
                  <a href={d.paymentUrl} target="_blank" rel="noreferrer">
                    {short(flow.signature ?? '', 6, 6)}
                  </a>
                ) : (
                  short(flow.signature ?? '', 6, 6)
                )}
              </span>
            </div>

            <div className={`bstate ${status ?? 'pending'}`}>
              {status === 'pending' && 'Payment sent. Waiting for Chipperton to see it on chain.'}
              {status === 'queued' && 'Paid and queued. It is picked up on the next review.'}
              {status === 'running' && 'Chipperton is working on it now.'}
              {status === 'delivered' && 'Delivered.'}
              {status === 'refunded' && 'Refunded — it missed the deadline committed at payment.'}
              {status === 'expired' && 'Expired before payment landed.'}
            </div>

            {d?.etaDeadline && !d.terminal && (
              <div className="brow">
                <span className="bk">Deadline</span>
                <span className="bv">{new Date(d.etaDeadline).toUTCString().slice(17, 25)} UTC</span>
              </div>
            )}

            {/* the server's own words for a failure beat any summary of ours */}
            {d?.failureReason && <div className="bnote bad">{d.failureReason}</div>}

            {d?.refundUrl && (
              <div className="brow">
                <span className="bk">Refund</span>
                <span className="bv">
                  <a href={d.refundUrl} target="_blank" rel="noreferrer">
                    {d.refundSig ? short(d.refundSig, 6, 6) : 'transaction'}
                  </a>
                </span>
              </div>
            )}

            {d?.report && (
              <>
                <div className="brepbar">
                  <span>report</span>
                  {d.receiptUrl && (
                    <a href={d.receiptUrl} target="_blank" rel="noreferrer">
                      receipt ↗
                    </a>
                  )}
                </div>
                <pre className="brep">{d.report}</pre>
                {d.reportHash && <div className="bhash">sha256 {d.reportHash}</div>}
              </>
            )}

            <div className="bnote">
              Your access token is saved in this browser, so you can close this and come back to
              order <b>#{flow.quote.orderId}</b>. It is the only key to it — clearing site data
              loses it.
            </div>

            <button className="bgo ghost" type="button" onClick={onClose}>
              Close
            </button>
          </>
        )}

        {flow.phase === 'failed' && flow.error && <div className="bnote bad">{flow.error}</div>}
      </div>
    </div>
  )
}
