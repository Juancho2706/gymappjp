export interface Theme {
  primary: string
  background: string
  card: string
  text: string
  textSecondary: string
  muted: string
  border: string
  destructive: string
  success: string
}

export const lightTheme: Theme = {
  primary: '#007AFF',
  background: '#FFFFFF',
  card: '#F2F2F7',
  text: '#000000',
  textSecondary: '#6B6B6B',
  muted: '#6B6B6B',
  border: '#C6C6C8',
  destructive: '#FF3B30',
  success: '#34C759',
}

export const darkTheme: Theme = {
  primary: '#0A84FF',
  background: '#000000',
  card: '#1C1C1E',
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  muted: '#8E8E93',
  border: '#38383A',
  destructive: '#FF453A',
  success: '#30D158',
}

// Override with coach branding: primaryColor from DB replaces `primary`
export function applyCoachBranding(base: Theme, primaryColor?: string | null): Theme {
  if (!primaryColor) return base
  return { ...base, primary: primaryColor }
}
