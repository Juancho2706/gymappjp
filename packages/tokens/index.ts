export const evaTokens = {
  color: {
    brandPrimary: '#10B981',
    systemPrimary: '#007AFF',
    background: '#FFFFFF',
    foreground: '#09090B',
    muted: '#F4F4F5',
    mutedForeground: '#71717A',
    border: '#E4E4E7',
    card: '#FFFFFF',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#0EA5E9',
  },
  radius: {
    sm: 4,
    md: 6,
    lg: 8,
    xl: 12,
    full: 9999,
  },
  font: {
    sans: 'Inter, system-ui, sans-serif',
    display: 'Inter, system-ui, sans-serif',
  },
  spacing: {
    safeBottom: 'env(safe-area-inset-bottom, 0px)',
    safeTop: 'env(safe-area-inset-top, 0px)',
  },
} as const

export type EvaTokens = typeof evaTokens
