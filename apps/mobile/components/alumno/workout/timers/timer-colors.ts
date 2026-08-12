/**
 * DS ramp literals para los timers del ejecutor (E2-09).
 *
 * Los timers son "chrome" oscuro FIJO (espejo de la web `bg-[var(--ink-900)]/95`):
 * NO flipean con el tema de la app — el ring/anillo y los iconos lucide van sobre
 * una superficie navy constante. RN exige colores concretos para `stroke` de SVG
 * y para el prop `color` de lucide (no hay clase NativeWind ahí), así que estos
 * literales viven acá con su token DS de origen citado — es la "frontera de
 * theming" documentada en `lib/theme.ts` y usada tal cual por `Button.tsx`.
 *
 * Valores verbatim de `apps/mobile/global.css`. `ink-900/950`, `on-dark`,
 * `on-dark-muted`, y las rampas `ember/aqua/success/warning` son
 * CONSTANTES entre light y dark (no se redefinen en `.dark`), así que el chrome
 * oscuro se ve igual en ambos temas — paridad exacta con la web.
 *
 * EXCEPCIÓN white-label: la rampa `sport` NO es un literal fijo — se recolorea con la
 * MARCA del coach (`--color-sport-*` sale de `deriveSportTokens(primaryColor)`). Por eso
 * `sport300()` es una FUNCIÓN que recibe el color de marca: este módulo no es un
 * componente y no puede usar hooks, así que el color lo resuelve el consumidor con
 * acceso al tema (`IntervalTimer.tsx` vía `useTheme().branding`).
 */
import { resolveSportRamp } from '../../../../lib/theme'

export const INK_900 = '#12161D' // --color-ink-900 (superficie del timer, /95)
export const ON_DARK = '#F4F6F8' // --color-text-on-dark (ink-50) — iconos activos
export const ON_DARK_MUTED = '#939DAB' // --color-text-on-dark-muted — iconos secundarios
export const EMBER_500 = '#FF6A3D' // --color-ember-500 — descanso / hold (anillo)
export const EMBER_300 = '#FFB199' // --color-ember-300 — eyebrow "Descanso"
export const EMBER_200 = '#FFD6C7' // --color-ember-200 — icono mute activo (Volume2)
export const AQUA_500 = '#18ABD4' // --color-aqua-500 — fase recovery del intervalo
export const SUCCESS_500 = '#1FB877' // --color-success-500 — "¡A entrenar!" / completado
export const WARNING_500 = '#F5A524' // --color-warning-500

/**
 * --color-sport-300 del coach — fases warmup/cooldown del intervalo. Deriva del MISMO
 * `deriveSportTokens(primaryColor).ramp['300']` que alimenta las vars `--color-sport-*` de
 * NativeWind, así que el anillo sigue la marca en lockstep con las clases `text-sport-300`.
 * Sin marca (o tier sin white-label) cae al azul EVA por defecto, igual que antes.
 */
export function sport300(brandColor?: string | null): string {
  return resolveSportRamp(brandColor).sport300
}

/** Track del anillo/barra sobre chrome oscuro (equivalente RN de `bg-white/10`). */
export const TRACK_ON_DARK = 'rgba(255,255,255,0.10)'

/**
 * Paleta de confetti (celebración fin de descanso) — tokens DS, no hex mágicos. Recibe el color
 * de marca porque su cuarto tono es el `sport-300` white-label (ver `sport300`); los otros tres
 * son semánticos y no se recolorean.
 */
export function confettiColors(brandColor?: string | null): readonly string[] {
  return [EMBER_500, SUCCESS_500, AQUA_500, sport300(brandColor)] as const
}
