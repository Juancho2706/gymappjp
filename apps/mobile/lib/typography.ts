import type { TextStyle } from 'react-native'

/**
 * EVA DS typography — RN helper (mirror of the web type scale + roles).
 *
 * Single source of truth for text primitives so screens/components stop
 * re-inventing magic `fontSize`/`fontFamily`/`lineHeight` numbers. Mirrors
 * `apps/web/src/app/globals.css` (--text-*, --lh-*, --ls-*, --role-*) and the
 * loaded RN faces in `apps/mobile/app/_layout.tsx`.
 *
 * NativeWind classes cover color; this module covers the *shape* of text
 * (size/leading/tracking/family). Consume via `TYPE[role]` (a ready TextStyle)
 * or the scalar maps (TYPE_SCALE / LINE_HEIGHT / LETTER_SPACING) when a role
 * does not fit.
 *
 * Web parity notes:
 *  - Web declares letter-spacing in `em` (relative to font size). RN needs an
 *    absolute point value, so LETTER_SPACING holds the `em` factor and the role
 *    styles pre-multiply it by the role size.
 *  - Web line-heights are unitless multipliers; RN needs points, so role styles
 *    pre-multiply by the size (rounded).
 *  - UI/body = Hanken Grotesk, display/headings = Archivo, metrics = JetBrains
 *    Mono (mirrors --font-ui / --font-display / --font-mono).
 */

/** Exact PostScript names of the faces loaded in `app/_layout.tsx`. */
export const FONT = {
  // UI / body — Hanken Grotesk
  ui: 'HankenGrotesk_400Regular',
  uiMedium: 'HankenGrotesk_500Medium',
  uiSemibold: 'HankenGrotesk_600SemiBold',
  uiBold: 'HankenGrotesk_700Bold',
  uiExtra: 'HankenGrotesk_800ExtraBold',
  // Display / headings — Archivo
  display: 'Archivo_700Bold',
  displayBold: 'Archivo_800ExtraBold',
  displayBlack: 'Archivo_900Black',
  // Mono / metrics / timers — JetBrains Mono
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const

/** Type scale in px — mirrors web `--text-3xs..6xl`. */
export const TYPE_SCALE = {
  '3xs': 11,
  '2xs': 12,
  xs: 13,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 21,
  '2xl': 25,
  '3xl': 31,
  '4xl': 39,
  '5xl': 49,
  '6xl': 62,
} as const

/** Line-height multipliers — mirrors web `--lh-*`. */
export const LINE_HEIGHT = {
  tight: 1.05,
  snug: 1.18,
  normal: 1.4,
  relaxed: 1.6,
} as const

/** Letter-spacing as `em` factors — mirrors web `--ls-*`. Multiply by size for RN points. */
export const LETTER_SPACING = {
  tighter: -0.03,
  tight: -0.015,
  normal: 0,
  wide: 0.04,
  eyebrow: 0.12,
} as const

export type TypeSize = keyof typeof TYPE_SCALE
export type TypeRole =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'title'
  | 'body'
  | 'label'
  | 'caption'
  | 'eyebrow'
  | 'mono'

interface RoleSpec {
  size: TypeSize
  family: string
  lh: keyof typeof LINE_HEIGHT
  ls: keyof typeof LETTER_SPACING
  uppercase?: boolean
}

// Role specs mirror web `--role-*-size/-weight`; family/weight follow the DS
// convention (display headings = Archivo, UI text = Hanken, metrics = mono).
const ROLE_SPEC: Record<TypeRole, RoleSpec> = {
  display: { size: '5xl', family: FONT.displayBlack, lh: 'tight', ls: 'tighter' },
  h1: { size: '4xl', family: FONT.displayBold, lh: 'tight', ls: 'tighter' },
  h2: { size: '3xl', family: FONT.displayBold, lh: 'snug', ls: 'tight' },
  h3: { size: '2xl', family: FONT.display, lh: 'snug', ls: 'tight' },
  title: { size: 'xl', family: FONT.uiBold, lh: 'snug', ls: 'tight' },
  body: { size: 'md', family: FONT.ui, lh: 'normal', ls: 'normal' },
  label: { size: 'sm', family: FONT.uiSemibold, lh: 'normal', ls: 'normal' },
  caption: { size: 'xs', family: FONT.uiMedium, lh: 'normal', ls: 'normal' },
  eyebrow: { size: '2xs', family: FONT.uiBold, lh: 'normal', ls: 'eyebrow', uppercase: true },
  mono: { size: 'md', family: FONT.mono, lh: 'normal', ls: 'normal' },
}

function buildRole(spec: RoleSpec): TextStyle {
  const size = TYPE_SCALE[spec.size]
  const style: TextStyle = {
    fontFamily: spec.family,
    fontSize: size,
    lineHeight: Math.round(size * LINE_HEIGHT[spec.lh]),
    letterSpacing: Math.round(size * LETTER_SPACING[spec.ls] * 100) / 100,
  }
  if (spec.uppercase) style.textTransform = 'uppercase'
  return style
}

/** Ready-to-spread `TextStyle` per semantic role. `style={TYPE.title}`. */
const TYPE_BUILT = {} as Record<TypeRole, TextStyle>
for (const role of Object.keys(ROLE_SPEC) as TypeRole[]) {
  TYPE_BUILT[role] = buildRole(ROLE_SPEC[role])
}
export const TYPE: Record<TypeRole, TextStyle> = Object.freeze(TYPE_BUILT)

/**
 * Build an ad-hoc text style from the scale when no role fits (e.g. a control
 * whose size is component-specific). Keeps sizes/tracking on the DS grid.
 */
export function textStyle(size: TypeSize, family: string, opts?: { lh?: keyof typeof LINE_HEIGHT; ls?: keyof typeof LETTER_SPACING }): TextStyle {
  const px = TYPE_SCALE[size]
  return {
    fontFamily: family,
    fontSize: px,
    lineHeight: Math.round(px * LINE_HEIGHT[opts?.lh ?? 'normal']),
    letterSpacing: Math.round(px * LETTER_SPACING[opts?.ls ?? 'normal'] * 100) / 100,
  }
}
