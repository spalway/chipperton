import { useEffect, useRef, useState } from 'react'
import { useWallet } from '../WalletProvider'
import { clusterLabel, short } from '../wallet'

/**
 * The connect control in the nav.
 *
 * Four distinct states, none of which may be collapsed into "no wallet":
 * connected, no wallet installed, a wallet installed but on the wrong network,
 * and a server whose cluster we cannot map at all.
 */
export default function ConnectWallet() {
  const { available, wrongChain, address, wallet, connecting, error, chain, payCluster, connect, disconnect } =
    useWallet()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  if (address) {
    return (
      <div className="wbox" ref={box}>
        <button className="connect on" type="button" onClick={() => setOpen((o) => !o)}>
          <i />
          {short(address)}
        </button>
        {open && (
          <div className="wmenu">
            <div className="wmhead">
              {wallet?.name}
              <span>{clusterLabel(payCluster)}</span>
            </div>
            <div className="wmaddr">{address}</div>
            <button
              className="wmitem danger"
              type="button"
              onClick={() => {
                setOpen(false)
                void disconnect()
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="wbox" ref={box}>
      <button
        className="connect"
        type="button"
        disabled={connecting}
        onClick={() => setOpen((o) => !o)}
      >
        {connecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
      {open && (
        <div className="wmenu">
          {available.length > 0 && (
            <>
              <div className="wmhead">
                Pay on <span>{clusterLabel(payCluster)}</span>
              </div>
              {available.map((w) => (
                <button
                  className="wmitem"
                  type="button"
                  key={w.name}
                  onClick={() => {
                    setOpen(false)
                    void connect(w)
                  }}
                >
                  {w.icon && <img src={w.icon} alt="" width={15} height={15} />}
                  {w.name}
                </button>
              ))}
            </>
          )}

          {/* an installed wallet on the wrong network is not "no wallet found" —
              telling someone to install Phantom when Phantom is right there and
              merely set to mainnet sends them to fix the wrong thing */}
          {available.length === 0 && wrongChain.length > 0 && (
            <div className="wmnote">
              {wrongChain.map((w) => w.name).join(', ')} {wrongChain.length === 1 ? 'is' : 'are'}{' '}
              installed but not set up for <b>{clusterLabel(payCluster)}</b>. Switch network in
              your wallet, then reload.
            </div>
          )}

          {available.length === 0 && wrongChain.length === 0 && chain != null && (
            <div className="wmnote">
              No Solana wallet detected. Install <b>Phantom</b>, <b>Solflare</b> or{' '}
              <b>Backpack</b>, then reload this page.
            </div>
          )}

          {chain == null && (
            <div className="wmnote">
              {payCluster
                ? `The server is settling on "${payCluster}", which this page does not recognise. Payment is disabled rather than signed on the wrong chain.`
                : 'Waiting for the server to say which cluster payments settle on.'}
            </div>
          )}

          {error && <div className="wmerr">{error}</div>}
        </div>
      )}
    </div>
  )
}
