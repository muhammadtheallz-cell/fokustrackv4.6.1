import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'focus'
  | 'sun'
  | 'moon'
  | 'grid'
  | 'timer'
  | 'calendar'
  | 'wallet'
  | 'arrow-up-right'
  | 'arrow-down-left'
  | 'plus'
  | 'clock'
  | 'check'
  | 'trash'
  | 'edit'
  | 'play'
  | 'pause'
  | 'rotate-ccw'
  | 'eye'
  | 'eye-off'
  | 'download'
  | 'upload'
  | 'sliders'
  | 'x'
  | 'chevron-left'
  | 'chevron-right'
  | 'sparkles'
  | 'target'
  | 'chart'
  | 'receipt'
  | 'calendar-plus'
  | 'volume-2'
  | 'volume-x'
  | 'bell'
  | 'bell-ring'
  | 'bell-off'
  | 'smartphone'
  | 'zap'
  | 'alert-triangle'

type Props = SVGProps<SVGSVGElement> & { name: IconName; size?: number }

export default function Icon({ name, size = 20, ...props }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.85,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  }

  const paths: Record<IconName, ReactNode> = {
    focus: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 1.8v2.1M22.2 12h-2.1" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
      </>
    ),
    moon: <path d="M20.6 15.2A8.8 8.8 0 0 1 8.8 3.4 8.9 8.9 0 1 0 20.6 15.2Z" />,
    grid: (
      <>
        <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
      </>
    ),
    timer: (
      <>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5M9 2h6M12 2v3" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    wallet: (
      <>
        <rect x="2.8" y="5.5" width="18.4" height="15.3" rx="3" />
        <path d="M3 9h18M16 14h.01M6 5.5V4.6A1.8 1.8 0 0 1 7.8 2.8h10" />
      </>
    ),
    'arrow-up-right': <path d="M7 17 17 7M7 7h10v10" />,
    'arrow-down-left': <path d="M17 7 7 17M17 17H7V7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),
    check: <path d="m5 12 4.2 4.2L19 6.5" />,
    trash: (
      <>
        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </>
    ),
    play: <polygon points="6 4 20 12 6 20 6 4" />,
    pause: (
      <>
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </>
    ),
    'rotate-ccw': (
      <>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    'eye-off': (
      <>
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
        <line x1="2" y1="2" x2="22" y2="22" />
      </>
    ),
    download: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </>
    ),
    upload: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </>
    ),
    sliders: (
      <>
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="17" y1="16" x2="23" y2="16" />
      </>
    ),
    x: <path d="M18 6 6 18M6 6l12 12" />,
    'chevron-left': <path d="m15 18-6-6 6-6" />,
    'chevron-right': <path d="m9 18 6-6-6-6" />,
    sparkles: (
      <>
        <path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" />
        <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16ZM5 2l.5 1.5L7 4l-1.5.5L5 6l-.5-1.5L3 4l1.5-.5L5 2Z" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V10m8 10V4m8 16v-7" />
        <path d="M2 20h20" />
      </>
    ),
    receipt: (
      <>
        <path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" />
        <path d="M8 8h8M8 12h8M8 16h4" />
      </>
    ),
    'calendar-plus': (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M16 3v4M8 3v4M3 10h18M12 13v6M9 16h6" />
      </>
    ),
    'volume-2': (
      <>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </>
    ),
    'volume-x': (
      <>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </>
    ),
    'bell-ring': (
      <>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        <path d="M2 8c0-2.2.7-4.3 2-6" />
        <path d="M22 8a10 10 0 0 0-2-6" />
      </>
    ),
    'bell-off': (
      <>
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
        <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
        <path d="M18 8a6 6 0 0 0-9.33-5" />
        <line x1="2" y1="2" x2="22" y2="22" />
      </>
    ),
    smartphone: (
      <>
        <rect x="5" y="2" width="14" height="20" rx="2.5" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </>
    ),
    zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
    'alert-triangle': (
      <>
        <path d="M10.3 3.86 2.43 17.5A2 2 0 0 0 4.17 20.5h15.66a2 2 0 0 0 1.74-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4m0 4h.01" />
      </>
    ),
  }

  return (
    <svg {...common} aria-hidden="true">
      {paths[name]}
    </svg>
  )
}
