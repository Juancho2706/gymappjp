export const enterpriseTokens = {
  colors: {
    navy: '#0A1B3F',
    blue: '#007AFF',
    blueDeep: '#0040DD',
    cyan: '#00E5FF',
    ink: '#121212',
    mist: '#F8FAFC',
    line: 'rgba(0,0,0,0.10)',
    pain: '#FF3B30',
    gold: '#FBBF24',
  },
  gradients: {
    hero: 'linear-gradient(180deg, #000000 0%, #0040DD 60%, #ffffff 100%)',
    heroInverse: 'linear-gradient(0deg, #000000 0%, #0040DD 60%, #ffffff 100%)',
    brand: 'linear-gradient(90deg, #0A1B3F 0%, #007AFF 55%, #00E5FF 100%)',
    cyanText: 'linear-gradient(90deg, #00E5FF 0%, #007AFF 100%)',
    glass: 'rgba(255,255,255,0.07)',
    cardTonal: 'linear-gradient(180deg, #ffffff 0%, #F8FAFC 100%)',
    gridSubtle:
      'linear-gradient(rgba(10,27,63,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(10,27,63,.04) 1px, transparent 1px)',
  },
  shadows: {
    glowBlue: '0 0 24px -4px rgba(0,122,255,0.45)',
    glowCyan: '0 0 32px -6px rgba(0,229,255,0.35)',
    cardSoft: '0 8px 32px 0 rgba(10,27,63,0.08)',
    cardLift: '0 12px 48px 0 rgba(0,122,255,0.12)',
  },
  motion: {
    ease: [0.16, 1, 0.3, 1] as const,
    duration: 0.45,
    stagger: 0.08,
    reveal: {
      hidden: { opacity: 0, y: 24 },
      visible: { opacity: 1, y: 0 },
    },
    scale: {
      hidden: { opacity: 0, scale: 0.96 },
      visible: { opacity: 1, scale: 1 },
    },
  },
} as const

export type EnterpriseTokens = typeof enterpriseTokens
