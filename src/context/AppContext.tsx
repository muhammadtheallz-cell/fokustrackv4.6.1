import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  ActiveAlarm,
  ActivityItem,
  AppSettings,
  AppTab,
  FocusPreset,
  FocusSession,
  ReminderMode,
  ReminderOffsetMinutes,
  ThemeMode,
  TransactionCategory,
  TransactionItem,
} from '../types'
import { parseActivityDateTime, subtractMinutes, toDateKey } from '../utils/date'
import { calculateConsistency } from '../utils/appMetrics.js'
import { removeAlarmFromQueue } from '../utils/alarmQueue.js'
import { playAlarmBurst, playFocusChime, unlockAudioContext } from '../utils/sound'
import {
  MAX_FOCUS_MINUTES,
  MIN_FOCUS_MINUTES,
  getElapsedFocusMinutes,
  getRemainingFocusSeconds,
} from '../utils/focusTimer.js'
import {
  getNotificationPermissionStatus,
  requestBrowserNotificationPermission,
  sendSystemNotification,
  type BrowserNotificationStatus,
} from '../utils/notifications'
import {
  getInitialBackgroundPushStatus,
  registerBackgroundPush,
  syncBackgroundReminders,
  sendBackgroundPushTest,
  type BackgroundPushStatus,
} from '../utils/push'

const STORAGE_KEY = 'fokustrack-state-v4'
const LEGACY_STORAGE_KEY = 'fokustrack-state-v3'
const TRIGGERED_KEY = 'fokustrack-triggered-v4'
const LEGACY_TRIGGERED_KEY = 'fokustrack-triggered-v3'
const THEME_KEY = 'fokustrack-theme'
const INSTALL_DISMISSED_KEY = 'fokustrack-install-dismissed-v3'
const FOCUS_TIMER_STORAGE_KEY = 'fokustrack-focus-timer-v46'
const LEGACY_FOCUS_TIMER_STORAGE_KEY = 'fokustrack-focus-timer-v45'
const MAX_TRANSACTION_AMOUNT = Number.MAX_SAFE_INTEGER
const MAX_ACTIVITIES = 10_000
const MAX_TRANSACTIONS = 50_000
const MAX_FOCUS_SESSIONS = 50_000
const MAX_BACKUP_BYTES = 10_000_000
const LOCAL_REMINDER_GRACE_MS = 10 * 60_000

export const FOCUS_PRESETS: FocusPreset[] = [
  { id: 'pomodoro', label: 'Fokus 25m', minutes: 25 },
  { id: 'deep', label: 'Deep 50m', minutes: 50 },
  { id: 'short-break', label: 'Rehat 5m', minutes: 5, isBreak: true },
  { id: 'long-break', label: 'Rehat 15m', minutes: 15, isBreak: true },
]

interface PersistedData {
  schemaVersion: 4
  streakResetAt?: string
  activities: ActivityItem[]
  transactions: TransactionItem[]
  focusSessions: FocusSession[]
  settings: AppSettings
}

interface LoadedFocusTimer {
  preset: FocusPreset
  secondsLeft: number
  isRunning: boolean
  endAt: number | null
  sessionLabel: string
  pendingCompletion: boolean
  pendingCompletionAt: number | null
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const defaultSettings: AppSettings = {
  dailyBudgetLimit: 150000,
  dailyFocusGoalMinutes: 60,
  hideBalance: false,
  soundEnabled: true,
  defaultReminderMinutes: 10,
  defaultReminderMode: 'alarm',
  alarmSoundType: 'classic',
}

function getEmptyData(): PersistedData {
  return {
    schemaVersion: 4,
    activities: [],
    transactions: [],
    focusSessions: [],
    settings: { ...defaultSettings },
  }
}

function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function isValidTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false
  const [hours, minutes] = value.split(':').map(Number)
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

function normalizeActivity(value: Partial<ActivityItem> | null | undefined, idx: number): ActivityItem {
  const raw: Partial<ActivityItem> = value && typeof value === 'object' ? value : {}
  const validOffsets: ReminderOffsetMinutes[] = [0, 5, 10, 15, 30, 60]
  const offset = validOffsets.includes(raw.reminderMinutesBefore as ReminderOffsetMinutes)
    ? (raw.reminderMinutesBefore as ReminderOffsetMinutes)
    : 10
  const validModes: ReminderMode[] = ['alarm', 'chime', 'silent']
  const mode = validModes.includes(raw.reminderMode as ReminderMode)
    ? (raw.reminderMode as ReminderMode)
    : 'alarm'
  const categories = ['Kerja', 'Belajar', 'Kesehatan', 'Pribadi'] as const
  const priorities = ['Tinggi', 'Sedang', 'Rendah'] as const
  const rawStart = isValidTime(raw.startTime) && raw.startTime < '23:59' ? raw.startTime : '09:00'
  const startTime = rawStart
  const [startHour, startMinute] = startTime.split(':').map(Number)
  const defaultEndMinutes = Math.min(23 * 60 + 59, startHour * 60 + startMinute + 60)
  const defaultEndTime = `${String(Math.floor(defaultEndMinutes / 60)).padStart(2, '0')}:${String(defaultEndMinutes % 60).padStart(2, '0')}`
  const endTime = isValidTime(raw.endTime) && raw.endTime > startTime ? raw.endTime : defaultEndTime
  const createdAt = typeof raw.createdAt === 'string' && Number.isFinite(Date.parse(raw.createdAt))
    ? raw.createdAt
    : new Date().toISOString()
  // v3 stored only the completed flag. Reconstruct a stable completion timestamp
  // from the scheduled end so existing completed tasks still contribute to streaks.
  const completedAt = typeof raw.completedAt === 'string' && Number.isFinite(Date.parse(raw.completedAt))
    ? raw.completedAt
    : raw.completed === true
      ? parseActivityDateTime(isValidDateKey(raw.date) ? raw.date : toDateKey(), endTime).toISOString()
      : undefined

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.slice(0, 120) : `act-${Date.now()}-${idx}`,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 120) : 'Kegiatan',
    date: isValidDateKey(raw.date) ? raw.date : toDateKey(),
    startTime,
    endTime,
    category: categories.includes(raw.category as (typeof categories)[number])
      ? (raw.category as ActivityItem['category'])
      : 'Kerja',
    priority: priorities.includes(raw.priority as (typeof priorities)[number])
      ? (raw.priority as ActivityItem['priority'])
      : 'Sedang',
    completed: typeof raw.completed === 'boolean' ? raw.completed : false,
    completedAt,
    notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 500) : undefined,
    reminderEnabled: typeof raw.reminderEnabled === 'boolean' ? raw.reminderEnabled : true,
    reminderMinutesBefore: offset,
    reminderMode: mode,
    snoozedUntil: typeof raw.snoozedUntil === 'string' && Number.isFinite(Date.parse(raw.snoozedUntil))
      ? raw.snoozedUntil
      : undefined,
    createdAt,
  }
}

