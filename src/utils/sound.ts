import type { AlarmSoundType } from '../types'

let sharedAudioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return null
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx()
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {})
  }
  return sharedAudioCtx
}

export function unlockAudioContext(): void {
  getAudioContext()
}

export function playFocusChime(enabled: boolean): void {
  if (!enabled) return
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      const start = ctx.currentTime + idx * 0.13
      osc.frequency.setValueAtTime(freq, start)
      gain.gain.setValueAtTime(0.001, start)
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.6)
    })
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.([180, 90, 180])
    }
  } catch {
    // Ignore autoplay restrictions
  }
}

export function playAlarmBurst(enabled: boolean, soundType: AlarmSoundType = 'classic'): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate?.([320, 140, 320, 140, 480])
  }
  if (!enabled) return
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const patterns: Record<AlarmSoundType, { freqs: number[]; step: number; type: OscillatorType; peak: number }> = {
      classic: {
        freqs: [880, 1108.73, 880, 1108.73, 1318.51],
        step: 0.15,
        type: 'triangle',
        peak: 0.22,
      },
      gentle: {
        freqs: [587.33, 739.99, 880, 1174.66],
        step: 0.2,
        type: 'sine',
        peak: 0.18,
      },
      pulse: {
        freqs: [987.77, 987.77, 1318.51, 987.77, 1318.51],
        step: 0.13,
        type: 'sine',
        peak: 0.24,
      },
    }

    const pattern = patterns[soundType] || patterns.classic
    pattern.freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = pattern.type
      const start = ctx.currentTime + idx * pattern.step
      osc.frequency.setValueAtTime(freq, start)
      gain.gain.setValueAtTime(0.001, start)
      gain.gain.exponentialRampToValueAtTime(pattern.peak, start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + pattern.step + 0.18)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + pattern.step + 0.22)
    })
  } catch {
    // Ignore autoplay restrictions
  }
}
