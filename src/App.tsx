import { useState } from 'react'
import { AppProvider } from './context/AppContext'
import AppShell from './components/layout/AppShell'
import DashboardPage from './features/dashboard/DashboardPage'
import FocusPage from './features/focus/FocusPage'
import CalendarPage from './features/calendar/CalendarPage'
import FinancePage from './features/finance/FinancePage'
import type { AppTab } from './types'

function getInitialTab(): AppTab {
  if (typeof window === 'undefined') return 'today'
  const param = new URLSearchParams(window.location.search).get('tab')
  if (param === 'today' || param === 'focus' || param === 'calendar' || param === 'wallet') {
    return param
  }
  return 'today'
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>(getInitialTab)

  return (
    <AppProvider>
      <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'today' && <DashboardPage onNavigate={setActiveTab} />}
        {activeTab === 'focus' && <FocusPage />}
        {activeTab === 'calendar' && <CalendarPage />}
        {activeTab === 'wallet' && <FinancePage />}
      </AppShell>
    </AppProvider>
  )
}