const transactionCategories: TransactionCategory[] = [
  'Makan & Minum', 'Transportasi', 'Tagihan', 'Belanja', 'Hiburan',
  'Gaji & Bonus', 'Tabungan', 'Lainnya',
]
const incomeCategories: TransactionCategory[] = ['Gaji & Bonus', 'Tabungan', 'Lainnya']
const expenseCategories: TransactionCategory[] = [
  'Makan & Minum', 'Transportasi', 'Tagihan', 'Belanja', 'Hiburan', 'Lainnya',
]

function isTransactionCategoryAllowed(type: TransactionItem['type'], category: TransactionCategory): boolean {
  return (type === 'income' ? incomeCategories : expenseCategories).includes(category)
}

function isValidTransaction(value: unknown): value is TransactionItem {
  if (!value || typeof value !== 'object') return false
  const tx = value as Partial<TransactionItem>
  return Boolean(
    typeof tx.id === 'string' && tx.id.trim().length > 0 && tx.id.length <= 120 &&
    typeof tx.title === 'string' && tx.title.trim().length > 0 && tx.title.length <= 120 &&
    typeof tx.amount === 'number' && Number.isSafeInteger(tx.amount) && tx.amount > 0 && tx.amount <= MAX_TRANSACTION_AMOUNT &&
    (tx.type === 'income' || tx.type === 'expense') &&
    transactionCategories.includes(tx.category as TransactionCategory) &&
    isTransactionCategoryAllowed(tx.type as TransactionItem['type'], tx.category as TransactionCategory) &&
    isValidDateKey(tx.date) && typeof tx.createdAt === 'string' && Number.isFinite(Date.parse(tx.createdAt)) &&
    (tx.notes === undefined || (typeof tx.notes === 'string' && tx.notes.length <= 500))
  )
}

function isValidFocusSession(value: unknown): value is FocusSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<FocusSession>
  return Boolean(
    typeof session.id === 'string' && session.id.trim().length > 0 && session.id.length <= 160 &&
    typeof session.label === 'string' && session.label.length <= 120 &&
    typeof session.minutes === 'number' && Number.isInteger(session.minutes) && session.minutes > 0 && session.minutes <= MAX_FOCUS_MINUTES &&
    isValidDateKey(session.date) && typeof session.completedAt === 'string' &&
    Number.isFinite(Date.parse(session.completedAt))
  )
}

function normalizeSettings(raw?: Partial<AppSettings>): AppSettings {
  const offsets: ReminderOffsetMinutes[] = [0, 5, 10, 15, 30, 60]
  const modes: ReminderMode[] = ['alarm', 'chime', 'silent']
  const sounds = ['classic', 'gentle', 'pulse'] as const
  return {
    dailyBudgetLimit: typeof raw?.dailyBudgetLimit === 'number' && Number.isFinite(raw.dailyBudgetLimit)
      ? Math.min(MAX_TRANSACTION_AMOUNT, Math.max(0, Math.floor(raw.dailyBudgetLimit)))
      : defaultSettings.dailyBudgetLimit,
    dailyFocusGoalMinutes: typeof raw?.dailyFocusGoalMinutes === 'number' && Number.isFinite(raw.dailyFocusGoalMinutes)
      ? Math.min(720, Math.max(10, Math.floor(raw.dailyFocusGoalMinutes)))
      : defaultSettings.dailyFocusGoalMinutes,
    hideBalance: typeof raw?.hideBalance === 'boolean' ? raw.hideBalance : defaultSettings.hideBalance,
    soundEnabled: typeof raw?.soundEnabled === 'boolean' ? raw.soundEnabled : defaultSettings.soundEnabled,
    defaultReminderMinutes: offsets.includes(raw?.defaultReminderMinutes as ReminderOffsetMinutes)
      ? (raw?.defaultReminderMinutes as ReminderOffsetMinutes)
      : defaultSettings.defaultReminderMinutes,
    defaultReminderMode: modes.includes(raw?.defaultReminderMode as ReminderMode)
      ? (raw?.defaultReminderMode as ReminderMode)
      : defaultSettings.defaultReminderMode,
    alarmSoundType: sounds.includes(raw?.alarmSoundType as (typeof sounds)[number])
      ? (raw?.alarmSoundType as AppSettings['alarmSoundType'])
      : defaultSettings.alarmSoundType,
  }
}

function sortActivities(items: ActivityItem[]): ActivityItem[] {
  return [...items].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
  )
}

function withUniqueIds<T extends { id: string }>(items: T[], prefix: string): T[] {
  const seen = new Set<string>()
  return items.map((item, index) => {
    let id = item.id
    if (!id || seen.has(id)) id = `${prefix}-${Date.now()}-${index}`
    while (seen.has(id)) id = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    seen.add(id)
    return id === item.id ? item : { ...item, id }
  })
}

function normalizePersistedData(parsed: Partial<PersistedData> | null | undefined): PersistedData | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  if (!Array.isArray(parsed.activities) || !Array.isArray(parsed.transactions)) return null
  if (parsed.focusSessions !== undefined && !Array.isArray(parsed.focusSessions)) return null
  if (parsed.activities.length > MAX_ACTIVITIES || parsed.transactions.length > MAX_TRANSACTIONS) return null
  if (Array.isArray(parsed.focusSessions) && parsed.focusSessions.length > MAX_FOCUS_SESSIONS) return null

  const activities = withUniqueIds(
    sortActivities(parsed.activities.map((activity, index) => normalizeActivity(activity, index))),
    'act-recovered',
  )
  const transactions = withUniqueIds(parsed.transactions.filter(isValidTransaction), 'tx-recovered')
  const focusSessions = withUniqueIds(
    (Array.isArray(parsed.focusSessions) ? parsed.focusSessions : []).filter(isValidFocusSession),
    'foc-recovered',
  )

  return {
    schemaVersion: 4,
    streakResetAt: typeof parsed.streakResetAt === 'string' && Number.isFinite(Date.parse(parsed.streakResetAt))
      ? parsed.streakResetAt
      : undefined,
    activities,
    transactions,
    focusSessions,
    settings: normalizeSettings(parsed.settings),
  }
}

let initialDataRecoveryWarning = false
let initialTimerRecoveryWarning = false

