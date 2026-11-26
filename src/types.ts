export type AppTab = 'today' | 'focus' | 'calendar' | 'wallet'
export type ThemeMode = 'dark' | 'light'

export type TaskCategory = 'Kerja' | 'Belajar' | 'Kesehatan' | 'Pribadi'
export type TaskPriority = 'Tinggi' | 'Sedang' | 'Rendah'

export type ReminderOffsetMinutes = 0 | 5 | 10 | 15 | 30 | 60
export type ReminderMode = 'alarm' | 'chime' | 'silent'
export type AlarmSoundType = 'classic' | 'gentle' | 'pulse'

export interface ActivityItem {
  id: string
  title: string
  date: string // YYYY-MM-DD
  startTime: string // HH:mm
  endTime: string // HH:mm
  category: TaskCategory
  priority: TaskPriority
  completed: boolean
  completedAt?: string
  notes?: string
  reminderEnabled: boolean
  reminderMinutesBefore: ReminderOffsetMinutes
  reminderMode: ReminderMode
  snoozedUntil?: string // ISO string when snoozed
  createdAt: string
}

export interface ActiveAlarm {
  triggerKey: string
  activity: ActivityItem
  triggeredAt: string
  isSnoozed?: boolean
}

export interface FocusPreset {
  id: string
  label: string
  minutes: number
  isBreak?: boolean
}

export type TransactionType = 'income' | 'expense'
export type TransactionCategory =
  | 'Makan & Minum'
  | 'Transportasi'
  | 'Tagihan'
  | 'Belanja'
  | 'Hiburan'
  | 'Gaji & Bonus'
  | 'Tabungan'
  | 'Lainnya'

export interface TransactionItem {
  id: string
  title: string
  amount: number
  type: TransactionType
  category: TransactionCategory
  date: string // YYYY-MM-DD
  notes?: string
  createdAt: string
}

export interface FocusSession {
  id: string
  label: string
  minutes: number
  date: string // YYYY-MM-DD
  completedAt: string
}

export interface AppSettings {
  dailyBudgetLimit: number
  dailyFocusGoalMinutes: number
  hideBalance: boolean
  soundEnabled: boolean
  defaultReminderMinutes: ReminderOffsetMinutes
  defaultReminderMode: ReminderMode
  alarmSoundType: AlarmSoundType
}
