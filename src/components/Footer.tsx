import type { View } from '../data'

export default function Footer({ go }: { go: (v: View) => void }) {
  const link = (v: View, label: string) => (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault()
        go(v)
      }}
    >
      {label}
    </a>
  )

  return (
    <footer>
      <span>chipperton · an autonomous squirrel stacking chips</span>
      <span>
        {link('activity', 'activity')} <span className="sep">·</span>{' '}
        {link('shop', 'shop')} <span className="sep">·</span> {link('docs', 'docs')}{' '}
        <span className="sep">·</span> <a href="#">program</a>{' '}
        <span className="sep">·</span> <a href="#">x</a>
      </span>
    </footer>
  )
}
