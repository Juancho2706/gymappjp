import { useId } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg'
import { ENTRY_TOKENS } from '../../lib/theme'

/**
 * EntryBackground — la TEXTURA SELLO de la familia de entrada dark v1.
 * Normativa: `docs/specs/entrada-dark-v1/DESIGN-SPEC.md` §1 (capas 0-4).
 *
 * Orden de capas (§1.1), de atras hacia adelante:
 *   0 canvas   `#07080C` solido, full-bleed (prop `canvas`)
 *   1 lavado superior (acento)      RadialGradient §1.2
 *   2 horizonte inferior (acento suave) RadialGradient §1.2
 *   3 fuente puntual                `<EntrySource>` — nodo aparte porque RESPIRA (§4 S3)
 *   4 crosshatch                    Pattern celda 3 §1.3 (prop `grain`)
 *
 * Reglas duras que este archivo materializa:
 *  - Un solo `<Svg>` para las capas 1-2-4 (presupuesto §1.1). La fuente puntual y el
 *    crosshatch compartido salen a sus propios nodos SOLO cuando la composicion lo
 *    exige (halo que respira, crossfade de atmosferas del frame 06).
 *  - `stopOpacity` SIEMPRE explicito, incluido el `0` final: sin el, react-native-svg
 *    pinta rects SOLIDOS full-bleed (auditoria a1 §2.2). El alpha jamas va dentro de
 *    `stopColor`; en `fill`/`stroke` si se respeta (por eso el crosshatch usa los
 *    tokens `rgba(...)` tal cual).
 *  - `patternUnits="userSpaceOnUse"`: con el default la celda escalaria con la
 *    pantalla y la textura dejaria de ser de 3 pt (§1.3 regla 2).
 *  - La textura NUNCA anima, nunca se tiñe de acento, nunca se desmonta (§1.3 regla 3).
 *  - Estatico por contrato: cero animacion dentro de este archivo (§4 fila X1). Quien
 *    necesite cruzar atmosferas lo hace por `opacity` desde afuera (ver `LightLayer`).
 *
 * Los valores de `heatTop`/`heatBottom`/`bottomCy` salen de la rampa §2.2 — no se
 * recalculan aca; llegan resueltos desde `ENTRY_LIGHT` (`LightLayer.tsx`).
 */

/** Acento EVA por defecto — `--lux-rgb` (#1A6BE6). */
export const ENTRY_ACCENT = ENTRY_TOKENS.lux
/** Horizonte EVA por defecto — `--lux-soft-rgb` (#7FB0FF). */
export const ENTRY_ACCENT_SOFT = ENTRY_TOKENS.luxSoft

/** Frame 01 (§2.2): valores por defecto del splash de cold start. */
const DEFAULT_HEAT_TOP = 0.131
const DEFAULT_HEAT_BOTTOM = 0.05
const DEFAULT_BOTTOM_CY = 118
/** Fuente puntual §1.4: circulo de 430 de diametro centrado en la figura. */
export const ENTRY_SOURCE_DIAMETER = 430

/**
 * Normaliza a un hex solido de 6 digitos apto para `stopColor`. El acento del coach
 * llega de DB y puede venir en cualquier forma; un valor invalido cae al acento EVA.
 */
export function entrySolidHex(input: string | null | undefined, fallback: string = ENTRY_ACCENT): string {
  const clean = String(input ?? '').trim().replace('#', '')
  if (/^[0-9a-f]{6}$/i.test(clean)) return `#${clean.toUpperCase()}`
  if (/^[0-9a-f]{3}$/i.test(clean)) {
    return `#${clean.split('').map((c) => c + c).join('').toUpperCase()}`
  }
  return fallback
}

function toChannels(hex: string): [number, number, number] {
  const clean = entrySolidHex(hex).replace('#', '')
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ]
}

