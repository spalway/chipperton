import { useCallback, useState } from 'react'
import TopNav from './components/TopNav'
import PageHeader from './components/PageHeader'
import Footer from './components/Footer'
import Overview from './pages/Overview'
import Shop from './pages/Shop'
import Activity from './pages/Activity'
import Docs from './pages/Docs'
import Jobs from './pages/Jobs'
import { Costs, HistoryPage, DecisionsPage } from './pages/Receipts'
import LiveDataProvider from './LiveDataProvider'
import WalletProvider from './WalletProvider'
import type { View } from './data'

export default function App() {
  return (
    // WalletProvider sits inside, because the chain it signs on comes from the
    // server's payCluster — the wallet layer must not decide that for itself
    <LiveDataProvider>
      <WalletProvider>
        <Shell />
      </WalletProvider>
    </LiveDataProvider>
  )
}

function Shell() {
  const [view, setView] = useState<View>('overview')
  const [jobId, setJobId] = useState<string | null>(null)

  const go = useCallback((v: View) => {
    setView(v)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  const openJob = useCallback((id: string | null) => {
    setJobId(id)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  return (
    <>
      <TopNav view={view} go={go} />
      <div className="page">
        <PageHeader />
        {view === 'overview' && <Overview go={go} openJob={openJob} />}
        {view === 'shop' && <Shop />}
        {view === 'activity' && <Activity />}
        {view === 'docs' && <Docs go={go} />}
        {view === 'jobs' && <Jobs jobId={jobId} go={go} openJob={openJob} />}
        {view === 'costs' && <Costs go={go} />}
        {view === 'history' && <HistoryPage go={go} />}
        {view === 'decisions' && <DecisionsPage go={go} />}
        <Footer go={go} />
      </div>
    </>
  )
}