function loadInitialData(): PersistedData {
  // Prefer the latest snapshot, but recover from the legacy key if the current one is corrupt.
  let encounteredCorruptSnapshot = false
  for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      let parsed: Partial<PersistedData>
      try {
        parsed = JSON.parse(raw) as Partial<PersistedData>
      } catch {
        encounteredCorruptSnapshot = true
        continue
      }
      const normalized = normalizePersistedData(parsed)
      if (!normalized) {
        encounteredCorruptSnapshot = true
        continue
      }
      // Reassert the validated array shapes here so strict TypeScript can narrow
      // the parsed JSON properties independently of normalizePersistedData().
      if (!Array.isArray(parsed.activities) || !Array.isArray(parsed.transactions)) {
        encounteredCorruptSnapshot = true
        continue
      }
      if (
        parsed.transactions.length !== normalized.transactions.length ||
        (Array.isArray(parsed.focusSessions) && parsed.focusSessions.length !== normalized.focusSessions.length) ||
        parsed.activities.some((activity) => !activity || typeof activity !== 'object' || Array.isArray(activity))
      ) {
        encounteredCorruptSnapshot = true
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
      } catch {
        // Continue with the in-memory snapshot; the UI surfaces persistence failures.
      }
      initialDataRecoveryWarning = initialDataRecoveryWarning || encounteredCorruptSnapshot
      return normalized
    } catch {
      encounteredCorruptSnapshot = true
      // Try the previous snapshot before starting with empty data.
    }
  }
  initialDataRecoveryWarning = initialDataRecoveryWarning || encounteredCorruptSnapshot
  return getEmptyData()
}

function loadTriggeredSet(): Set<string> {
  try {
    const raw = localStorage.getItem(TRIGGERED_KEY) ?? localStorage.getItem(LEGACY_TRIGGERED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr.slice(-200)) : new Set()
  } catch {
    return new Set()
  }
}

function getInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'dark'
  } catch {
    return 'dark'
  }
}

function getDefaultFocusTimer(): LoadedFocusTimer {
  return {
    preset: FOCUS_PRESETS[0],
    secondsLeft: FOCUS_PRESETS[0].minutes * 60,
    isRunning: false,
    endAt: null,
    sessionLabel: 'Sesi Fokus Mendalam',
    pendingCompletion: false,
    pendingCompletionAt: null,
  }
}

function loadInitialFocusTimer(): LoadedFocusTimer {
  const fallback = getDefaultFocusTimer()
  initialTimerRecoveryWarning = false
  try {
    // Read the previous timer key once so an in-progress v4.5 session survives this maintenance update.
    const raw = localStorage.getItem(FOCUS_TIMER_STORAGE_KEY) ?? localStorage.getItem(LEGACY_FOCUS_TIMER_STORAGE_KEY)
    if (!raw) return fallback

    const parsed = JSON.parse(raw) as {
      preset?: Partial<FocusPreset>
      secondsLeft?: number
      isRunning?: boolean
      endAt?: number | null
      sessionLabel?: string
      pendingCompletion?: boolean
      pendingCompletionAt?: number | null
    }
    const minutes = Number(parsed.preset?.minutes)
    if (!Number.isInteger(minutes) || minutes < MIN_FOCUS_MINUTES || minutes > MAX_FOCUS_MINUTES) {
      initialTimerRecoveryWarning = true
      return fallback
    }

    const preset: FocusPreset = {
      id: typeof parsed.preset?.id === 'string' && parsed.preset.id.trim()
        ? parsed.preset.id.slice(0, 80)
        : `custom-${minutes}`,
      label: typeof parsed.preset?.label === 'string' && parsed.preset.label.trim()
        ? parsed.preset.label.slice(0, 80)
        : `${minutes} menit`,
      minutes,
      isBreak: parsed.preset?.isBreak === true,
    }
    const endAt = typeof parsed.endAt === 'number' && Number.isFinite(parsed.endAt) && Math.abs(parsed.endAt) <= 8_640_000_000_000_000
      ? parsed.endAt
      : null
    const wasRunning = parsed.isRunning === true && endAt !== null
    const remainingFromDeadline = wasRunning
      ? Math.min(preset.minutes * 60, getRemainingFocusSeconds(endAt ?? Date.now()))
      : null
    const savedCompletionAt = typeof parsed.pendingCompletionAt === 'number' && Number.isFinite(parsed.pendingCompletionAt)
      ? parsed.pendingCompletionAt
      : endAt
    const pendingCompletion = parsed.pendingCompletion === true || (wasRunning && remainingFromDeadline === 0)
    const savedSeconds = typeof parsed.secondsLeft === 'number' && Number.isFinite(parsed.secondsLeft)
      ? Math.floor(parsed.secondsLeft)
      : preset.minutes * 60
    const secondsLeft = wasRunning
      ? (remainingFromDeadline ?? 0)
      : Math.min(preset.minutes * 60, Math.max(0, savedSeconds))

    return {
      preset,
      secondsLeft,
      isRunning: wasRunning && !pendingCompletion,
      endAt: wasRunning ? endAt : null,
      sessionLabel: typeof parsed.sessionLabel === 'string' && parsed.sessionLabel.trim()
        ? parsed.sessionLabel.trim().slice(0, 120)
        : 'Sesi Fokus Mendalam',
      pendingCompletion,
      pendingCompletionAt: pendingCompletion ? savedCompletionAt : null,
    }
  } catch {
    initialTimerRecoveryWarning = true
    return fallback
  }
}

interface AppContextValue {
  theme: ThemeMode
  toggleTheme: () => void
  todayKey: string
  activities: ActivityItem[]
  addActivity: (item: Omit<ActivityItem, 'id' | 'createdAt'>) => void
  updateActivity: (id: string, patch: Partial<ActivityItem>) => void
  toggleActivity: (id: string) => void
  deleteActivity: (id: string) => void
  transactions: TransactionItem[]
  addTransaction: (item: Omit<TransactionItem, 'id' | 'createdAt'>) => void
  deleteTransaction: (id: string) => void
  focusSessions: FocusSession[]
  addFocusSession: (label: string, minutes: number, completedAt?: string, stableId?: string) => void
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
  streakCount: number
  hasStartedConsistency: boolean
  todayFocusMinutes: number
  todayGoalProgress: number
  totalBalance: number
  monthIncome: number
  monthExpense: number
  todayExpense: number
  remainingDailyBudget: number
  // Focus Timer (global across tabs)
  selectedPreset: FocusPreset
  secondsLeft: number
  isRunning: boolean
  sessionLabel: string
  setSessionLabel: (label: string) => void
  storageError: boolean
  justFinished: boolean
  selectPreset: (preset: FocusPreset) => void
  startPauseTimer: () => void
  resetTimer: () => void
  completeTimerNow: () => void
  startFocusForActivity: (title: string, onNavigate?: (tab: AppTab) => void) => void
  // Reminders & Alarms
  notificationPermission: BrowserNotificationStatus
  requestNotifications: () => Promise<BrowserNotificationStatus>
  backgroundPushStatus: BackgroundPushStatus
  activeAlarm: ActiveAlarm | null
  snoozeActiveAlarm: (minutes?: number) => void
  dismissActiveAlarm: (markCompleted?: boolean) => void
  triggerTestAlarm: () => void
  upcomingRemindersCount: number
  // PWA Home Screen Install
  canInstallPwa: boolean
  isStandalonePwa: boolean
  installBannerDismissed: boolean
  dismissInstallBanner: () => void
  promptInstallPwa: () => Promise<boolean>
  // Backup & Reset
  exportBackupJson: () => string
  importBackupJson: (jsonString: string) => boolean
  resetStreakOnly: () => void
  resetAllData: () => void
  loadSampleData: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [data, setData] = useState<PersistedData>(loadInitialData)
  const [todayKey, setTodayKey] = useState<string>(() => toDateKey())
  const [clockNowMs, setClockNowMs] = useState<number>(() => Date.now())

