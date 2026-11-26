import { useApp } from '../../context/AppContext'
import type { AppTab } from '../../types'
import Icon from './Icon'

interface Props {
  onNavigate: (tab: AppTab) => void
}

export default function AlarmOverlay({ onNavigate }: Props) {
  const { activeAlarm, snoozeActiveAlarm, dismissActiveAlarm, startFocusForActivity } = useApp()

  if (!activeAlarm) return null

  const { activity, isSnoozed } = activeAlarm
  const isTest = activity.id === 'test-alarm'

  const timeLabel = isSnoozed
    ? 'Pengingat tunda (Snooze 5 menit)'
    : activity.reminderMinutesBefore === 0
      ? 'Kegiatan dimulai sekarang!'
      : `Dimulai ${activity.reminderMinutesBefore} menit lagi`

  function handleStartFocus() {
    const title = activity.title
    dismissActiveAlarm(false)
    startFocusForActivity(title, onNavigate)
  }

  return (
    <div className="alarm-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="alarm-dialog-title">
      <div className="alarm-card">
        <div className="alarm-pulse-ring">
          <div className="alarm-bell-circle">
            <Icon name="bell-ring" size={30} />
          </div>
        </div>

        <span className="alarm-kicker">PENGINGAT KEGIATAN</span>
        <h2 id="alarm-dialog-title" className="alarm-title">
          {activity.title}
        </h2>
        <p className="alarm-time-pill">
          <Icon name="clock" size={14} /> {activity.startTime} – {activity.endTime} · {timeLabel}
        </p>

        {activity.notes && <p className="alarm-notes">{activity.notes}</p>}

        <div className="alarm-actions">
          {!isTest && (
            <button type="button" className="primary-button full-width" onClick={handleStartFocus}>
              <Icon name="play" size={16} /> Mulai Sesi Fokus Sekarang
            </button>
          )}

          <div className="alarm-secondary-row">
            {!isTest && (
              <button type="button" className="secondary-button" onClick={() => snoozeActiveAlarm(5)}>
                <Icon name="clock" size={15} /> Tunda 5 Mnt
              </button>
            )}
            <button
              type="button"
              className={isTest ? 'primary-button full-width' : 'secondary-button'}
              onClick={() => dismissActiveAlarm(false)}
            >
              <Icon name="x" size={15} /> Matikan Alarm
            </button>
          </div>

          {!isTest && (
            <button
              type="button"
              className="text-button alarm-done-link"
              onClick={() => dismissActiveAlarm(true)}
            >
              <Icon name="check" size={14} /> Tandai Kegiatan Selesai
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
