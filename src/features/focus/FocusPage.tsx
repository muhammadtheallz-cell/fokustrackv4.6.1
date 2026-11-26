import { useState } from 'react'
import { FOCUS_PRESETS, useApp } from '../../context/AppContext'
import Icon from '../../components/ui/Icon'
import { formatFocusClock, formatFocusDurationLabel, getCustomDurationMinutes } from '../../utils/focusTimer.js'

export default function FocusPage() {
  const {
    todayKey,
    activities,
    focusSessions,
    todayFocusMinutes,
    settings,
    updateSettings,
    selectedPreset,
    secondsLeft,
    isRunning,
    sessionLabel,
    setSessionLabel,
    justFinished,
    selectPreset,
    startPauseTimer,
    resetTimer,
    completeTimerNow,
  } = useApp()

  const [customPanelOpen, setCustomPanelOpen] = useState(false)
  const [customHours, setCustomHours] = useState('1')
  const [customMinutes, setCustomMinutes] = useState('0')
  const [customError, setCustomError] = useState('')
  const [visibleSessionLimit, setVisibleSessionLimit] = useState(50)
  const isCustomPreset = selectedPreset.id.startsWith('custom-')

  function openCustomDuration() {
    if (isCustomPreset) {
      setCustomHours(String(Math.floor(selectedPreset.minutes / 60)))
      setCustomMinutes(String(selectedPreset.minutes % 60))
    }
    setCustomError('')
    setCustomPanelOpen(true)
  }

  function applyCustomDuration() {
    const durationMinutes = getCustomDurationMinutes(Number(customHours), Number(customMinutes))
    if (durationMinutes === null) {
      setCustomError('Atur durasi dari 1 menit hingga maksimal 12 jam.')
      return
    }

    const durationLabel = formatFocusDurationLabel(durationMinutes)
    selectPreset({
      id: `custom-${durationMinutes}`,
      label: `Custom ${durationLabel}`,
      minutes: durationMinutes,
      isBreak: false,
    })
    setCustomPanelOpen(false)
    setCustomError('')
  }

  function choosePreset(preset: (typeof FOCUS_PRESETS)[number]) {
    selectPreset(preset)
    setCustomPanelOpen(false)
    setCustomError('')
  }

  const totalSeconds = selectedPreset.minutes * 60
  const progress = totalSeconds > 0 ? ((totalSeconds - secondsLeft) / totalSeconds) * 100 : 0
  const radius = 94
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (progress / 100) * circumference

  const hasHoursInTimer = selectedPreset.minutes >= 60
  const timerDigits = formatFocusClock(secondsLeft, hasHoursInTimer)
  const todaySessions = focusSessions.filter((s) => s.date === todayKey)
  const visibleTodaySessions = todaySessions.slice(0, visibleSessionLimit)
  const todayPendingTasks = activities.filter((a) => a.date === todayKey && !a.completed)

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">DEEP WORK TIMER</p>
          <h1>
            Ruang <span className="gradient-text">fokus.</span>
          </h1>
          <p className="heading-subtitle">Waktu fokus tetap akurat saat berpindah tab dan dipulihkan setelah aplikasi dibuka kembali.</p>
        </div>
        <button
          className="icon-button"
          onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
          title={settings.soundEnabled ? 'Suara notifikasi aktif' : 'Suara notifikasi nonaktif'}
          aria-label="Toggle suara timer"
        >
          <Icon name={settings.soundEnabled ? 'volume-2' : 'volume-x'} size={19} />
        </button>
      </section>

      <section className="surface-card focus-timer-card">
        <div className="preset-pills" role="tablist" aria-label="Pilih mode timer">
          {FOCUS_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="tab"
              aria-selected={selectedPreset.id === preset.id}
              className={`preset-pill ${selectedPreset.id === preset.id ? 'active' : ''}`}
              disabled={isRunning}
              onClick={() => choosePreset(preset)}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={isCustomPreset}
            className={`preset-pill custom-preset-pill ${isCustomPreset ? 'active' : ''}`}
            disabled={isRunning}
            onClick={openCustomDuration}
          >
            {isCustomPreset ? `Custom · ${formatFocusDurationLabel(selectedPreset.minutes)}` : 'Custom'}
          </button>
        </div>

        {customPanelOpen && (
          <div className="custom-duration-panel" aria-label="Pengaturan durasi fokus">
            <div className="custom-duration-heading">
              <div>
                <strong>Atur durasi fokus</strong>
                <span>Pilih waktu sesuai kebutuhanmu</span>
              </div>
              <span className="custom-duration-limit">Maks. 12 jam</span>
            </div>
            <div className="custom-duration-fields">
              <label className="custom-duration-field" htmlFor="focus-custom-hours">
                <span>Jam</span>
                <input
                  id="focus-custom-hours"
                  className="text-input"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="12"
                  step="1"
                  value={customHours}
                  disabled={isRunning}
                  onChange={(event) => setCustomHours(event.target.value)}
                />
              </label>
              <label className="custom-duration-field" htmlFor="focus-custom-minutes">
                <span>Menit</span>
                <input
                  id="focus-custom-minutes"
                  className="text-input"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="59"
                  step="1"
                  value={customMinutes}
                  disabled={isRunning}
                  onChange={(event) => setCustomMinutes(event.target.value)}
                />
              </label>
            </div>
            <p className="custom-duration-hint">Contoh: 1 jam 30 menit. Durasi minimum 1 menit.</p>
            {customError && <p className="custom-duration-error" role="alert">{customError}</p>}
            <div className="custom-duration-actions">
              <button type="button" className="secondary-button compact-btn" onClick={() => setCustomPanelOpen(false)}>
                Batal
              </button>
              <button type="button" className="primary-button compact-btn" onClick={applyCustomDuration} disabled={isRunning}>
                Gunakan Durasi
              </button>
            </div>
          </div>
        )}

        <div className="timer-ring-wrap">
          <svg className="timer-svg" viewBox="0 0 220 220" aria-hidden="true">
            <circle className="timer-track" cx="110" cy="110" r={radius} />
            <circle
              className={`timer-progress ${selectedPreset.isBreak ? 'break-mode' : ''}`}
              cx="110"
              cy="110"
              r={radius}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          <div className="timer-readout">
            <span className="timer-mode-badge">{selectedPreset.isBreak ? 'WAKTU ISTIRAHAT' : 'SESI FOKUS'}</span>
            <div className={`timer-digits ${hasHoursInTimer ? 'has-hours' : ''}`} aria-live="off">
              {timerDigits}
            </div>
            <span className="timer-sub">
              {isRunning ? 'Tetap hadir di momen ini...' : secondsLeft === 0 ? 'Sesi selesai' : secondsLeft < totalSeconds ? 'Sesi dijeda' : 'Siap dimulai'}
            </span>
          </div>
        </div>

        {!selectedPreset.isBreak && (
          <div className="focus-target-box">
            <input
              type="text"
              className="text-input compact-input"
              value={sessionLabel}
              maxLength={120}
              onChange={(e) => setSessionLabel(e.target.value)}
              placeholder="Apa yang sedang kamu kerjakan?"
              aria-label="Nama sesi fokus"
            />
            {todayPendingTasks.length > 0 && (
              <div className="quick-task-chips">
                {todayPendingTasks.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="mini-chip"
                    onClick={() => setSessionLabel(t.title)}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {justFinished && (
          <div className="toast-banner">
            <Icon name="sparkles" size={16} />
            {selectedPreset.isBreak ? 'Waktu istirahat selesai. Siap kembali fokus?' : 'Sesi tercatat! Streak konsistensimu diperbarui.'}
          </div>
        )}

        <div className="timer-controls">
          <button className="icon-button" onClick={resetTimer} aria-label="Reset timer" title="Reset">
            <Icon name="rotate-ccw" size={18} />
          </button>
          <button className="primary-button timer-main-btn" onClick={startPauseTimer}>
            <Icon name={isRunning ? 'pause' : 'play'} size={18} />
            {isRunning
              ? 'Jeda'
              : secondsLeft === 0
                ? 'Ulangi'
                : secondsLeft < totalSeconds
                  ? 'Lanjutkan Fokus'
                  : 'Mulai Fokus'}
          </button>
          {!selectedPreset.isBreak && (
            <button
              className="icon-button"
              disabled={totalSeconds - secondsLeft < 60}
              onClick={completeTimerNow}
              aria-label="Selesaikan & catat sesi sekarang"
              title="Catat selesai sekarang"
            >
              <Icon name="check" size={18} />
            </button>
          )}
        </div>
      </section>

      <section className="summary-grid">
        <article className="surface-card summary-card compact-stat">
          <div className="card-top">
            <span className="summary-icon violet">
              <Icon name="clock" size={18} />
            </span>
            <span className="card-kicker">FOKUS HARI INI</span>
          </div>
          <div className="summary-value compact">{todayFocusMinutes} mnt</div>
          <p className="summary-caption">Target: {settings.dailyFocusGoalMinutes} mnt</p>
        </article>
        <article className="surface-card summary-card compact-stat">
          <div className="card-top">
            <span className="summary-icon mint">
              <Icon name="target" size={18} />
            </span>
            <span className="card-kicker">SESI SELESAI</span>
          </div>
          <div className="summary-value compact">{todaySessions.length} sesi</div>
          <p className="summary-caption">Tercatat hari ini</p>
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RIWAYAT HARI INI</p>
            <h2>Log sesi fokus</h2>
          </div>
          <span className="muted-pill">{todaySessions.length} sesi</span>
        </div>

        {todaySessions.length === 0 ? (
          <div className="surface-card empty-activity small-empty">
            <p>Belum ada sesi fokus yang selesai hari ini. Pilih durasi yang nyaman dan mulai sesi pertamamu.</p>
          </div>
        ) : (
          <div className="item-list">
            {visibleTodaySessions.map((session) => (
              <div key={session.id} className="surface-card task-row">
                <span className="summary-icon violet">
                  <Icon name="check" size={16} />
                </span>
                <div className="task-info">
                  <div className="task-title-line">
                    <span className="task-title">{session.label}</span>
                    <span className="category-tag">{session.minutes} menit</span>
                  </div>
                  <div className="task-meta">
                    <span>
                      Selesai pukul{' '}
                      {new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(
                        new Date(session.completedAt)
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {visibleSessionLimit < todaySessions.length && (
          <button type="button" className="secondary-button full-width" onClick={() => setVisibleSessionLimit((limit) => limit + 50)}>
            Muat 50 sesi berikutnya ({todaySessions.length - visibleSessionLimit} tersisa)
          </button>
        )}
      </section>
    </div>
  )
}
