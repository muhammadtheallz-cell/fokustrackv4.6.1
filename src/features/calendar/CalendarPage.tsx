import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import type {
  ActivityItem,
  ReminderMode,
  ReminderOffsetMinutes,
  TaskCategory,
  TaskPriority,
} from '../../types'
import { formatTimeHHMM, parseActivityDateTime, subtractMinutes, toDateKey } from '../../utils/date'
import Icon from '../../components/ui/Icon'
import Modal from '../../components/ui/Modal'

const weekdays = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const monthNames = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

export default function CalendarPage() {
  const {
    todayKey,
    activities,
    addActivity,
    updateActivity,
    toggleActivity,
    deleteActivity,
    settings,
    notificationPermission,
    requestNotifications,
  } = useApp()

  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => todayKey)
  const [visibleActivityLimit, setVisibleActivityLimit] = useState(50)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ActivityItem | null>(null)
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [activityFormError, setActivityFormError] = useState('')
  const [category, setCategory] = useState<TaskCategory>('Kerja')
  const [priority, setPriority] = useState<TaskPriority>('Sedang')
  const [notes, setNotes] = useState('')
  const [reminderEnabled, setReminderEnabled] = useState(true)
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState<ReminderOffsetMinutes>(
    settings.defaultReminderMinutes
  )
  const [reminderMode, setReminderMode] = useState<ReminderMode>(settings.defaultReminderMode)

  const days = useMemo(() => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay()
    const totalDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    const cells: (number | null)[] = Array(firstDay).fill(null)
    for (let day = 1; day <= totalDays; day += 1) cells.push(day)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [month])

  const datesWithEvents = useMemo(() => {
    const set = new Set<string>()
    activities.forEach((a) => set.add(a.date))
    return set
  }, [activities])

  const selectedActivities = useMemo(
    () => activities.filter((a) => a.date === selectedDateKey),
    [activities, selectedDateKey]
  )
  const visibleSelectedActivities = selectedActivities.slice(0, visibleActivityLimit)

  function makeDateKeyForDay(day: number): string {
    return toDateKey(new Date(month.getFullYear(), month.getMonth(), day))
  }

  function shiftMonth(amount: number) {
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + amount, 1)
    setMonth(nextMonth)
    const now = new Date()
    if (nextMonth.getFullYear() === now.getFullYear() && nextMonth.getMonth() === now.getMonth()) {
      setSelectedDateKey(toDateKey(now))
    } else {
      setSelectedDateKey(toDateKey(nextMonth))
    }
    setVisibleActivityLimit(50)
  }

  function jumpToToday() {
    const now = new Date()
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedDateKey(toDateKey(now))
    setVisibleActivityLimit(50)
  }

  function openCreateModal() {
    setActivityFormError('')
    setEditingItem(null)
    setTitle('')
    setStartTime('09:00')
    setEndTime('10:00')
    setCategory('Kerja')
    setPriority('Sedang')
    setNotes('')
    setReminderEnabled(true)
    setReminderMinutesBefore(settings.defaultReminderMinutes)
    setReminderMode(settings.defaultReminderMode)
    setModalOpen(true)
  }

  function openEditModal(item: ActivityItem) {
    setActivityFormError('')
    setEditingItem(item)
    setTitle(item.title)
    setStartTime(item.startTime)
    setEndTime(item.endTime)
    setCategory(item.category)
    setPriority(item.priority)
    setNotes(item.notes ?? '')
    setReminderEnabled(item.reminderEnabled)
    setReminderMinutesBefore(item.reminderMinutesBefore)
    setReminderMode(item.reminderMode)
    setModalOpen(true)
  }

  async function handleSaveActivity(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || title.trim().length > 120 || !selectedDateKey) return
    if (endTime <= startTime) {
      setActivityFormError('Waktu selesai harus lebih akhir daripada waktu mulai. Jadwal lintas tengah malam belum didukung.')
      return
    }
    setActivityFormError('')

    if (reminderEnabled && notificationPermission === 'default') {
      await requestNotifications()
    }

    if (editingItem) {
      updateActivity(editingItem.id, {
        title: title.trim(),
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
        date: selectedDateKey,
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
    setModalOpen(false)
  }

  const [, selMonthStr, selDayStr] = selectedDateKey.split('-')
  const selectedDayNum = Number(selDayStr)
  const selectedMonthName = monthNames[(Number(selMonthStr) || 1) - 1]

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">TIME &amp; ALARM BLOCKING</p>
          <h1>
            Kalender <span className="gradient-text">&amp; jadwal.</span>
          </h1>
          <p className="heading-subtitle">Atur pengingat per kegiatan; Push server dapat mengirim notifikasi saat aplikasi tertutup.</p>
        </div>
        <button className="primary-button compact-btn" onClick={openCreateModal}>
          <Icon name="calendar-plus" size={17} /> Jadwal
        </button>
      </section>

      <section className="surface-card calendar-card">
        <div className="calendar-toolbar">
          <div>
            <p className="eyebrow">KALENDER BULANAN</p>
            <h2>
              {monthNames[month.getMonth()]} <span>{month.getFullYear()}</span>
            </h2>
          </div>
          <div className="month-controls">
            <button className="text-button today-jump-btn" onClick={jumpToToday}>
              Hari Ini
            </button>
            <button className="icon-button" onClick={() => shiftMonth(-1)} aria-label="Bulan sebelumnya">
              <Icon name="chevron-left" size={17} />
            </button>
            <button className="icon-button" onClick={() => shiftMonth(1)} aria-label="Bulan berikutnya">
              <Icon name="chevron-right" size={17} />
            </button>
          </div>
        </div>

        <div className="calendar-grid weekday-row">
          {weekdays.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="calendar-grid day-grid">
          {days.map((day, index) => {
            if (day === null) {
              return <span key={`empty-${index}`} className="calendar-day-empty" />
            }
            const cellKey = makeDateKeyForDay(day)
            const isToday = cellKey === todayKey
            const isSelected = cellKey === selectedDateKey
            const hasEvents = datesWithEvents.has(cellKey)

            return (
              <button
                key={cellKey}
                className={`calendar-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                onClick={() => { setSelectedDateKey(cellKey); setVisibleActivityLimit(50) }}
                aria-label={`${day} ${monthNames[month.getMonth()]}`}
                aria-pressed={isSelected}
              >
                {day}
                {(isToday || hasEvents) && <i className={hasEvents ? 'has-event-dot' : ''} />}
              </button>
            )
          })}
        </div>

        <div className="calendar-legend">
          <span>
            <i className="legend-today" /> Hari ini
          </span>
          <span>
            <i className="legend-selected" /> Dipilih
          </span>
          <span>
            <i className="legend-event" /> Ada jadwal
          </span>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">DAFTAR KEGIATAN</p>
            <h2>
              {selectedDayNum} {selectedMonthName}
            </h2>
          </div>
          <span className="muted-pill">{selectedActivities.length} aktivitas</span>
        </div>

        {selectedActivities.length === 0 ? (
          <div className="surface-card empty-activity calendar-empty">
            <div className="empty-illustration small">
              <span className="empty-ring ring-a" />
              <span className="empty-ring ring-b" />
              <span className="empty-center">
                <Icon name="clock" size={21} />
              </span>
            </div>
            <h3>Belum ada jadwal</h3>
            <p>Tambahkan blok waktu atau agenda kegiatan dengan pengingat alarm untuk tanggal {selectedDayNum} {selectedMonthName}.</p>
            <button className="primary-button" onClick={openCreateModal}>
              <Icon name="plus" size={16} /> Tambah Jadwal + Alarm
            </button>
          </div>
        ) : (
          <div className="item-list">
            {visibleSelectedActivities.map((item) => {
              const startDt = parseActivityDateTime(item.date, item.startTime)
              const remindDt = subtractMinutes(startDt, item.reminderMinutesBefore)
              return (
                <div key={item.id} className={`surface-card task-row ${item.completed ? 'completed' : ''}`}>
                  <button
                    className={`check-circle ${item.completed ? 'checked' : ''}`}
                    onClick={() => toggleActivity(item.id)}
                    aria-label="Toggle selesai"
                  >
                    {item.completed && <Icon name="check" size={14} />}
                  </button>
                  <div className="task-info" onClick={() => openEditModal(item)}>
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
                    {item.notes && <p className="task-notes">{item.notes}</p>}
                  </div>
                  <div className="row-actions">
                    <button
                      className="ghost-icon-btn"
                      onClick={() => openEditModal(item)}
                      aria-label="Edit jadwal"
                      title="Edit"
                    >
                      <Icon name="edit" size={15} />
                    </button>
                    <button
                      className="ghost-icon-btn"
                      onClick={() => deleteActivity(item.id)}
                      aria-label="Hapus jadwal"
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
        {visibleActivityLimit < selectedActivities.length && (
          <button type="button" className="secondary-button full-width" onClick={() => setVisibleActivityLimit((limit) => limit + 50)}>
            Muat 50 aktivitas berikutnya ({selectedActivities.length - visibleActivityLimit} tersisa)
          </button>
        )}
      </section>

      <Modal
        open={modalOpen}
        title={editingItem ? 'Ubah Jadwal & Pengingat' : 'Jadwal Baru + Pengingat'}
        subtitle={`Tanggal: ${selectedDayNum} ${selectedMonthName}`}
        onClose={() => setModalOpen(false)}
      >
        <form className="form-stack" onSubmit={handleSaveActivity}>
          <label className="field-label">
            <span>Judul Kegiatan</span>
            <input
              type="text"
              className="text-input"
              placeholder="Contoh: Rapat Tim / Belajar Algoritma"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </label>
          <div className="form-row-2">
            <label className="field-label">
              <span>Waktu Mulai</span>
              <input type="time" className="text-input" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </label>
            <label className="field-label">
              <span>Waktu Selesai</span>
              <input type="time" className="text-input" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            </label>
          </div>
          {activityFormError && <p className="form-error" role="alert">{activityFormError}</p>}
          <div className="form-row-2">
            <label className="field-label">
              <span>Kategori</span>
              <select className="text-input" value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
                <option value="Kerja">Kerja</option>
                <option value="Belajar">Belajar</option>
                <option value="Kesehatan">Kesehatan</option>
                <option value="Pribadi">Pribadi</option>
              </select>
            </label>
            <label className="field-label">
              <span>Prioritas</span>
              <select className="text-input" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                <option value="Tinggi">Tinggi</option>
                <option value="Sedang">Sedang</option>
                <option value="Rendah">Rendah</option>
              </select>
            </label>
          </div>

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
            <Icon name="check" size={16} /> {editingItem ? 'Simpan Perubahan' : 'Tambahkan ke Kalender'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
