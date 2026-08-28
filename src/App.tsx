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
import type { View } from './data'

export default function App() {
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
        {view === 'activity' && <Activity go={go} openJob={openJob} />}
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
