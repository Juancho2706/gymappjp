/** @type {import('tailwindcss').Config} */
// Tokens mirror the web design system (apps/web globals.css + lib/theme.ts).
// Colors use rgb-channel CSS vars so Tailwind opacity modifiers work
// (e.g. bg-primary/50, border-border/10). Dynamic brand override is injected
// at runtime via NativeWind `vars()` in ThemeContext (fed by @eva/brand-kit).
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        'primary-foreground': 'rgb(var(--color-primary-foreground) / <alpha-value>)',
        background: 'rgb(var(--color-background) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        'muted-foreground': 'rgb(var(--color-muted-foreground) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        'accent-foreground': 'rgb(var(--color-accent-foreground) / <alpha-value>)',
        cyan: 'rgb(var(--color-cyan) / <alpha-value>)',
        destructive: 'rgb(var(--color-destructive) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
      },
      borderRadius: {
        sm: '7px', md: '10px', lg: '12px', xl: '17px', '2xl': '22px', '3xl': '26px',
      },
      fontFamily: {
        sans: ['Inter_400Regular'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
        display: ['Montserrat_700Bold'],
        'display-extra': ['Montserrat_800ExtraBold'],
      },
    },
  },
  plugins: [],
}
