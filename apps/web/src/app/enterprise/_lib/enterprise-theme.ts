export const enterpriseTheme = {
  colors: {
    bg: {
      base: '#09090b',
      section: '#020617',
      card: 'rgba(24,24,27,0.6)',
      cardSolid: '#18181b',
      input: '#27272a',
    },
    border: {
      subtle: '#27272a',
      accent: 'rgba(245,158,11,0.25)',
      accentHover: 'rgba(245,158,11,0.5)',
    },
    text: {
      primary: '#f4f4f5',
      secondary: '#a1a1aa',
      muted: '#71717a',
      accent: '#fbbf24',
      accentHover: '#fde68a',
    },
    accent: {
      primary: '#fbbf24',
      emphasis: '#f59e0b',
      strong: '#d97706',
      glow: 'rgba(251,191,36,0.15)',
      glowStrong: 'rgba(251,191,36,0.25)',
    },
  },
  gradients: {
    goldButton: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    goldButtonHover: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
    heroMesh: 'radial-gradient(ellipse 80% 60% at 60% -10%, rgba(245,158,11,0.12), transparent), radial-gradient(ellipse 50% 40% at 90% 60%, rgba(251,191,36,0.06), transparent)',
    cardGlow: 'radial-gradient(ellipse 60% 60% at 50% 0%, rgba(251,191,36,0.08), transparent)',
    grid: `linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)`,
  },
  shadows: {
    goldGlow: '0 0 40px rgba(245,158,11,0.15)',
    card: '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)',
    buttonGold: '0 4px 24px rgba(245,158,11,0.3), 0 1px 4px rgba(0,0,0,0.5)',
  },
  motion: {
    fadeUp: { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } },
    fadeIn: { initial: { opacity: 0 }, animate: { opacity: 1 } },
    stagger: 0.08,
    duration: 0.45,
    easing: [0.16, 1, 0.3, 1] as const,
  },
} as const

export type EnterpriseTheme = typeof enterpriseTheme
