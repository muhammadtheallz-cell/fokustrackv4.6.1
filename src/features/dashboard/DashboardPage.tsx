import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import type {
  ActivityItem,
  AppTab,
  ReminderMode,
  ReminderOffsetMinutes,
  TaskCategory,
  TaskPriority,
  TransactionCategory,
  TransactionType,
} from '../../types'
import {
  formatLongDate,
  formatRelativeTime,
  formatTimeHHMM,
  getGreeting,
  parseActivityDateTime,
  subtractMinutes,
  toDateKey,
} from '../../utils/date'
import { formatRupiah } from '../../utils/currency'
import Icon from '../../components/ui/Icon'
import Modal from '../../components/ui/Modal'
import { formatFocusClock } from '../../utils/focusTimer.js'

type Props = {
  onNavigate: (tab: AppTab) => void
}

const EXPENSE_CATEGORIES: TransactionCategory[] = [
  'Makan & Minum',
  'Transportasi',
  'Tagihan',
  'Belanja',
  'Hiburan',
  'Lainnya',
]

const INCOME_CATEGORIES: TransactionCategory[] = ['Gaji & Bonus', 'Tabungan', 'Lainnya']

export default function DashboardPage({ onNavigate }: Props) {
  const {
    todayKey,
    activities,
    addActivity,
    updateActivity,
    toggleActivity,
    deleteActivity,
    addTransaction,
    streakCount,
    hasStartedConsistency,
    todayFocusMinutes,
    todayGoalProgress,
    totalBalance,
    remainingDailyBudget,
    settings,
    updateSettings,
    // Global Focus Timer
    selectedPreset,
    secondsLeft,
    isRunning,
    sessionLabel,
    startPauseTimer,
    startFocusForActivity,
    // Notifications & PWA Install
    notificationPermission,
    requestNotifications,
    triggerTestAlarm,
    canInstallPwa,
    isStandalonePwa,
    installBannerDismissed,
    dismissInstallBanner,
    promptInstallPwa,
  } = useApp()

  // Activity Modal (Create / Edit with Reminder)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingActivity, setEditingActivity] = useState<ActivityItem | null>(null)
  const [title, setTitle] = useState('')
  const [activityDate, setActivityDate] = useState(todayKey)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [activityFormError, setActivityFormError] = useState('')
  const [category, setCategory] = useState<TaskCategory>('Kerja')
  const [priority, setPriority] = useState<TaskPriority>('Tinggi')
  const [notes, setNotes] = useState('')
  const [reminderEnabled, setReminderEnabled] = useState(true)
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState<ReminderOffsetMinutes>(
    settings.defaultReminderMinutes
  )
  const [reminderMode, setReminderMode] = useState<ReminderMode>(settings.defaultReminderMode)

  // Quick Transaction Modal right on Beranda
  const [txModalOpen, setTxModalOpen] = useState(false)
  const [txType, setTxType] = useState<TransactionType>('expense')
  const [txTitle, setTxTitle] = useState('')
  const [txAmount, setTxAmount] = useState('')
  const [txCategory, setTxCategory] = useState<TransactionCategory>('Makan & Minum')

  // Daily Target Modal
  const [budgetModalOpen, setBudgetModalOpen] = useState(false)
  const [budgetInput, setBudgetInput] = useState(String(settings.dailyBudgetLimit))
  const [goalInput, setGoalInput] = useState(String(settings.dailyFocusGoalMinutes))

  // Home screen install guide toggle
  const [showInstallSteps, setShowInstallSteps] = useState(false)
  const [visibleTodayLimit, setVisibleTodayLimit] = useState(50)

  const todayActivities = useMemo(
    () => activities.filter((a) => a.date === todayKey),
    [activities, todayKey]
  )
  const completedCount = todayActivities.filter((a) => a.completed).length
  const isOverBudget = remainingDailyBudget < 0
  const visibleTodayActivities = todayActivities.slice(0, visibleTodayLimit)

  // Re-evaluate on every provider refresh so the card moves forward as time passes.
  const now = new Date()
  const nextUpcomingActivity = todayActivities.find((activity) =>
    !activity.completed && parseActivityDateTime(activity.date, activity.endTime).getTime() >= now.getTime()
  ) ?? null

  function openNewTaskModal() {
    setActivityFormError('')
    setEditingActivity(null)
    const now = new Date()
    const scheduleTomorrow = now.getHours() >= 22
    const defaultDate = scheduleTomorrow
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      : now
    const nextHour = scheduleTomorrow ? '09' : String(now.getHours() + 1).padStart(2, '0')
    const afterHour = String(Number(nextHour) + 1).padStart(2, '0')
    setTitle('')
    setActivityDate(toDateKey(defaultDate))
    setStartTime(`${nextHour}:00`)
    setEndTime(`${afterHour}:00`)
    setCategory('Kerja')
    setPriority('Tinggi')
    setNotes('')
    setReminderEnabled(true)
    setReminderMinutesBefore(settings.defaultReminderMinutes)
    setReminderMode(settings.defaultReminderMode)
    setTaskModalOpen(true)
  }

  function openEditTaskModal(item: ActivityItem) {
    setActivityFormError('')
    setEditingActivity(item)
    setTitle(item.title)
    setActivityDate(item.date)
    setStartTime(item.startTime)
    setEndTime(item.endTime)
    setCategory(item.category)
    setPriority(item.priority)
    setNotes(item.notes ?? '')
    setReminderEnabled(item.reminderEnabled)
    setReminderMinutesBefore(item.reminderMinutesBefore)
    setReminderMode(item.reminderMode)
    setTaskModalOpen(true)
  }

  async function handleSaveActivity(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || title.trim().length > 120 || !activityDate) return
    if (endTime <= startTime) {
      setActivityFormError('Waktu selesai harus lebih akhir daripada waktu mulai. Jadwal lintas tengah malam belum didukung.')
      return
    }
    setActivityFormError('')

    if (reminderEnabled && notificationPermission === 'default') {
      await requestNotifications()
    }

    if (editingActivity) {
      updateActivity(editingActivity.id, {
        title: title.trim(),
        date: activityDate,
        startTime,
        endTime,
        category,
        priority,
        notes: notes.trim() || undefined,
        reminderEnabled,
        reminderMinutesBefore,
        reminderMode,
        snoozedUntil: undefined,
      })
    } else {
      addActivity({
        title: title.trim(),
        date: activityDate,
        startTime,
        endTime,
        category,
        priority,
        completed: false,
        notes: notes.trim() || undefined,
        reminderEnabled,
        reminderMinutesBefore,
        reminderMode,
      })
    }
    setTaskModalOpen(false)
  }

  function openQuickTx(type: TransactionType) {
    setTxType(type)
    setTxCategory(type === 'expense' ? 'Makan & Minum' : 'Gaji & Bonus')
    setTxTitle('')
    setTxAmount('')
    setTxModalOpen(true)
  }

  function handleSaveQuickTx(e: React.FormEvent) {
    e.preventDefault()
    const amountNum = Number(txAmount)
    if (!txTitle.trim() || txTitle.trim().length > 120 || !Number.isSafeInteger(amountNum) || amountNum <= 0) return
    addTransaction({
      title: txTitle.trim(),
      amount: amountNum,
      type: txType,
      category: txCategory,
      date: todayKey,
    })
    setTxModalOpen(false)
  }

  function handleSaveTargets(e: React.FormEvent) {
    e.preventDefault()
    const parsedBudget = Number(budgetInput)
    const parsedGoal = Number(goalInput)
    if (!Number.isSafeInteger(parsedBudget) || parsedBudget < 0) return
    if (!Number.isInteger(parsedGoal) || parsedGoal < 10 || parsedGoal > 720) return
    updateSettings({
      dailyBudgetLimit: parsedBudget,
      dailyFocusGoalMinutes: parsedGoal,
    })
    setBudgetModalOpen(false)
  }

  const timerDigits = formatFocusClock(secondsLeft, selectedPreset.minutes >= 60)
  const isTimerActiveOrPaused = isRunning || (secondsLeft > 0 && secondsLeft !== selectedPreset.minutes * 60)

  return (
    <div className="page-stack">
      {/* Header Greeting */}
      <section className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">{formatLongDate()}</p>
          <h1>
            {getGreeting()}, <span className="gradient-text">tetap fokus.</span>
          </h1>
          <p className="heading-subtitle">Semua jadwal, alarm pengingat, fokus &amp; keuangan ada di beranda.</p>
        </div>
        <button
          className="day-chip interactive-chip"
          onClick={() => {
            setBudgetInput(String(settings.dailyBudgetLimit))
            setGoalInput(String(settings.dailyFocusGoalMinutes))
            setBudgetModalOpen(true)
          }}
          title="Atur target harian"
        >
          <span className="day-chip-dot" /> Target Harian
        </button>
      </section>

      {/* Install to Phone Home Screen Card */}
      {!isStandalonePwa && !installBannerDismissed && (
        <section className="install-banner">
          <div className="install-banner-main">
            <span className="install-icon">
              <Icon name="smartphone" size={19} />
            </span>
            <div className="install-copy">
              <strong>Tampilkan FokusTrack di Layar Beranda HP</strong>
              <span>Akses sekali ketuk seperti aplikasi native &amp; alarm pengingat lebih optimal.</span>
            </div>
            <button
              type="button"
              className="ghost-icon-btn"
              onClick={dismissInstallBanner}
              aria-label="Sembunyikan info pasang beranda"
              title="Tutup"
            >
              <Icon name="x" size={15} />
            </button>
          </div>
          <div className="install-actions">
            {canInstallPwa ? (
              <button
                type="button"
                className="primary-button compact-btn"
                onClick={() => void promptInstallPwa()}
              >
                <Icon name="download" size={15} /> Pasang di Beranda Sekarang
              </button>
            ) : (
              <button
                type="button"
                className="secondary-button compact-btn"
                onClick={() => setShowInstallSteps((prev) => !prev)}
              >
                <Icon name="smartphone" size={15} />{' '}
                {showInstallSteps ? 'Sembunyikan Panduan' : 'Cara Tambah ke Layar Beranda'}
              </button>
            )}
          </div>
          {showInstallSteps && !canInstallPwa && (
            <p className="install-steps-hint">
              <strong>Android (Chrome):</strong> Ketuk ikon menu <strong>⋮</strong> di pojok kanan atas → pilih{' '}
              <strong>&ldquo;Tambahkan ke Layar utama&rdquo;</strong> atau <strong>&ldquo;Instal aplikasi&rdquo;</strong>.
              <br />
              <strong>iPhone (Safari):</strong> Ketuk ikon <strong>Bagikan (Share)</strong> → pilih{' '}
              <strong>&ldquo;Tambah ke Layar Utama&rdquo;</strong>.
            </p>
          )}
        </section>
      )}

      {/* Notification Permission Prompt Banner (if not yet granted) */}
      {notificationPermission === 'default' && (
        <section className="notif-prompt-bar">
          <div className="notif-prompt-left">
            <Icon name="bell-ring" size={17} />
            <span>Aktifkan notifikasi &amp; alarm agar setiap kegiatan berbunyi tepat waktu.</span>
          </div>
          <button
            type="button"
            className="primary-button compact-btn"
            onClick={() => void requestNotifications()}
          >
            Aktifkan
          </button>
        </section>
      )}

      {/* Daily Discipline & Streak Hero Card (Fixed: starts strictly at 0 before consistency begins) */}
      <section className="streak-card">
        <div className="streak-glow" />
        <div className="streak-content">
          <div className="streak-topline">
            <span className="streak-icon">
              <Icon name="target" size={17} />
            </span>
            <span>DAILY DISCIPLINE</span>
            <span className="streak-status-pill">
              {streakCount > 0 ? 'Konsistensi Aktif' : 'Belum dimulai'}
            </span>
          </div>
          <div className="streak-number-row">
            <strong>{streakCount}</strong>
            <span className="streak-unit">hari beruntun</span>
          </div>
          <p className="streak-copy">
            {hasStartedConsistency ? (
              <>
                Fokus hari ini: <strong>{todayFocusMinutes} mnt</strong> dari target{' '}
                {settings.dailyFocusGoalMinutes} mnt · {completedCount}/{todayActivities.length} tugas selesai
              </>
            ) : (
              <>
                Belum ada sesi fokus atau tugas selesai. Selesaikan <strong>1 sesi fokus</strong> atau{' '}
                <strong>1 tugas</strong> untuk memulai streak hari ke-1!
              </>
            )}
          </p>
          <div
            className="streak-progress"
            role="progressbar"
            aria-valuenow={todayGoalProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${Math.min(100, todayGoalProgress)}%` }} />
          </div>
          <div className="streak-bottom">
            <span>Progres disiplin hari ini: {todayGoalProgress}%</span>
            <button className="hero-pill-btn" onClick={() => onNavigate('focus')}>
              <Icon name="play" size={12} /> {isRunning ? 'Lihat Timer Aktif' : 'Mulai Sesi Fokus'}
            </button>
          </div>
        </div>
        <div className="streak-orbit orbit-one" />
        <div className="streak-orbit orbit-two" />
        <div className="streak-symbol">
          <Icon name="sparkles" size={40} />
        </div>
      </section>

      {/* Live Focus Mini-Bar on Beranda when timer is active or paused */}
      {isTimerActiveOrPaused && (
        <section className="surface-card live-timer-bar">
          <div className="live-timer-info" onClick={() => onNavigate('focus')}>
            <span className={`live-pulse ${isRunning ? 'running' : ''}`} />
            <div>
              <span className="card-kicker">{isRunning ? 'TIMER FOKUS BERJALAN' : 'TIMER DIJEDA'}</span>
              <strong className="live-timer-title">{sessionLabel}</strong>
            </div>
          </div>
          <div className="live-timer-controls">
            <span className="live-timer-digits">
              {timerDigits}
            </span>
            <button
              type="button"
              className="primary-button compact-btn"
              onClick={startPauseTimer}
              aria-label={isRunning ? 'Jeda timer' : 'Lanjutkan timer'}
            >
              <Icon name={isRunning ? 'pause' : 'play'} size={14} />
            </button>
          </div>
        </section>
      )}

      {/* Quick Action Bar right on Beranda for effortless 1-tap usage */}
      <section className="quick-dock" aria-label="Aksi cepat beranda">
        <button type="button" className="quick-dock-btn" onClick={openNewTaskModal}>
          <span className="quick-dock-icon violet">
            <Icon name="calendar-plus" size={18} />
          </span>
          <span>+ Jadwal</span>
        </button>

        <button
          type="button"
          className="quick-dock-btn"
          onClick={() => startFocusForActivity(nextUpcomingActivity?.title || 'Sesi Fokus Mendalam', onNavigate)}
        >
          <span className="quick-dock-icon mint">
            <Icon name="play" size={18} />
          </span>
          <span>{isRunning ? 'Buka Fokus' : isTimerActiveOrPaused ? 'Lanjutkan Fokus' : 'Mulai Fokus'}</span>
        </button>

        <button type="button" className="quick-dock-btn" onClick={() => openQuickTx('expense')}>
          <span className="quick-dock-icon coral">
            <Icon name="arrow-up-right" size={18} />
          </span>
          <span>- Keluar</span>
        </button>

        <button type="button" className="quick-dock-btn" onClick={() => openQuickTx('income')}>
          <span className="quick-dock-icon amber">
            <Icon name="arrow-down-left" size={18} />
          </span>
          <span>+ Masuk</span>
        </button>
      </section>

      {/* Next Reminder & Upcoming Schedule Card on Beranda */}
      {nextUpcomingActivity && (
        <section className="surface-card next-reminder-card">
          <div className="next-reminder-top">
            <span className="next-reminder-badge">
              <Icon name="bell-ring" size={13} /> PENGINGAT BERIKUTNYA
            </span>
            <span className="next-reminder-countdown">
              {now >= parseActivityDateTime(nextUpcomingActivity.date, nextUpcomingActivity.startTime) &&
              now < parseActivityDateTime(nextUpcomingActivity.date, nextUpcomingActivity.endTime)
                ? 'Sedang berlangsung'
                : formatRelativeTime(
                    parseActivityDateTime(nextUpcomingActivity.date, nextUpcomingActivity.startTime),
                    now
                  )}
            </span>
          </div>
          <div className="next-reminder-body">
            <div>
              <h3>{nextUpcomingActivity.title}</h3>
              <p>
                Pukul {nextUpcomingActivity.startTime} – {nextUpcomingActivity.endTime} ·{' '}
                {nextUpcomingActivity.reminderEnabled
                  ? `Alarm ${formatTimeHHMM(
                      subtractMinutes(
                        parseActivityDateTime(nextUpcomingActivity.date, nextUpcomingActivity.startTime),
                        nextUpcomingActivity.reminderMinutesBefore
                      )
                    )}`
                  : 'Tanpa alarm'}
              </p>
            </div>
            <button
              type="button"
              className="primary-button compact-btn"
              onClick={() => startFocusForActivity(nextUpcomingActivity.title, onNavigate)}
            >
              <Icon name="play" size={13} /> Fokus
            </button>
          </div>
        </section>
      )}

      {/* Financial Summary Cards */}
      <section className="summary-grid">
        <article
          className="surface-card summary-card clickable-card"
          onClick={() => {
            setBudgetInput(String(settings.dailyBudgetLimit))
            setGoalInput(String(settings.dailyFocusGoalMinutes))
            setBudgetModalOpen(true)
          }}
        >
          <div className="card-top">
            <span className={`summary-icon ${isOverBudget ? 'coral' : 'mint'}`}>
              <Icon name="wallet" size={18} />
            </span>
            <span className="card-kicker">ANGGARAN HARI INI</span>
          </div>
          <div className={`summary-value compact ${isOverBudget ? 'text-coral' : ''}`}>
            {settings.hideBalance ? 'Rp ••••••' : formatRupiah(remainingDailyBudget, true)}
          </div>
          <p className="summary-caption">
            {isOverBudget ? 'Melebihi batas harian' : `Dari batas ${formatRupiah(settings.dailyBudgetLimit, true)}`}
          </p>
          <div className="card-footnote">
            <span className={`tiny-dot ${isOverBudget ? 'coral-dot' : 'mint-dot'}`} /> Ketuk untuk ubah batas
          </div>
        </article>

        <article className="surface-card summary-card clickable-card" onClick={() => onNavigate('wallet')}>
          <div className="card-top">
            <span className="summary-icon violet">
              <Icon name="chart" size={18} />
            </span>
            <span className="card-kicker">TOTAL SALDO</span>
          </div>
          <div className="summary-value compact">
            {settings.hideBalance ? 'Rp ••••••' : formatRupiah(totalBalance, true)}
          </div>
          <p className="summary-caption">Saldo bersih dompet</p>
          <div className="card-footnote">
            <span className="tiny-dot violet-dot" /> Buka rincian dompet
          </div>
        </article>
      </section>

      {/* Today's Activities & Reminders List */}
      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RITME &amp; PENGINGAT HARIAN</p>
            <h2>Aktivitas hari ini</h2>
          </div>
          <div className="inline-actions">
            <button className="text-button" onClick={openNewTaskModal}>
              <Icon name="plus" size={15} /> Tambah
            </button>
            <button className="text-button" onClick={() => onNavigate('calendar')}>
              Kalender <Icon name="arrow-up-right" size={15} />
            </button>
          </div>
        </div>

        {todayActivities.length === 0 ? (
          <div className="surface-card empty-activity">
            <div className="empty-illustration">
              <span className="empty-ring ring-a" />
              <span className="empty-ring ring-b" />
              <span className="empty-center">
                <Icon name="bell-ring" size={24} />
              </span>
            </div>
            <h3>Hari ini masih terbuka</h3>
            <p>
              Buat jadwal pertamamu dan atur pengingat agar kegiatan lebih mudah dipantau.
            </p>
            <div className="empty-cta-row">
              <button className="primary-button" onClick={openNewTaskModal}>
                <Icon name="plus" size={17} /> Buat Jadwal + Alarm
              </button>
              <button className="secondary-button" onClick={triggerTestAlarm}>
                <Icon name="zap" size={16} /> Tes Alarm
              </button>
            </div>
          </div>
        ) : (
          <div className="item-list">
            {visibleTodayActivities.map((item) => {
              const startDt = parseActivityDateTime(item.date, item.startTime)
              const remindDt = subtractMinutes(startDt, item.reminderMinutesBefore)
              return (
                <div key={item.id} className={`surface-card task-row ${item.completed ? 'completed' : ''}`}>
                  <button
                    className={`check-circle ${item.completed ? 'checked' : ''}`}
                    onClick={() => toggleActivity(item.id)}
                    aria-label={item.completed ? 'Tandai belum selesai' : 'Tandai selesai'}
                  >
                    {item.completed && <Icon name="check" size={14} />}
                  </button>
                  <div className="task-info" onClick={() => openEditTaskModal(item)}>
                    <div className="task-title-line">
                      <span className="task-title">{item.title}</span>
                      <span className={`badge badge-${item.priority.toLowerCase()}`}>{item.priority}</span>
                    </div>
                    <div className="task-meta">
                      <span>
                        <Icon name="clock" size={12} /> {item.startTime} – {item.endTime}
                      </span>
                      <span className="category-tag">{item.category}</span>
                      {item.reminderEnabled && (
                        <span className="reminder-chip">
                          <Icon name="bell" size={11} /> {formatTimeHHMM(remindDt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="row-actions">
                    <button
                      className="ghost-icon-btn"
                      onClick={() => openEditTaskModal(item)}
                      aria-label="Edit jadwal & pengingat"
                      title="Edit"
                    >
                      <Icon name="edit" size={15} />
                    </button>
                    <button
                      className="ghost-icon-btn"
                      onClick={() => deleteActivity(item.id)}
                      aria-label="Hapus aktivitas"
                      title="Hapus"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {visibleTodayLimit < todayActivities.length && (
          <button type="button" className="secondary-button full-width" onClick={() => setVisibleTodayLimit((limit) => limit + 50)}>
            Muat 50 aktivitas berikutnya ({todayActivities.length - visibleTodayLimit} tersisa)
          </button>
        )}
      </section>

      {/* Activity Create / Edit Modal with Full Reminder & Alarm Controls */}
      <Modal
        open={taskModalOpen}
        title={editingActivity ? 'Edit Aktivitas & Pengingat' : 'Jadwal Baru + Pengingat'}
        subtitle="Atur waktu kegiatan, notifikasi, dan mode pengingat"
        onClose={() => setTaskModalOpen(false)}
      >
        <form className="form-stack" onSubmit={handleSaveActivity}>
          <label className="field-label">
            <span>Nama Kegiatan</span>
            <input
              type="text"
              className="text-input"
              placeholder="Contoh: Belajar Algoritma / Meeting Klien"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label className="field-label">
            <span>Tanggal Kegiatan</span>
            <input
              type="date"
              className="text-input"
              value={activityDate}
              onChange={(e) => setActivityDate(e.target.value)}
              required
            />
          </label>

          <div className="form-row-2">
            <label className="field-label">
              <span>Waktu Mulai</span>
              <input
                type="time"
                className="text-input"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </label>
            <label className="field-label">
              <span>Waktu Selesai</span>
              <input
                type="time"
                className="text-input"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </label>
          </div>
          {activityFormError && <p className="form-error" role="alert">{activityFormError}</p>}

          <div className="form-row-2">
            <label className="field-label">
              <span>Kategori</span>
              <select
                className="text-input"
                value={category}
                onChange={(e) => setCategory(e.target.value as TaskCategory)}
              >
                <option value="Kerja">Kerja</option>
                <option value="Belajar">Belajar</option>
                <option value="Kesehatan">Kesehatan</option>
                <option value="Pribadi">Pribadi</option>
              </select>
            </label>
            <label className="field-label">
              <span>Prioritas</span>
              <select
                className="text-input"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                <option value="Tinggi">Tinggi</option>
                <option value="Sedang">Sedang</option>
                <option value="Rendah">Rendah</option>
              </select>
            </label>
          </div>

          {/* Reminder & Alarm Section */}
          <div className="reminder-box-form">
            <div className="reminder-box-header">
              <span className="reminder-box-title">
                <Icon name="bell-ring" size={15} /> Pengingat &amp; Alarm
              </span>
              <button
                type="button"
                className={`pill-toggle ${reminderEnabled ? 'on' : ''}`}
                onClick={() => setReminderEnabled((prev) => !prev)}
              >
                {reminderEnabled ? 'Aktif' : 'Nonaktif'}
              </button>
            </div>

            {reminderEnabled && (
              <div className="form-row-2">
                <label className="field-label">
                  <span>Kapan Diingatkan</span>
                  <select
                    className="text-input compact-input"
                    value={reminderMinutesBefore}
                    onChange={(e) =>
                      setReminderMinutesBefore(Number(e.target.value) as ReminderOffsetMinutes)
                    }
                  >
                    <option value={0}>Tepat saat mulai</option>
                    <option value={5}>5 menit sebelum</option>
                    <option value={10}>10 menit sebelum</option>
                    <option value={15}>15 menit sebelum</option>
                    <option value={30}>30 menit sebelum</option>
                    <option value={60}>1 jam sebelum</option>
                  </select>
                </label>

                <label className="field-label">
                  <span>Jenis Pengingat</span>
                  <select
                    className="text-input compact-input"
                    value={reminderMode}
                    onChange={(e) => setReminderMode(e.target.value as ReminderMode)}
                  >
                    <option value="alarm">Alarm + Notifikasi</option>
                    <option value="chime">Nada Lembut + Notif</option>
                    <option value="silent">Visual Saja</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          <label className="field-label">
            <span>Catatan (Opsional)</span>
            <input
              type="text"
              className="text-input"
              placeholder="Detail lokasi, link, atau target"
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <button type="submit" className="primary-button full-width">
            <Icon name="check" size={16} /> {editingActivity ? 'Simpan Perubahan' : 'Simpan Jadwal & Alarm'}
          </button>
        </form>
      </Modal>

      {/* Quick Transaction Modal on Beranda */}
      <Modal
        open={txModalOpen}
        title={txType === 'expense' ? 'Catat Pengeluaran Cepat' : 'Catat Pemasukan Cepat'}
        subtitle="Langsung memperbarui anggaran hari ini & total saldo"
        onClose={() => setTxModalOpen(false)}
      >
        <form className="form-stack" onSubmit={handleSaveQuickTx}>
          <div className="segmented-control">
            <button
              type="button"
              className={txType === 'expense' ? 'active' : ''}
              onClick={() => {
                setTxType('expense')
                setTxCategory('Makan & Minum')
              }}
            >
              Pengeluaran
            </button>
            <button
              type="button"
              className={txType === 'income' ? 'active' : ''}
              onClick={() => {
                setTxType('income')
                setTxCategory('Gaji & Bonus')
              }}
            >
              Pemasukan
            </button>
          </div>

          <label className="field-label">
            <span>Nominal (Rp)</span>
            <input
              type="number"
              min={100}
              max={9007199254740991}
              step={100}
              className="text-input"
              placeholder="Contoh: 25000"
              value={txAmount}
              onChange={(e) => setTxAmount(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label className="field-label">
            <span>Keterangan</span>
            <input
              type="text"
              className="text-input"
              placeholder="Contoh: Makan siang / Bonus proyek"
              value={txTitle}
              maxLength={120}
              onChange={(e) => setTxTitle(e.target.value)}
              required
            />
          </label>

          <label className="field-label">
            <span>Kategori</span>
            <select
              className="text-input"
              value={txCategory}
              onChange={(e) => setTxCategory(e.target.value as TransactionCategory)}
            >
              {(txType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className="primary-button full-width">
            <Icon name="check" size={16} /> Simpan Transaksi
          </button>
        </form>
      </Modal>

      {/* Daily Targets Modal */}
      <Modal
        open={budgetModalOpen}
        title="Target Harian"
        subtitle="Sesuaikan batas pengeluaran & target fokus harian"
        onClose={() => setBudgetModalOpen(false)}
      >
        <form className="form-stack" onSubmit={handleSaveTargets}>
          <label className="field-label">
            <span>Batas Pengeluaran Harian (Rp)</span>
            <input
              type="number"
              min={0}
              step={5000}
              className="text-input"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              required
            />
          </label>
          <label className="field-label">
            <span>Target Fokus Harian (Menit)</span>
            <input
              type="number"
              min={10}
              max={720}
              step={5}
              className="text-input"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="primary-button full-width">
            <Icon name="check" size={16} /> Simpan Pengaturan
          </button>
        </form>
      </Modal>
    </div>
  )
}
