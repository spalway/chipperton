import { useLiveData } from '../useLiveData'

/**
 * The X account, next to Connect.
 *
 * Handle and URL both come from the server. Neither is hardcoded, and the whole
 * control disappears when the server has no handle — a dead href promising an
 * account that does not exist is the "agent registry →" bug again.
 */
export default function XLink() {
  const live = useLiveData()
  const url = live.status?.twitterUrl
  const handle = live.status?.twitterHandle

  if (!url || !handle) return null

  return (
    <a className="xlink" href={url} target="_blank" rel="noreferrer">
      {/* the X mark, inline so it needs no network request and inherits colour */}
      <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
        />
      </svg>
      {/* handle arrives without the @ so the glyph is ours */}@{handle}
    </a>
  )
}