  // Focus Timer State: restore an in-progress timer after a refresh or app restart.
  const [initialTimer] = useState<LoadedFocusTimer>(loadInitialFocusTimer)
  const [selectedPreset, setSelectedPreset] = useState<FocusPreset>(initialTimer.preset)
  const [secondsLeft, setSecondsLeft] = useState<number>(initialTimer.secondsLeft)
  const [isRunning, setIsRunning] = useState<boolean>(initialTimer.isRunning)
  const [sessionLabel, setSessionLabel] = useState<string>(initialTimer.sessionLabel)
  const [justFinished, setJustFinished] = useState<boolean>(initialTimer.pendingCompletion)
  const [recoveryPending, setRecoveryPending] = useState<boolean>(initialTimer.pendingCompletion)
  const [dataStorageError, setDataStorageError] = useState(false)
  const [timerStorageError, setTimerStorageError] = useState(false)
  const [dataRecoveryWarning] = useState(initialDataRecoveryWarning)
  const [timerRecoveryWarning] = useState(initialTimerRecoveryWarning)
  const storageError = dataStorageError || timerStorageError || dataRecoveryWarning || timerRecoveryWarning
  const completedRef = useRef<boolean>(initialTimer.pendingCompletion)
  const endTimeRef = useRef<number | null>(initialTimer.endAt)
  const recoveredExpiredTimerRef = useRef<boolean>(false)
  const pendingRecoverySessionIdRef = useRef<string | null>(null)

  // Reminder & Alarm State
  const [notificationPermission, setNotificationPermission] = useState<BrowserNotificationStatus>(
    () => getNotificationPermissionStatus()
  )
  const [backgroundPushStatus, setBackgroundPushStatus] = useState<BackgroundPushStatus>(
    () => getInitialBackgroundPushStatus()
  )
  const [alarmQueue, setAlarmQueue] = useState<ActiveAlarm[]>([])
  const activeAlarm = alarmQueue[0] ?? null
  const triggeredKeysRef = useRef<Set<string>>(loadTriggeredSet())

