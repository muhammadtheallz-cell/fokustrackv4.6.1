export declare function localDateKey(value: Date | string | number): string | null
export declare function calculateConsistency(
  focusSessions: Array<{ minutes: number; date?: string; completedAt?: string }>,
  activities: Array<{ completed: boolean; date?: string; completedAt?: string }>,
  streakResetAt?: string,
  now?: Date,
): { hasStartedConsistency: boolean; streakCount: number }
export declare function aggregateTransactionsForDays(
  transactions: Array<{ date: string; amount: number; type: 'income' | 'expense' }>,
  dayKeys: string[],
): { daily: Array<{ dayKey: string; label: string; income: number; expense: number }>; maxVal: number }
