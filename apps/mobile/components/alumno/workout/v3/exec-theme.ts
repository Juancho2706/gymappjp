/**
 * Tema del Ejecutor V3 (E2.1) — resuelve el acento y la paleta segun `branding.executorTheme`
 * (`coaches.executor_theme`, cableado en Ola 0). El ejecutor es DARK-ONLY por diseno: sus superficies
 * (fondos/inks) son tokens locales oscuros fijos, INDEPENDIENTES del tema claro/oscuro del sistema —
 * no leen NativeWind (que flipea con el scheme). Solo el ACENTO es dinamico.
 *
 * Resolucion del acento (contrato de PLAN.md · Theming):
 *   · executor_theme = 'coach' → acento = primario white-label ACTUAL del coach (`theme.primary`,
 *     ya gateado por tier en el shim). Monocromatico, como el mockup concepto-a-v3-core.
 *   · executor_theme = 'eva'   → paleta multicolor EVA: Sport (acciones/CTA), Aqua (recovery:
 *     movilidad/roller, se consume en Ola 3), Ember (celebracion, Ola 4).
 *
 * Zonas FC (Z1..Z5): SIEMPRE `ZONE_COLORS` (theme.ts), fijas — jamas re-tenidas por marca ni scheme,
 * mismo contrato que `--zone-z1..z5` de web.
 *
 * Los literales de superficie estan inspirados en el mockup (dark calido ~#16161d): un fondo base
 * calido, cards elevadas, panel hundido, bordes y neutros de texto on-dark.
 */
import { ZONE_COLORS } from '../../../../lib/theme'

/** Paleta multicolor EVA del ejecutor (modo `eva`). */
export const EVA_EXEC_ACCENT = '#2680FF' // Sport — acciones / CTA
export const EVA_EXEC_RECOVERY = '#18ABD4' // Aqua — recovery (movilidad/roller), llega en Ola 3
export const EVA_EXEC_CELEBRATION = '#FF6A3D' // Ember — celebracion, Ola 4

/**
 * Dorado de RÉCORD PERSONAL (E4.2) — token PROPIO del PR, INDEPENDIENTE de la marca del coach, del
 * acento del ejecutor y de las zonas FC. Es siempre este oro (`#f5c451` del mockup concepto-a-v3-momentos,
 * pantalla "PR en vivo"): un PR se ve igual para todos los alumnos, no se re-tiñe por white-label. Se usa
 * en el borde pulsante de la serie, el toast "¡PR!" y el micro-confeti dorado.
 */
export const EXEC_PR_GOLD = '#f5c451'

/**
 * Superficies dark-only del ejecutor. Literales fijos (no tokens NativeWind) para que la piel no
 * flipee con el tema del sistema. Valores calibrados al mockup concepto-a-v3-core.html.
 */
export interface ExecSurface {
  /** Fondo base del ejecutor (mockup screen mid-stop ~#16161d). */
  appBg: string
  /** Fondo mas profundo (gradiente inferior del mockup). */
  appBgDeep: string
  /** Card / fila de plan elevada. */
  surface: string
  /** Tile de valor / control (algo mas claro que `surface`). */
  surfaceRaised: string
  /** Panel hundido (effort / source). */
  surfaceSunken: string
  /** Borde estandar de card. */
  border: string
  /** Borde marcado (controles). */
  borderStrong: string
  /** Divisor sutil. */
  borderSubtle: string
  /** Track de los dots de progreso apagados. */
  dotTrack: string
  /** Texto principal on-dark. */
  text: string
  /** Texto atenuado on-dark. */
  textMuted: string
  /** Texto muy tenue (mas-de / counts secundarios). */
  textDim: string
}

export const EXEC_SURFACE: ExecSurface = Object.freeze({
  appBg: '#16161d',
  appBgDeep: '#121218',
  surface: '#1a1a22',
  surfaceRaised: '#1c1c24',
  surfaceSunken: '#15151c',
  border: '#2a2a34',
  borderStrong: '#2f2f3a',
  borderSubtle: '#24242e',
  dotTrack: '#2a2a34',
  text: '#f4f4f6',
  textMuted: '#8f8f9c',
  textDim: '#6f6f7c',
})

export type ExecThemeMode = 'coach' | 'eva'

export interface ExecTheme {
  mode: ExecThemeMode
  /** Acento principal — dots activos / CTA / foco. */
  accent: string
  /** Texto/icono legible SOBRE el acento (CTA). */
  accentText: string
  /** Recovery (aqua) — movilidad/roller. En modo coach cae al acento (monocromatico). */
  recovery: string
  /** Celebracion (ember). En modo coach cae al acento (monocromatico). */
  celebration: string
  /** Dorado de récord personal (E4.2) — FIJO `#f5c451` en ambos modos: el PR no se re-tiñe por marca. */
  pr: string
  /** Zonas FC fijas Z1..Z5. */
  zones: typeof ZONE_COLORS
  /** Superficies dark-only. */
  surface: ExecSurface
}

/**
 * Resuelve el tema del ejecutor.
 * @param executorTheme  `branding.executorTheme` ('coach' | 'eva' | otro → 'coach').
 * @param coachAccent    Primario white-label actual (`theme.primary`) — usado en modo coach.
 * @param coachAccentText Foreground legible sobre el primario (`theme.primaryForeground`).
 */
export function resolveExecTheme(
  executorTheme: string | null | undefined,
  coachAccent: string | null | undefined,
  coachAccentText: string | null | undefined,
): ExecTheme {
  const mode: ExecThemeMode = executorTheme === 'eva' ? 'eva' : 'coach'
  if (mode === 'eva') {
    return {
      mode,
      accent: EVA_EXEC_ACCENT,
      accentText: '#FFFFFF',
      recovery: EVA_EXEC_RECOVERY,
      celebration: EVA_EXEC_CELEBRATION,
      pr: EXEC_PR_GOLD,
      zones: ZONE_COLORS,
      surface: EXEC_SURFACE,
    }
  }
  // Modo coach: monocromatico sobre el primario white-label. Recovery/celebration caen al acento
  // (Ola 3/4 definiran su matiz definitivo; hoy no se renderizan). Fallback al Sport EVA si no hay
  // primario resuelto todavia (fail-safe identico al DEFAULT_BRAND del shim).
  const accent = coachAccent || EVA_EXEC_ACCENT
  return {
    mode,
    accent,
    accentText: coachAccentText || '#FFFFFF',
    recovery: accent,
    celebration: accent,
    // El PR es SIEMPRE oro, aun en modo coach monocromatico: es un premio universal, no un acento de marca.
    pr: EXEC_PR_GOLD,
    zones: ZONE_COLORS,
    surface: EXEC_SURFACE,
  }
}