  useEffect(() => {
    if (notificationPermission !== 'granted' || backgroundPushStatus !== 'ready') return
    let cancelled = false
    registerBackgroundPush().then((status) => {
      if (!cancelled) setBackgroundPushStatus(status)
    })
    return () => { cancelled = true }
    // This one-time check refreshes an existing browser subscription after app startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalonePwa, setIsStandalonePwa] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    )
  })
  const [installBannerDismissed, setInstallBannerDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true'
    } catch {
      return false
    }
  })

  // Listen for beforeinstallprompt & appinstalled
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const handleInstalled = () => {
      setDeferredPrompt(null)
      setIsStandalonePwa(true)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  // Keep todayKey fresh across midnight
  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = toDateKey()
      setTodayKey((prev) => (prev !== current ? current : prev))
      setClockNowMs(Date.now())
    }, 30_000)
    return () => window.clearInterval(interval)
  }, [])

  // Sync theme attribute, localStorage, and mobile theme-color meta tag
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // Ignore storage quota errors
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]')
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#0b0e14' : '#f4f2fb')
    }
  }, [theme])

  // Persist app data
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, schemaVersion: 4 }))
      setDataStorageError(false)
      // A recovered session remains marked pending until its data snapshot is safely persisted.
      if (pendingRecoverySessionIdRef.current && data.focusSessions.some(
        (session) => session.id === pendingRecoverySessionIdRef.current
      )) {
        pendingRecoverySessionIdRef.current = null
        setRecoveryPending(false)
      }
    } catch {
      setDataStorageError(true)
    }
  }, [data])

  // Synchronize changes made in another open tab so an older tab is less likely to overwrite new data.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        try {
          const normalized = normalizePersistedData(JSON.parse(event.newValue) as Partial<PersistedData>)
          if (normalized) setData(normalized)
        } catch {
          setDataStorageError(true)
        }
      }
      if (event.key === THEME_KEY && (event.newValue === 'dark' || event.newValue === 'light')) {
        setTheme(event.newValue)
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const persistTriggeredKeys = useCallback(() => {
    try {
      localStorage.setItem(TRIGGERED_KEY, JSON.stringify(Array.from(triggeredKeysRef.current).slice(-200)))
    } catch {
      // Ignore storage quota errors
    }
  }, [])

  const addFocusSession = useCallback((label: string, minutes: number, completedAt?: string, stableId?: string) => {
    const safeMinutes = Math.floor(minutes)
    if (!Number.isFinite(safeMinutes) || safeMinutes < MIN_FOCUS_MINUTES || safeMinutes > MAX_FOCUS_MINUTES) return
    const completionDate = completedAt && Number.isFinite(Date.parse(completedAt))
      ? new Date(completedAt)
      : new Date()
    const session: FocusSession = {
      id: stableId && stableId.trim() ? stableId.slice(0, 160) : `foc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: label.trim().slice(0, 120) || 'Sesi Fokus Mendalam',
      minutes: safeMinutes,
      date: toDateKey(completionDate),
      completedAt: completionDate.toISOString(),
    }
    setData((prev) => prev.focusSessions.some((item) => item.id === session.id)
      ? prev
      : { ...prev, focusSessions: [session, ...prev.focusSessions].slice(0, MAX_FOCUS_SESSIONS) })
  }, [])

  // Global Focus Timer Ticker
  const timerSnapshotRef = useRef({
    selectedPreset,
    sessionLabel,
    soundEnabled: data.settings.soundEnabled,
    addFocusSession,
  })

  useEffect(() => {
    timerSnapshotRef.current = {
      selectedPreset,
      sessionLabel,
      soundEnabled: data.settings.soundEnabled,
      addFocusSession,
    }
  }, [selectedPreset, sessionLabel, data.settings.soundEnabled, addFocusSession])

  useEffect(() => {
    if (!isRunning) {
      endTimeRef.current = null
      return
    }
    if (!endTimeRef.current) {
      endTimeRef.current = Date.now() + secondsLeft * 1000
    }

    const tick = () => {
      if (!endTimeRef.current) return
      const remaining = Math.min(
        timerSnapshotRef.current.selectedPreset.minutes * 60,
        getRemainingFocusSeconds(endTimeRef.current)
      )
      setSecondsLeft(remaining)

      if (remaining <= 0) {
        const plannedEndAt = endTimeRef.current
        endTimeRef.current = null
        setIsRunning(false)
        if (!completedRef.current) {
          completedRef.current = true
          const snap = timerSnapshotRef.current
          playFocusChime(snap.soundEnabled)
          if (!snap.selectedPreset.isBreak) {
            snap.addFocusSession(
              snap.sessionLabel,
              snap.selectedPreset.minutes,
              plannedEndAt ? new Date(plannedEndAt).toISOString() : undefined,
              plannedEndAt ? `foc-timer-${plannedEndAt}` : undefined,
            )
          }
          setJustFinished(true)
          void sendSystemNotification(
            snap.selectedPreset.isBreak ? 'Waktu Istirahat Selesai!' : 'Sesi Fokus Selesai!',
            snap.selectedPreset.isBreak
              ? 'Waktunya kembali fokus ke prioritas utamamu.'
              : `${snap.sessionLabel} (${snap.selectedPreset.minutes} menit) tercatat ke streak harianmu.`,
            'fokustrack-timer-done'
          )
        }
      }
    }

    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [isRunning])

  // If the app was closed before the deadline, record the completed session once on the next launch.
  useEffect(() => {
    if (!recoveryPending || recoveredExpiredTimerRef.current) return
    recoveredExpiredTimerRef.current = true
    const snap = timerSnapshotRef.current
    const completionAt = initialTimer.pendingCompletionAt ?? initialTimer.endAt ?? Date.now()
    const completedAt = new Date(completionAt).toISOString()

    if (!snap.selectedPreset.isBreak) {
      const recoverySessionId = `foc-timer-${completionAt}`
      pendingRecoverySessionIdRef.current = recoverySessionId
      if (data.focusSessions.some((session) => session.id === recoverySessionId)) {
        // The recovered record is already present in the persisted snapshot.
        pendingRecoverySessionIdRef.current = null
        setRecoveryPending(false)
      } else {
        snap.addFocusSession(snap.sessionLabel, snap.selectedPreset.minutes, completedAt, recoverySessionId)
      }
    } else {
      setRecoveryPending(false)
    }
    // The stable session ID makes recovery idempotent if the app closes between
    // saving the session and clearing this pending marker.
    if (snap.soundEnabled) playFocusChime(true)
    void sendSystemNotification(
      snap.selectedPreset.isBreak ? 'Waktu Istirahat Selesai!' : 'Sesi Fokus Selesai!',
      snap.selectedPreset.isBreak
        ? 'Waktunya kembali fokus ke prioritas utamamu.'
        : `${snap.sessionLabel} (${snap.selectedPreset.minutes} menit) telah selesai saat aplikasi tidak dibuka.`,
      'fokustrack-timer-recovered'
    )
  }, [recoveryPending, initialTimer.pendingCompletionAt, initialTimer.endAt, data.focusSessions])

  // Persist timer progress once per visible second so refreshes do not discard an active session.
  useEffect(() => {
    try {
      localStorage.setItem(FOCUS_TIMER_STORAGE_KEY, JSON.stringify({
        preset: selectedPreset,
        secondsLeft,
        isRunning,
        endAt: isRunning ? endTimeRef.current : null,
        sessionLabel,
        pendingCompletion: recoveryPending,
        pendingCompletionAt: recoveryPending ? initialTimer.pendingCompletionAt : null,
      }))
      setTimerStorageError(false)
    } catch {
      setTimerStorageError(true)
    }
  }, [selectedPreset, secondsLeft, isRunning, sessionLabel, recoveryPending, initialTimer.pendingCompletionAt])

  // Local foreground reminder scheduler: one timeout for the next due reminder,
  // rather than scanning every activity every second (important for large calendars).
  useEffect(() => {
    let timeoutId: number | undefined

    const checkReminders = () => {
      const now = new Date()
      const nowMs = now.getTime()
      let nextTriggerMs = Number.POSITIVE_INFINITY
      const dueAlarms: ActiveAlarm[] = []
      const snoozedActivityIds = new Set<string>()

      for (const act of data.activities) {
        if (act.completed || !act.reminderEnabled) continue

        let triggerDate: Date
        const isSnoozed = Boolean(act.snoozedUntil)
        if (act.snoozedUntil) {
          triggerDate = new Date(act.snoozedUntil)
        } else {
          const startDt = parseActivityDateTime(act.date, act.startTime)
          triggerDate = subtractMinutes(startDt, act.reminderMinutesBefore)
        }

        const triggerMs = triggerDate.getTime()
        if (!Number.isFinite(triggerMs)) continue
        const triggerKey = `${act.id}|${triggerDate.toISOString()}`
        const elapsedMs = nowMs - triggerMs

        if (triggerMs > nowMs) {
          if (!triggeredKeysRef.current.has(triggerKey)) {
            nextTriggerMs = Math.min(nextTriggerMs, triggerMs)
          }
          continue
        }

        if (triggeredKeysRef.current.has(triggerKey)) continue

        if (elapsedMs <= LOCAL_REMINDER_GRACE_MS) {
          triggeredKeysRef.current.add(triggerKey)
          if (triggeredKeysRef.current.size > 500) {
            const keys = Array.from(triggeredKeysRef.current)
            triggeredKeysRef.current = new Set(keys.slice(-300))
          }
          persistTriggeredKeys()

          // Defer state writes until after the scan so a burst of due reminders
          // results in one activity update and one queue update, not thousands.
          if (act.snoozedUntil) snoozedActivityIds.add(act.id)
          dueAlarms.push({
            triggerKey,
            activity: act,
            triggeredAt: now.toISOString(),
            isSnoozed,
          })

          const offsetText = isSnoozed
            ? 'Pengingat tunda (Snooze)'
            : act.reminderMinutesBefore === 0
              ? 'Dimulai sekarang'
              : `${act.reminderMinutesBefore} menit lagi (${act.startTime})`

          // Server Push owns the system notification when connected; foreground
          // still provides the alarm overlay and in-app sound.
          if (backgroundPushStatus !== 'ready') {
            void sendSystemNotification(
              `⏰ Pengingat: ${act.title}`,
              `${offsetText} · ${act.startTime}–${act.endTime} (${act.category})`,
              triggerKey,
              act.reminderMode === 'silent'
            )
          }
        } else {
          // Mark very old reminders once to prevent repeat work on every wake-up.
          triggeredKeysRef.current.add(triggerKey)
          if (triggeredKeysRef.current.size > 500) {
            const keys = Array.from(triggeredKeysRef.current)
            triggeredKeysRef.current = new Set(keys.slice(-300))
          }
          persistTriggeredKeys()
        }
      }

      if (snoozedActivityIds.size > 0) {
        setData((prev) => ({
          ...prev,
          activities: prev.activities.map((item) =>
            snoozedActivityIds.has(item.id) ? { ...item, snoozedUntil: undefined } : item
          ),
        }))
      }

      if (dueAlarms.length > 0) {
        setAlarmQueue((prev) => {
          const existingKeys = new Set(prev.map((alarm) => alarm.triggerKey))
          const additions = dueAlarms.filter((alarm) => !existingKeys.has(alarm.triggerKey))
          // Activity storage is capped at MAX_ACTIVITIES, so retaining every due
          // alarm here is bounded and prevents silently losing reminders in a burst.
          return additions.length > 0 ? [...prev, ...additions] : prev
        })
        const audibleAlarm = dueAlarms.find((alarm) => alarm.activity.reminderMode === 'alarm')
        const chimeAlarm = dueAlarms.find((alarm) => alarm.activity.reminderMode === 'chime')
        if (audibleAlarm) {
          playAlarmBurst(data.settings.soundEnabled, data.settings.alarmSoundType)
        } else if (chimeAlarm) {
          playFocusChime(data.settings.soundEnabled)
        }
      }

      if (Number.isFinite(nextTriggerMs)) {
        const delay = Math.max(1, Math.min(2_147_000_000, nextTriggerMs - Date.now()))
        timeoutId = window.setTimeout(checkReminders, delay)
      }
    }

    const handleWake = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      checkReminders()
    }

    checkReminders()
    window.addEventListener('focus', handleWake)
    document.addEventListener('visibilitychange', handleWake)
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      window.removeEventListener('focus', handleWake)
      document.removeEventListener('visibilitychange', handleWake)
    }
  }, [data.activities, data.settings.soundEnabled, data.settings.alarmSoundType, backgroundPushStatus, persistTriggeredKeys])

  // Keep server-side push schedules in sync with the local activity list.
  useEffect(() => {
    if (backgroundPushStatus !== 'ready') return
    let cancelled = false
    syncBackgroundReminders(data.activities).catch(() => {
      if (!cancelled) setBackgroundPushStatus('error')
    })
    return () => { cancelled = true }
  }, [data.activities, backgroundPushStatus])

  // Repeat alarm sound while an 'alarm'-mode reminder is actively ringing
  useEffect(() => {
    if (!activeAlarm) return
    if (activeAlarm.activity.reminderMode !== 'alarm') return

    const ringInterval = window.setInterval(() => {
      playAlarmBurst(data.settings.soundEnabled, data.settings.alarmSoundType)
    }, 4000)

    return () => window.clearInterval(ringInterval)
  }, [activeAlarm, data.settings.soundEnabled, data.settings.alarmSoundType])

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  function addActivity(item: Omit<ActivityItem, 'id' | 'createdAt'>) {
    if (!item.title.trim() || item.title.trim().length > 120 || !isValidDateKey(item.date) ||
      !isValidTime(item.startTime) || !isValidTime(item.endTime) || item.endTime <= item.startTime) return
    unlockAudioContext()
    const newItem: ActivityItem = {
      ...item,
      title: item.title.trim(),
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    }
    setData((prev) => prev.activities.length >= MAX_ACTIVITIES ? prev : ({
      ...prev,
      activities: sortActivities([...prev.activities, newItem]),
    }))
  }

  function updateActivity(id: string, patch: Partial<ActivityItem>) {
    unlockAudioContext()
    setData((prev) => ({
      ...prev,
      activities: sortActivities(prev.activities.map((activity, index) => {
        if (activity.id !== id) return activity
        const next = { ...activity, ...patch }
        if (!next.title.trim() || next.title.trim().length > 120 || !isValidDateKey(next.date) ||
          !isValidTime(next.startTime) || !isValidTime(next.endTime) || next.endTime <= next.startTime) return activity
        return normalizeActivity(next, index)
      })),
    }))
    if (patch.completed === true || patch.reminderEnabled === false) {
      setAlarmQueue((prev) => removeAlarmFromQueue(prev, id, true))
    }
  }

  function toggleActivity(id: string) {
    unlockAudioContext()
    const completedAt = new Date().toISOString()
    setData((prev) => ({
      ...prev,
      activities: prev.activities.map((activity) =>
        activity.id === id
          ? { ...activity, completed: !activity.completed, completedAt: !activity.completed ? completedAt : undefined, snoozedUntil: undefined }
          : activity
      ),
    }))
    setAlarmQueue((prev) => removeAlarmFromQueue(prev, id, true))
  }

  function deleteActivity(id: string) {
    setData((prev) => ({ ...prev, activities: prev.activities.filter((activity) => activity.id !== id) }))
    setAlarmQueue((prev) => removeAlarmFromQueue(prev, id, true))
  }

  function addTransaction(item: Omit<TransactionItem, 'id' | 'createdAt'>) {
    if (!item.title.trim() || item.title.trim().length > 120 || !isValidDateKey(item.date) ||
      !Number.isSafeInteger(item.amount) || item.amount <= 0 || item.amount > MAX_TRANSACTION_AMOUNT) return
    if (!transactionCategories.includes(item.category) || !isTransactionCategoryAllowed(item.type, item.category)) return
    const newTx: TransactionItem = {
      ...item,
      title: item.title.trim(),
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    }
    setData((prev) => prev.transactions.length >= MAX_TRANSACTIONS ? prev : ({
      ...prev,
      transactions: [newTx, ...prev.transactions],
    }))
  }

  function deleteTransaction(id: string) {
    setData((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((t) => t.id !== id),
    }))
  }

  function updateSettings(patch: Partial<AppSettings>) {
    setData((prev) => ({
      ...prev,
      settings: normalizeSettings({ ...prev.settings, ...patch }),
    }))
  }

  // Focus timer controls
  function selectPreset(preset: FocusPreset) {
    if (isRunning) return
    const minutes = Math.floor(Number(preset.minutes))
    if (!Number.isFinite(minutes) || minutes < MIN_FOCUS_MINUTES || minutes > MAX_FOCUS_MINUTES) return

    unlockAudioContext()
    setIsRunning(false)
    endTimeRef.current = null
    completedRef.current = false
    setJustFinished(false)
    setRecoveryPending(false)
    setSelectedPreset({
      id: typeof preset.id === 'string' && preset.id.trim() ? preset.id.slice(0, 80) : `custom-${minutes}`,
      label: typeof preset.label === 'string' && preset.label.trim() ? preset.label.slice(0, 80) : `${minutes} menit`,
      minutes,
      isBreak: preset.isBreak === true,
    })
    setSecondsLeft(minutes * 60)
  }

  function startPauseTimer() {
    unlockAudioContext()
    if (isRunning) {
      setIsRunning(false)
      endTimeRef.current = null
      return
    }
    const startingSeconds = secondsLeft === 0 ? selectedPreset.minutes * 60 : secondsLeft
    if (secondsLeft === 0 || justFinished) {
      completedRef.current = false
      setJustFinished(false)
      setRecoveryPending(false)
      if (secondsLeft === 0) setSecondsLeft(startingSeconds)
    }
    endTimeRef.current = Date.now() + startingSeconds * 1000
    setIsRunning(true)
  }

  function resetTimer() {
    setIsRunning(false)
    endTimeRef.current = null
    completedRef.current = false
    setJustFinished(false)
    setRecoveryPending(false)
    setSecondsLeft(selectedPreset.minutes * 60)
  }

  function completeTimerNow() {
    if (selectedPreset.isBreak) return
    unlockAudioContext()
    if (completedRef.current) return
    const totalSeconds = selectedPreset.minutes * 60
    const rawSecondsLeft = isRunning && endTimeRef.current
      ? Math.ceil((endTimeRef.current - Date.now()) / 1000)
      : secondsLeft
    const elapsedMinutes = getElapsedFocusMinutes(totalSeconds, rawSecondsLeft)
    if (elapsedMinutes < 1) return
    addFocusSession(sessionLabel, Math.min(selectedPreset.minutes, elapsedMinutes))
    completedRef.current = true
    playFocusChime(data.settings.soundEnabled)
    setIsRunning(false)
    endTimeRef.current = null
    setSecondsLeft(selectedPreset.minutes * 60)
    setJustFinished(true)
  }

  function startFocusForActivity(title: string, onNavigate?: (tab: AppTab) => void) {
    // Starting from Beranda must honor the custom duration selected on the Focus page.
    // A currently selected break preset falls back to the standard 25-minute focus preset.
    const hasPausedTimer = secondsLeft > 0 && secondsLeft < selectedPreset.minutes * 60
    if (isRunning || hasPausedTimer) {
      if (onNavigate) onNavigate('focus')
      return
    }
    unlockAudioContext()
    const targetPreset = selectedPreset.isBreak ? FOCUS_PRESETS[0] : selectedPreset
    setSelectedPreset(targetPreset)
    setSessionLabel(title.trim().slice(0, 120) || 'Sesi Fokus Mendalam')
    setSecondsLeft(targetPreset.minutes * 60)
    completedRef.current = false
    setJustFinished(false)
    setRecoveryPending(false)
    endTimeRef.current = Date.now() + targetPreset.minutes * 60 * 1000
    setIsRunning(true)
    if (onNavigate) onNavigate('focus')
  }

  // Reminder & Notification controls
  async function requestNotifications(): Promise<BrowserNotificationStatus> {
    unlockAudioContext()
    const status = await requestBrowserNotificationPermission()
    setNotificationPermission(status)
    if (status === 'granted') {
      const pushStatus = await registerBackgroundPush()
      setBackgroundPushStatus(pushStatus)
      if (pushStatus === 'ready') {
        try {
          await syncBackgroundReminders(data.activities)
        } catch {
          setBackgroundPushStatus('error')
        }
      }
    }
    return status
  }

  function snoozeActiveAlarm(minutes = 5) {
    if (!activeAlarm) return
    const safeMinutes = Number.isFinite(minutes) ? Math.min(60, Math.max(1, Math.floor(minutes))) : 5
    const targetId = activeAlarm.activity.id
    const snoozeTime = new Date(Date.now() + safeMinutes * 60_000).toISOString()
    setData((prev) => ({
      ...prev,
      activities: prev.activities.map((a) =>
        a.id === targetId ? { ...a, snoozedUntil: snoozeTime } : a
      ),
    }))
    setAlarmQueue((prev) => prev.slice(1))
  }

  function dismissActiveAlarm(markCompleted = false) {
    if (!activeAlarm) return
    const targetId = activeAlarm.activity.id
    if (markCompleted && targetId !== 'test-alarm') {
      toggleActivity(targetId)
      return
    }
    setAlarmQueue((prev) => removeAlarmFromQueue(prev, targetId, false))
  }

  function triggerTestAlarm() {
    unlockAudioContext()
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const end = new Date(now.getTime() + 60_000)
    const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
    const sampleActivity: ActivityItem = {
      id: 'test-alarm',
      title: 'Tes Pengingat & Alarm FokusTrack',
      date: todayKey,
      startTime: `${hh}:${mm}`,
      endTime,
      category: 'Kerja',
      priority: 'Tinggi',
      completed: false,
      notes: 'Ini adalah simulasi alarm & notifikasi kegiatanmu.',
      reminderEnabled: true,
      reminderMinutesBefore: 0,
      reminderMode: 'alarm',
      createdAt: now.toISOString(),
    }
    setAlarmQueue((prev) => [
      ...prev,
      {
        triggerKey: `test-${now.getTime()}`,
        activity: sampleActivity,
        triggeredAt: now.toISOString(),
      },
    ])
    playAlarmBurst(data.settings.soundEnabled, data.settings.alarmSoundType)
    if (backgroundPushStatus === 'ready') {
      void sendBackgroundPushTest().then((sent) => {
        if (!sent) {
          setBackgroundPushStatus('error')
          void sendSystemNotification(
            '⏰ Tes Alarm FokusTrack',
            'Push server tidak merespons. Ini adalah notifikasi lokal dari aplikasi.',
            'fokustrack-test-alarm-fallback'
          )
        }
      })
    } else {
      void sendSystemNotification(
        '⏰ Tes Alarm FokusTrack',
        'Uji notifikasi sistem FokusTrack. Suara notifikasi mengikuti pengaturan perangkat.',
        'fokustrack-test-alarm'
      )
    }
  }

  // PWA Install controls
  function dismissInstallBanner() {
    setInstallBannerDismissed(true)
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, 'true')
    } catch {
      // Ignore
    }
  }

  async function promptInstallPwa(): Promise<boolean> {
    if (!deferredPrompt) return false
    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null)
        setIsStandalonePwa(true)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  // Metrics & Streak (100% accurate, 0 when consistency has not started)
  const metrics = useMemo(() => {
    const todayFocusMinutes = data.focusSessions
      .filter((s) => s.date === todayKey)
      .reduce((acc, s) => acc + s.minutes, 0)

    const todayTasks = data.activities.filter((a) => a.date === todayKey)
    const completedTodayTasks = todayTasks.filter((a) => a.completed).length

    const focusRatio =
      data.settings.dailyFocusGoalMinutes > 0
        ? Math.min(1, todayFocusMinutes / data.settings.dailyFocusGoalMinutes)
        : 0
    const taskRatio = todayTasks.length > 0 ? completedTodayTasks / todayTasks.length : 0
    const todayGoalProgress = Math.round(
      (todayTasks.length > 0 ? focusRatio * 0.6 + taskRatio * 0.4 : focusRatio) * 100
    )

    // Consistency is based on actual completion timestamps, so a task completed
    // after midnight counts on the day it was actually completed.
    const consistency = calculateConsistency(
      data.focusSessions,
      data.activities,
      data.streakResetAt,
      new Date(clockNowMs),
    )
    const { hasStartedConsistency, streakCount } = consistency

    const upcomingRemindersCount = data.activities.filter((activity) => {
      if (activity.completed || !activity.reminderEnabled) return false
      const triggerDate = activity.snoozedUntil
        ? new Date(activity.snoozedUntil)
        : subtractMinutes(
            parseActivityDateTime(activity.date, activity.startTime),
            activity.reminderMinutesBefore
          )
      return Number.isFinite(triggerDate.getTime()) && triggerDate.getTime() >= clockNowMs
    }).length

    const monthPrefix = todayKey.slice(0, 7)
    let totalBalance = 0
    let monthIncome = 0
    let monthExpense = 0
    let todayExpense = 0

    for (const tx of data.transactions) {
      if (tx.type === 'income') {
        totalBalance += tx.amount
        if (tx.date.startsWith(monthPrefix)) monthIncome += tx.amount
      } else {
        totalBalance -= tx.amount
        if (tx.date.startsWith(monthPrefix)) monthExpense += tx.amount
        if (tx.date === todayKey) todayExpense += tx.amount
      }
    }

    const remainingDailyBudget = data.settings.dailyBudgetLimit - todayExpense

    return {
      streakCount,
      hasStartedConsistency,
      todayFocusMinutes,
      todayGoalProgress,
      totalBalance,
      monthIncome,
      monthExpense,
      todayExpense,
      remainingDailyBudget,
      upcomingRemindersCount,
    }
  }, [data, todayKey, clockNowMs])

  function exportBackupJson(): string {
    // Compact JSON reduces the chance that a valid local snapshot exceeds restore limits.
    return JSON.stringify(data)
  }

  function importBackupJson(jsonString: string): boolean {
    // Check encoded byte size before JSON.parse to avoid parsing an oversized user-selected file.
    if (typeof jsonString !== 'string' || jsonString.length === 0 || new Blob([jsonString]).size > MAX_BACKUP_BYTES) return false
    try {
      const parsed = JSON.parse(jsonString) as Partial<PersistedData>
      const schemaVersion = (parsed as { schemaVersion?: unknown }).schemaVersion
      if (schemaVersion !== undefined && schemaVersion !== 3 && schemaVersion !== 4) return false
      const normalized = normalizePersistedData(parsed)
      if (!normalized) return false
      if (parsed.transactions && normalized.transactions.length !== parsed.transactions.length) return false
      if (Array.isArray(parsed.focusSessions) && normalized.focusSessions.length !== parsed.focusSessions.length) return false
      setData(normalized)
      return true
    } catch {
      return false
    }
  }

  function resetStreakOnly() {
    setData((prev) => ({
      ...prev,
      streakResetAt: new Date().toISOString(),
    }))
  }

  function resetAllData() {
    triggeredKeysRef.current.clear()
    persistTriggeredKeys()
    setAlarmQueue([])
    setIsRunning(false)
    endTimeRef.current = null
    completedRef.current = false
    setJustFinished(false)
    setRecoveryPending(false)
    pendingRecoverySessionIdRef.current = null
    setSelectedPreset(FOCUS_PRESETS[0])
    setSessionLabel('Sesi Fokus Mendalam')
    setSecondsLeft(FOCUS_PRESETS[0].minutes * 60)
    try {
      localStorage.removeItem(FOCUS_TIMER_STORAGE_KEY)
      localStorage.removeItem(LEGACY_FOCUS_TIMER_STORAGE_KEY)
      localStorage.removeItem(LEGACY_STORAGE_KEY)
      localStorage.removeItem(LEGACY_TRIGGERED_KEY)
    } catch {
      setTimerStorageError(true)
      setDataStorageError(true)
    }
    setData(getEmptyData())
  }

  function loadSampleData() {
    const today = toDateKey()
    const now = new Date()
    const sampleTimestamp = now.getTime()
    const sampleDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const sampleDateKey = toDateKey(sampleDate)
    const nextHour = '09'
    const nextEndHour = '10'

    setData((prev) => {
      // Seed actions must never replace user data or append the same fixtures repeatedly.
      if (
        prev.activities.some((item) => item.id.startsWith('sample-act-')) ||
        prev.transactions.some((item) => item.id.startsWith('sample-tx-'))
      ) return prev

      const sampleActivities: ActivityItem[] = [
        {
          id: `sample-act-1-${sampleTimestamp}`,
          title: 'Deep Work: Prioritas Utama Hari Ini',
          date: sampleDateKey,
          startTime: `${nextHour}:00`,
          endTime: `${nextEndHour}:00`,
          category: 'Kerja',
          priority: 'Tinggi',
          completed: false,
          notes: 'Fokus penuh dengan pengingat.',
          reminderEnabled: true,
          reminderMinutesBefore: 10,
          reminderMode: 'alarm',
          createdAt: now.toISOString(),
        },
        {
          id: `sample-act-2-${sampleTimestamp}`,
          title: 'Evaluasi Anggaran Harian',
          date: sampleDateKey,
          startTime: '11:00',
          endTime: '11:30',
          category: 'Pribadi',
          priority: 'Sedang',
          completed: false,
          reminderEnabled: true,
          reminderMinutesBefore: 5,
          reminderMode: 'chime',
          createdAt: now.toISOString(),
        },
      ]
      if (prev.activities.length + 2 > MAX_ACTIVITIES || prev.transactions.length + 2 > MAX_TRANSACTIONS) return prev

      const sampleTransactions: TransactionItem[] = [
        {
          id: `sample-tx-1-${sampleTimestamp}`,
          title: 'Saldo Tabungan Awal',
          amount: 2500000,
          type: 'income',
          category: 'Tabungan',
          date: today,
          createdAt: now.toISOString(),
        },
        {
          id: `sample-tx-2-${sampleTimestamp}`,
          title: 'Sarapan & Kopi',
          amount: 28000,
          type: 'expense',
          category: 'Makan & Minum',
          date: today,
          createdAt: now.toISOString(),
        },
      ]
      return {
        ...prev,
        activities: sortActivities([...prev.activities, ...sampleActivities]),
        transactions: [...prev.transactions, ...sampleTransactions],
      }
    })
  }

  const updateSessionLabel = useCallback((label: string) => {
    setSessionLabel(label.slice(0, 120))
  }, [])

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        todayKey,
        activities: data.activities,
        addActivity,
        updateActivity,
        toggleActivity,
        deleteActivity,
        transactions: data.transactions,
        addTransaction,
        deleteTransaction,
        focusSessions: data.focusSessions,
        addFocusSession,
        settings: data.settings,
        updateSettings,
        ...metrics,
        selectedPreset,
        secondsLeft,
        isRunning,
        sessionLabel,
        setSessionLabel: updateSessionLabel,
        storageError,
        justFinished,
        selectPreset,
        startPauseTimer,
        resetTimer,
        completeTimerNow,
        startFocusForActivity,
        notificationPermission,
        requestNotifications,
        backgroundPushStatus,
        activeAlarm,
        snoozeActiveAlarm,
        dismissActiveAlarm,
        triggerTestAlarm,
        canInstallPwa: Boolean(deferredPrompt),
        isStandalonePwa,
        installBannerDismissed,
        dismissInstallBanner,
        promptInstallPwa,
        exportBackupJson,
        importBackupJson,
        resetStreakOnly,
        resetAllData,
        loadSampleData,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
