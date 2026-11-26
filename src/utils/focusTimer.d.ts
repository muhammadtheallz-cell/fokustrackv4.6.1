export declare const MIN_FOCUS_MINUTES: number
export declare const MAX_FOCUS_MINUTES: number
export declare function getCustomDurationMinutes(hours: number, minutes: number): number | null
export declare function formatFocusDurationLabel(minutes: number): string
export declare function formatFocusClock(seconds: number, forceHours?: boolean): string
export declare function getRemainingFocusSeconds(endAt: number, now?: number): number
export declare function getElapsedFocusMinutes(totalSeconds: number, remainingSeconds: number): number
