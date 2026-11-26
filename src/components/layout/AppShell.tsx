import { useState, type ReactNode } from 'react'
import type { AppTab } from '../../types'
import { useApp } from '../../context/AppContext'
import Icon, { type IconName } from '../ui/Icon'
import AlarmOverlay from '../ui/AlarmOverlay'
import ReminderCenterModal from '../ui/ReminderCenterModal'

type Props = {
  activeTab: AppTab
  onTabChange: (tab: AppTab) => void
  children: ReactNode
}

const navItems: { id: AppTab; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Beranda', icon: 'grid' },
  { id: 'focus', label: 'Fokus', icon: 'timer' },
  { id: 'calendar', label: 'Kalender', icon: 'calendar' },
  { id: 'wallet', label: 'Dompet', icon: 'wallet' },
]

export default function AppShell({ activeTab, onTabChange, children }: Props) {
  const { theme, toggleTheme, streakCount, upcomingRemindersCount, isRunning, storageError } = useApp()
  const [reminderModalOpen, setReminderModalOpen] = useState(false)

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="app-frame">
        <header className="topbar">
          <button
            className="brand-lockup"
            onClick={() => onTabChange('today')}
            aria-label="Kembali ke Beranda"
          >
            <span className="brand-mark">
              <Icon name="focus" size={20} />
            </span>
            <span className="brand-name">
              Fokus<span>Track</span>
            </span>
          </button>

          <div className="topbar-actions">
            <span className="local-status" title="Status konsistensi tersimpan lokal">
              <i /> {streakCount > 0 ? `${streakCount}d streak` : 'Siap mulai'}
            </span>

            <button
              className="icon-button bell-btn"
              onClick={() => setReminderModalOpen(true)}
              aria-label="Pusat Pengingat dan Alarm"
              title="Pengingat & Alarm"
            >
              <Icon name={upcomingRemindersCount > 0 ? 'bell-ring' : 'bell'} size={18} />
              {upcomingRemindersCount > 0 && (
                <span className="bell-badge">{upcomingRemindersCount}</span>
              )}
            </button>

            <button
              className="icon-button theme-toggle"
              onClick={toggleTheme}
              aria-label={`Aktifkan ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title="Ganti tema"
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
            </button>
          </div>
        </header>

        {storageError && (
          <div className="storage-warning" role="status" aria-live="polite">
            <Icon name="alert-triangle" size={16} />
            <span>FokusTrack mendeteksi masalah atau pemulihan pada penyimpanan lokal. Periksa data yang tampil dan unduh backup sebelum melanjutkan.</span>
          </div>
        )}

        <main className="main-content" key={activeTab}>
          {children}
        </main>

        <nav className="bottom-nav" aria-label="Navigasi utama">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
              aria-current={activeTab === item.id ? 'page' : undefined}
            >
              <span className="nav-icon">
                <Icon name={item.icon} size={20} />
                {item.id === 'focus' && isRunning && <span className="nav-live-dot" />}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <footer className="app-footer">
          FokusTrack <span>·</span> v4.6.0 (Final Maintenance)
        </footer>
      </div>

      <AlarmOverlay onNavigate={onTabChange} />
      <ReminderCenterModal open={reminderModalOpen} onClose={() => setReminderModalOpen(false)} />
    </div>
  )
}
