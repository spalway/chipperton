import { NAV, type View } from '../data'
import ConnectWallet from './ConnectWallet'

type Props = {
  view: View
  go: (v: View) => void
}

export default function TopNav({ view, go }: Props) {
  return (
    <nav className="topnav">
      <div className="in">
        <div className="brand">
          <i />
          chipperton
        </div>
        <div className="navlinks">
          {NAV.map((n) => (
            <a
              key={n.id}
              className={`nl${view === n.id ? ' on' : ''}`}
              href="#"
              onClick={(e) => {
                e.preventDefault()
                go(n.id)
              }}
            >
              {n.label}
            </a>
          ))}
        </div>
        <ConnectWallet />
      </div>
    </nav>
  )
}
