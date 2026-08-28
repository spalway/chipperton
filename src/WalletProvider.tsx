import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { Wallet, WalletAccount } from '@wallet-standard/base'
import {
  canSignAndSend,
  chainFor,
  connectWallet,
  disconnectWallet,
  onAccountChange,
  subscribeWallets,
  supportsChain,
  walletsServerSnapshot,
  walletsSnapshot,
} from './wallet'
import { useLiveData } from './useLiveData'

type WalletState = {
  /** Installed wallets that can actually sign and send on our chain. */
  available: Wallet[]
  /** Installed, standard-compliant, but not on the chain we settle on. */
  wrongChain: Wallet[]
  wallet: Wallet | null
  account: WalletAccount | null
  address: string | null
  connecting: boolean
  error: string | null
  /**
   * The Wallet Standard chain id we sign on, derived from the server's
   * payCluster. Null when the server named a cluster we cannot map — in which
   * case nothing may be signed, because the alternative is signing on the
   * wrong chain and calling it success.
   */
  chain: string | null
  /** The server's own word for the cluster, for anything user-facing. */
  payCluster: string | null
  connect: (w: Wallet) => Promise<void>
  disconnect: () => Promise<void>
}

const Ctx = createContext<WalletState | null>(null)

export function useWallet(): WalletState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useWallet must be used inside <WalletProvider>')
  return v
}

export default function WalletProvider({ children }: { children: ReactNode }) {
  const live = useLiveData()
  const payCluster = live.status?.payCluster ?? null
  const chain = chainFor(payCluster)

  const wallets = useSyncExternalStore(subscribeWallets, walletsSnapshot, walletsServerSnapshot)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [account, setAccount] = useState<WalletAccount | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { available, wrongChain } = useMemo(() => {
    const signers = wallets.filter(canSignAndSend)
    return {
      available: signers.filter((w) => supportsChain(w, chain)),
      // worth naming rather than hiding: an installed wallet that simply
      // isn't on this network reads as "no wallet found" otherwise
      wrongChain: signers.filter((w) => !supportsChain(w, chain)),
    }
  }, [wallets, chain])

  const connect = useCallback(async (w: Wallet) => {
    setConnecting(true)
    setError(null)
    try {
      const acct = await connectWallet(w)
      setWallet(w)
      setAccount(acct)
    } catch (e) {
      // a user closing the wallet popup is a rejection, not a failure worth
      // shouting about — but it still has to clear the spinner
      setError(e instanceof Error ? e.message : 'could not connect')
      setWallet(null)
      setAccount(null)
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    const w = wallet
    setWallet(null)
    setAccount(null)
    setError(null)
    if (w) await disconnectWallet(w)
  }, [wallet])

  // the user can switch accounts inside the wallet while we hold a reference to
  // the old one; without this the next signature would be requested from an
  // account that is no longer selected
  useEffect(() => {
    if (!wallet) return
    return onAccountChange(wallet, (a) => {
      setAccount(a)
      if (!a) setWallet(null)
    })
  }, [wallet])

  // a wallet that disappears (extension disabled, browser profile switched)
  // must not leave a connected-looking header behind
  useEffect(() => {
    if (wallet && !wallets.includes(wallet)) {
      setWallet(null)
      setAccount(null)
    }
  }, [wallets, wallet])

  const value = useMemo<WalletState>(
    () => ({
      available,
      wrongChain,
      wallet,
      account,
      address: account?.address ?? null,
      connecting,
      error,
      chain,
      payCluster,
      connect,
      disconnect,
    }),
    [available, wrongChain, wallet, account, connecting, error, chain, payCluster, connect, disconnect],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
