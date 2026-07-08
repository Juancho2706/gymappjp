/** @type {import('tailwindcss').Config} */
// Tokens mirror the web design system (apps/web globals.css + lib/theme.ts) and
// specs/redesign-eva-ds/token-contract.md. Colors use rgb-channel CSS vars so
// Tailwind opacity modifiers work (e.g. bg-sport-500/40, border-border-subtle/[0.07]).
// Dynamic brand override is injected at runtime via NativeWind `vars()` in
// ThemeContext (fed by @eva/brand-kit).
//
// Naming note: semantic surface/text/border tokens are declared under
// backgroundColor / textColor / borderColor so their utilities read naturally
// (bg-surface-card, text-strong, border-subtle) WITHOUT colliding with the
// legacy `muted` color key (which still drives bg-muted = surface-sunken).
const ch = (name) => `rgb(var(--color-${name}) / <alpha-value>)`

module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ---- Legacy compat (keep: existing components rely on these) ----
        primary: ch('primary'),
        'primary-foreground': ch('primary-foreground'),
        background: ch('background'),
        card: ch('card'),
        foreground: ch('foreground'),
        muted: ch('muted'),
        'muted-foreground': ch('muted-foreground'),
        border: ch('border'),
        accent: ch('accent'),
        'accent-foreground': ch('accent-foreground'),
        cyan: ch('cyan'),
        destructive: ch('destructive'),
        success: ch('success'),

        // ---- DS base ramps (bg-/text-/border-* all generated) ----
        ink: {
          50: ch('ink-50'), 100: ch('ink-100'), 200: ch('ink-200'), 300: ch('ink-300'),
          400: ch('ink-400'), 500: ch('ink-500'), 600: ch('ink-600'), 700: ch('ink-700'),
          800: ch('ink-800'), 900: ch('ink-900'), 950: ch('ink-950'),
        },
        paper: ch('paper'),
        white: ch('white'),
        sport: {
          100: ch('sport-100'), 200: ch('sport-200'), 300: ch('sport-300'), 400: ch('sport-400'),
          500: ch('sport-500'), 600: ch('sport-600'), 700: ch('sport-700'),
        },
        ember: {
          100: ch('ember-100'), 200: ch('ember-200'), 300: ch('ember-300'), 400: ch('ember-400'),
          500: ch('ember-500'), 600: ch('ember-600'), 700: ch('ember-700'),
        },
        aqua: {
          100: ch('aqua-100'), 200: ch('aqua-200'), 400: ch('aqua-400'),
          500: ch('aqua-500'), 600: ch('aqua-600'), 700: ch('aqua-700'),
        },
        warning: {
          100: ch('warning-100'), 500: ch('warning-500'), 600: ch('warning-600'), 700: ch('warning-700'),
        },
        danger: {
          100: ch('danger-100'), 500: ch('danger-500'), 600: ch('danger-600'), 700: ch('danger-700'),
        },
        info: {
          100: ch('info-100'), 500: ch('info-500'), 600: ch('info-600'),
        },
        // success ramp (note: bare `success` legacy key kept above = success-500)
        'success-100': ch('success-100'),
        'success-500': ch('success-500'),
        'success-600': ch('success-600'),
        'success-700': ch('success-700'),

        // ---- DS brand / action / accent (used as bg AND text) ----
        brand: ch('brand'),
        'brand-strong': ch('brand-strong'),
        'action-primary': ch('action-primary'),
        'action-primary-hover': ch('action-primary-hover'),
        'cta-fill': ch('cta-fill'),
        'cta-danger': ch('cta-danger'),
        'accent-training': ch('accent-training'),
        'accent-nutrition': ch('accent-nutrition'),
        'accent-recovery': ch('accent-recovery'),
        'focus-ring': ch('focus-ring'),
        track: ch('track'),

        // ---- Data-viz categorical palette (mirrors web globals.css --viz-1..6) ----
        viz: {
          1: ch('viz-1'), 2: ch('viz-2'), 3: ch('viz-3'),
          4: ch('viz-4'), 5: ch('viz-5'), 6: ch('viz-6'),
        },
      },

      // Semantic surfaces -> bg-surface-app / bg-surface-card / ...
      backgroundColor: {
        'surface-app': ch('surface-app'),
        'surface-card': ch('surface-card'),
        'surface-sunken': ch('surface-sunken'),
        'surface-inverse': ch('surface-inverse'),
        'surface-inverse-2': ch('surface-inverse-2'),
        'surface-overlay': ch('surface-overlay'),
      },

      // Semantic text -> text-strong / text-body / text-muted / text-subtle / text-link
      textColor: {
        strong: ch('text-strong'),
        body: ch('text-body'),
        muted: ch('text-muted'),
        subtle: ch('text-subtle'),
        link: ch('text-link'),
        'on-sport': ch('text-on-sport'),
        'on-success': ch('text-on-success'),
        'on-warning': ch('text-on-warning'),
        'on-ember': ch('text-on-ember'),
        'on-dark': ch('text-on-dark'),
        'on-dark-muted': ch('text-on-dark-muted'),
      },

      // Semantic borders -> border-subtle / border-default / border-strong / border-inverse
      borderColor: {
        subtle: ch('border-subtle'),
        default: ch('border-default'),
        strong: ch('border-strong'),
        inverse: ch('border-inverse'),
      },

      borderRadius: {
        sm: '7px', md: '10px', lg: '12px', xl: '17px', '2xl': '22px', '3xl': '26px',
        // DS semantic radii
        card: '20px', control: '14px', pill: '9999px', sheet: '28px',
      },

      // DS spacing — 4px grid (mirrors web globals.css --space-0..13 + sizing tokens).
      // Namespaced as `space-*` / `gutter-*` / `control-*` / `icon-*` so these do NOT
      // override Tailwind's default numeric spacing scale that existing screens use
      // (p-4 stays 16px). Consume as p-space-5, gap-space-4, w-icon-lg, etc.
      spacing: {
        'space-0': '0px', 'space-1': '2px', 'space-2': '4px', 'space-3': '8px',
        'space-4': '12px', 'space-5': '16px', 'space-6': '20px', 'space-7': '24px',
        'space-8': '32px', 'space-9': '40px', 'space-10': '48px', 'space-11': '64px',
        'space-12': '80px', 'space-13': '96px',
        'gutter-screen': '20px', 'gutter-card': '16px',
        'hit-min': '44px', 'control-sm': '36px', 'control-md': '48px', 'control-lg': '56px',
        'icon-xs': '16px', 'icon-sm': '18px', 'icon-md': '20px', 'icon-lg': '24px', 'icon-xl': '32px',
      },
      maxWidth: {
        content: '440px',
      },
      fontFamily: {
        // Legacy weight-utility aliases (font-medium / font-semibold / font-display-extra).
        // On web these are Hanken (UI/body) and Archivo (display) at the given weight —
        // NOT Inter/Montserrat. Remapped to the EVA families so a re-skin writing
        // className="font-semibold" gets Hanken, and "font-display-extra" gets Archivo
        // (mirrors --font-ui=Hanken / --font-display=Archivo in web globals.css).
        // Duplicates of sans-medium / sans-semibold / display-bold; kept as aliases so
        // current screens keep compiling. Purge with the Inter/Montserrat legacy sweep.
        medium: ['HankenGrotesk_500Medium'],
        semibold: ['HankenGrotesk_600SemiBold'],
        'display-extra': ['Archivo_800ExtraBold'],
        // DS families (Archivo display / Hanken Grotesk UI / JetBrains mono)
        sans: ['HankenGrotesk_400Regular'],
        'sans-medium': ['HankenGrotesk_500Medium'],
        'sans-semibold': ['HankenGrotesk_600SemiBold'],
        'sans-bold': ['HankenGrotesk_700Bold'],
        'sans-extra': ['HankenGrotesk_800ExtraBold'],
        display: ['Archivo_700Bold'],
        'display-bold': ['Archivo_800ExtraBold'],
        'display-black': ['Archivo_900Black'],
        mono: ['JetBrainsMono_400Regular'],
        'mono-medium': ['JetBrainsMono_500Medium'],
        'mono-bold': ['JetBrainsMono_700Bold'],
      },
    },
  },
  plugins: [],
}