function fromChannels(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

/** Mezcla hacia blanco (`amount` 0..1). §3.6 lo usa para el tile de iniciales del coach. */
export function entryLighten(hex: string, amount: number): string {
  const [r, g, b] = toChannels(hex)
  return fromChannels([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount])
}

/** Mezcla hacia negro (`amount` 0..1). */
export function entryDarken(hex: string, amount: number): string {
  const [r, g, b] = toChannels(hex)
  return fromChannels([r * (1 - amount), g * (1 - amount), b * (1 - amount)])
}

/**
 * Version clara del acento para el horizonte (capa 2) cuando el coach trae marca propia.
 * EVA usa el par declarado (#1A6BE6 / #7FB0FF), que es exactamente un `lighten(.42)`.
 */
export function entryAccentSoft(hex: string): string {
  return entryLighten(hex, 0.42)
}

export interface EntryBackgroundProps {
  /** `--lux-rgb`: acento saturado de las capas 1 y 3. Default EVA. */
  accent?: string
  /** `--lux-soft-rgb`: version clara del acento, capa 2. Default EVA. */
  accentSoft?: string
  /** Alpha pico del lavado superior (rampa §2.2). */
  heatTop?: number
  /** Alpha pico del horizonte; constante 0.05 en toda la familia (§2.2). */
  heatBottom?: number
  /** Ancla del horizonte en % del alto (§2.2, derivado de `--lift`). */
  bottomCy?: number
  /** Capa 0. `false` cuando el canvas ya lo pinta el contenedor (composiciones que cruzan). */
  canvas?: boolean
  /** Capa 4. `false` cuando el crosshatch se monta UNA sola vez encima de dos atmosferas (§2.3). */
  grain?: boolean
  style?: StyleProp<ViewStyle>
}

export function EntryBackground({
  accent,
  accentSoft,
  heatTop = DEFAULT_HEAT_TOP,
  heatBottom = DEFAULT_HEAT_BOTTOM,
  bottomCy = DEFAULT_BOTTOM_CY,
  canvas = true,
  grain = true,
  style,
}: EntryBackgroundProps) {
  // ids unicos por instancia — mismo patron que AmbientBrandGlow.tsx: sin esto dos
  // atmosferas apiladas (frame 06) colisionarian sus gradientes svg.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const lux = entrySolidHex(accent, ENTRY_ACCENT)
  const luxSoft = entrySolidHex(accentSoft, accent ? entryAccentSoft(lux) : ENTRY_ACCENT_SOFT)

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        canvas ? { backgroundColor: ENTRY_TOKENS.canvasEntry } : null,
        style,
      ]}
    >
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          {/* CAPA 1 — lavado superior. En CSS `120% 62%` son DIAMETROS; en svg rx/ry
              son RADIOS → la mitad. El stop intermedio conserva la razon .048/.15 = .32. */}
          <RadialGradient id={`lux-top-${uid}`} cx="50%" cy="8%" rx="60%" ry="31%">
            <Stop offset="0" stopColor={lux} stopOpacity={heatTop} />
            <Stop offset="0.42" stopColor={lux} stopOpacity={heatTop * 0.32} />
            <Stop offset="0.72" stopColor={lux} stopOpacity={0} />
          </RadialGradient>
          {/* CAPA 2 — horizonte. `bottomCy` viene de la rampa (§2.2), no se calcula aca. */}
          <RadialGradient id={`lux-bot-${uid}`} cx="50%" cy={`${bottomCy}%`} rx="45%" ry="22.5%">
            <Stop offset="0" stopColor={luxSoft} stopOpacity={heatBottom} />
            <Stop offset="0.7" stopColor={luxSoft} stopOpacity={0} />
          </RadialGradient>
          {grain ? <EntryGrainPattern id={`grain-${uid}`} /> : null}
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#lux-top-${uid})`} />
        <Rect width="100%" height="100%" fill={`url(#lux-bot-${uid})`} />
        {/* CAPA 4 — va ENCIMA de los lavados; si se pintara debajo, el sello desaparece
            bajo el acento (§1.3 regla 4). La opacidad de capa vive en el Rect consumidor. */}
        {grain ? (
          <Rect width="100%" height="100%" fill={`url(#grain-${uid})`} opacity={ENTRY_TOKENS.grainOpacity} />
        ) : null}
      </Svg>
    </View>
  )
}

/**
 * Crosshatch §1.3 — dos rejillas perpendiculares de linea 1 sobre celda 3, con alphas
 * distintos (0.012 horizontal / 0.010 vertical) y la capa completa al 0.5. Misma tecnica
 * que la grilla `appgrid` de 40 pt de `AppBackground.tsx`, con celda de 3.
 */
function EntryGrainPattern({ id }: { id: string }) {
  const cell = ENTRY_TOKENS.grainCell
  return (
    <Pattern id={id} width={cell} height={cell} patternUnits="userSpaceOnUse">
      {/* banda del gradiente 0deg → linea HORIZONTAL */}
      <Rect x={0} y={0} width={cell} height={1} fill={ENTRY_TOKENS.grainLineH} />
      {/* banda del gradiente 90deg → linea VERTICAL */}
      <Rect x={0} y={0} width={1} height={cell} fill={ENTRY_TOKENS.grainLineV} />
    </Pattern>
  )
}

/**
 * Crosshatch como nodo INDEPENDIENTE. Lo consumen las composiciones que cruzan dos
 * atmosferas (frame 06, §2.3): la textura es UNA sola, compartida, encima de ambas —
 * nunca se duplica ni se cruza, porque es lo que hace que el white-label se lea como
 * un cambio de luz y no de app.
 */
export function EntryGrain({ style }: { style?: StyleProp<ViewStyle> }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, style]}
    >
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <EntryGrainPattern id={`grain-solo-${uid}`} />
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#grain-solo-${uid})`} opacity={ENTRY_TOKENS.grainOpacity} />
      </Svg>
    </View>
  )
}

export interface EntrySourceProps {
  /** Acento saturado; el mismo canal que las capas 1-2 de su atmosfera. */
  accent?: string
  /** `sHeat` §1.4: 0.20 (EVA) / 0.24 (coach). */
  heat?: number
  /** Centro OPTICO de la figura, en pt (§1.4: el halo se centra en la figura, no en el body). */
  cx: number
  cy: number
  diameter?: number
  style?: StyleProp<ViewStyle>
}

/**
 * Capa 3 — fuente puntual §1.4. Es el UNICO nodo del fondo que anima (solo `opacity`,
 * respiracion §4 S3), por eso vive fuera del `<Svg>` de los lavados: el que respira es
 * este nodo, no la atmosfera. La razon 0.068/0.20 = 0.34 fija el segundo stop.
 */
export function EntrySource({
  accent,
  heat = 0.2,
  cx,
  cy,
  diameter = ENTRY_SOURCE_DIAMETER,
  style,
}: EntrySourceProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const lux = entrySolidHex(accent, ENTRY_ACCENT)
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, style]}
    >
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`lux-src-${uid}`} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={lux} stopOpacity={heat} />
            <Stop offset="0.38" stopColor={lux} stopOpacity={heat * 0.34} />
            <Stop offset="0.68" stopColor={lux} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={cx} cy={cy} r={diameter / 2} fill={`url(#lux-src-${uid})`} />
      </Svg>
    </View>
  )
}
