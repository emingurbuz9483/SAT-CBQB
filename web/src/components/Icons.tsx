const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const CheckIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

export const CrossIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const CloseIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...base} strokeWidth={2}>
    <path d="M5 5l14 14M19 5L5 19" />
  </svg>
)

export const Logo = () => (
  <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
    <rect x="2" y="2" width="28" height="28" rx="8" fill="#14bf96" />
    <path d="M9 11h14M9 16h10M9 21h7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="22.5" cy="21" r="3" fill="#fff" />
  </svg>
)
