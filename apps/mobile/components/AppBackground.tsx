import { useEffect, useMemo, useState } from 'react'
import { AccessibilityInfo, StyleSheet, View, useWindowDimensions } from 'react-native'
import Svg, { Defs, Pattern, Rect } from 'react-native-svg'
import { Canvas, Circle, Group, Paint, Blur } from '@shopify/react-native-skia'
import type { Transforms3d } from '@shopify/react-native-skia'
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { sealPair } from '@eva/brand-kit'
import { useTheme } from '../context/ThemeContext'
import { SEAL_TOKENS, resolveEffectiveCoachBrandTheme } from '../lib/theme'

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(0,122,255,${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ————— Valores normativos del artifact «Variaciones del Sello» (remix B) —————
// La capa web es `inset:-25%` ⇒ mide 150% del viewport. Los `translate3d(%)` de
// los keyframes CSS refieren al TAMAÑO DE ESA CAPA, y los centros de los
// radial-gradients a sus coordenadas: el mapeo a pantalla es
// `viewport = -0.25 + capa × 1.5`, y cada % de deriva se multiplica por
// 1.5 × la dimensión de pantalla.
const LAYER_SCALE = 1.5
/** Blob 1 — `circle at 32% 22%` de la capa ⇒ (0.23, 0.08) del viewport. */
const BLOB1_CX = 0.23
const BLOB1_CY = 0.08
/** Blob 2 — `circle at 76% 82%` de la capa ⇒ (0.89, 0.98) del viewport. */
const BLOB2_CX = 0.89
const BLOB2_CY = 0.98

/** Deriva 1 (primario): `drift1 46s ease-in-out infinite alternate`. */
const DRIFT1_MS = 46000
/** Deriva 2 (secundario): `drift2 58s ease-in-out infinite alternate`. */
const DRIFT2_MS = 58000
/** Keyframes de deriva (0% · 50% · 100%), en % de la capa. */
const DRIFT1_X = [-2.5, 0.5, 2.5] as const
const DRIFT1_Y = [-1.5, 1.8, -0.6] as const
const DRIFT2_X = [2, -1.2, -2.5] as const
const DRIFT2_Y = [2.5, 0.4, -2] as const

/** `ease-in-out` CSS exacto (cubic-bezier(.42,0,.58,1)), invocable en worklet. */
const EASE_IN_OUT = Easing.bezierFn(0.42, 0, 0.58, 1)

/**
 * Posición de la trayectoria de 3 puntos al progreso `t` ∈ [0,1] (hilo UI).
 * Interpola el tramo 0%→50% o 50%→100% aplicando ease-in-out POR TRAMO — igual
 * que el motor CSS aplica `animation-timing-function` entre keyframes. El driver
 * (`withTiming`) es LINEAL y alternado (`withRepeat reverse`), como
 * `infinite alternate`.
 */
function driftPoint(t: number, keys: readonly number[], size: number): number {
  'worklet'
  const seg = t < 0.5 ? 0 : 1
  const local = EASE_IN_OUT(seg === 0 ? t * 2 : (t - 0.5) * 2)
  const from = keys[seg]
  const to = keys[seg + 1]
  return ((from + (to - from) * local) / 100) * size
}

/**
 * Fondo global — Sello EVA v2 «Horizonte B» (SPEC `docs/specs/eva-seal-background/`,
 * decisión del dueño 2026-08-17 sobre el artifact «Variaciones del Sello», remix B):
 * dos blobs con blur Gaussian real (Skia) del PAR de marca — primario (arr-izq) +
 * secundario del tema resuelto (abj-der, `sealPair` D3: par curado del preset o
 * derivado del primario; muere el celeste `#38BDF8` fijo) — a la DERIVA, + grano
 * crosshatch. SIN grilla (remix B la retira; el `appgrid` 40×40 murió acá).
 *
 * Contrato de animación (SPEC D4 — supera el «estático por contrato» viejo por
 * decisión del dueño 2026-08-17): SOLO la luz se mueve; el grano JAMÁS anima.
 * La deriva corre 100% en el hilo UI (Reanimated shared values + `withRepeat`/
 * `withTiming` → transform de los círculos Skia): cero trabajo en el hilo JS por
 * frame, cero setState en loops. `AccessibilityInfo.isReduceMotionEnabled` ⇒
 * blobs ESTÁTICOS (no desaparecen); prop `animated={false}` = kill-switch (QA
 * de batería del dueño).
 *
 * Alphas por tema (SPEC D5, tokens `SEAL_TOKENS` de `lib/theme.ts`, espejo del
 * juego web `--seal-*`): blobs dark .16/.14 · light .15/.13; grano dark blanco
 * .012/.010 capa .5 · light tinta .016/.013 capa .55.
 * Montado app-wide (todos los menús) → un solo cambio acá re-sella la app entera.
 * La familia de entrada NO lo monta (D2): conserva `EntryBackground`.
 */
export function AppBackground({
  accent,
  animated = true,
}: {
  /**
   * Override del primario (previews de Mi Marca con color editado sin guardar).
   * Es un hex suelto sin preset ⇒ el secundario del par se DERIVA (D3.2).
   */
  accent?: string
  /** Kill-switch de la deriva (SPEC D4). `false` ⇒ blobs estáticos. */
  animated?: boolean
}) {
  // `resolvedScheme` (no `mode`): con la preferencia por defecto 'system', `mode`
  // vale 'system' y el fondo caía siempre en los alphas de dark (auditoría a1 §2.3.2).
  const { branding, resolvedScheme } = useTheme()
  const { width, height } = useWindowDimensions()
  const isDark = resolvedScheme === 'dark'
  const seal = isDark ? SEAL_TOKENS.dark : SEAL_TOKENS.light

  // Par del sello (D3) desde el tema RESUELTO: con preset ⇒ par curado del
  // catálogo (modo estricto: se pasa SIEMPRE la key; una key nula/desconocida
  // ignora el secundario suelto legacy — regla B2); sin preset ⇒ deriva.
  const effectiveBrand = useMemo(() => resolveEffectiveCoachBrandTheme(branding), [branding])
  const pair = useMemo(
    () =>
      accent
        ? sealPair({ brandColor: accent, themePresetKey: null })
        : sealPair({
            brandColor: effectiveBrand.brandColor,
            secondaryColor: effectiveBrand.secondaryColor,
            themePresetKey: branding?.themePresetKey ?? null,
          }),
    [accent, effectiveBrand, branding?.themePresetKey],
  )
  const blob1Color = hexToRgba(pair.primary, seal.blobPrimaryAlpha)
  const blob2Color = hexToRgba(pair.secondary, seal.blobSecondaryAlpha)

  // Gate de reduce-motion del SO (SPEC D4), reactivo al cambio en vivo del ajuste.
  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (alive) setReduceMotion(enabled)
    })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => {
      alive = false
      sub.remove()
    }
  }, [])
  const driftActive = animated && !reduceMotion

  // Progreso 0→1 de cada deriva (hilo UI). Driver lineal alternado; el easing
  // por tramo vive en `driftPoint`. Duraciones distintas ⇒ desfase creciente.
  const drift1 = useSharedValue(0)
  const drift2 = useSharedValue(0)
  useEffect(() => {
    if (driftActive) {
      drift1.value = withRepeat(withTiming(1, { duration: DRIFT1_MS, easing: Easing.linear }), -1, true)
      drift2.value = withRepeat(withTiming(1, { duration: DRIFT2_MS, easing: Easing.linear }), -1, true)
    } else {
      // Estático = transform identidad (como `animation: none` bajo
      // prefers-reduced-motion en la web): el blob queda en su posición base.
      cancelAnimation(drift1)
      cancelAnimation(drift2)
      drift1.value = 0
      drift2.value = 0
    }
    return () => {
      cancelAnimation(drift1)
      cancelAnimation(drift2)
    }
  }, [driftActive, drift1, drift2])

  const blob1Transform = useDerivedValue<Transforms3d>(() => {
    if (!driftActive) return [{ translateX: 0 }, { translateY: 0 }]
    const t = drift1.value
    return [
      { translateX: driftPoint(t, DRIFT1_X, width * LAYER_SCALE) },
      { translateY: driftPoint(t, DRIFT1_Y, height * LAYER_SCALE) },
    ]
  }, [driftActive, width, height])
  const blob2Transform = useDerivedValue<Transforms3d>(() => {
    if (!driftActive) return [{ translateX: 0 }, { translateY: 0 }]
    const t = drift2.value
    return [
      { translateX: driftPoint(t, DRIFT2_X, width * LAYER_SCALE) },
      { translateY: driftPoint(t, DRIFT2_Y, height * LAYER_SCALE) },
    ]
  }, [driftActive, width, height])

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Blobs con blur Gaussian (= radial-gradient difuso del artifact). Un layer
          con Blur difumina el grupo; cada círculo deriva en su propio Group. */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Group layer={<Paint><Blur blur={80} /></Paint>}>
          <Group transform={blob1Transform}>
            <Circle cx={width * BLOB1_CX} cy={height * BLOB1_CY} r={width * 0.72} color={blob1Color} />
          </Group>
          <Group transform={blob2Transform}>
            <Circle cx={width * BLOB2_CX} cy={height * BLOB2_CY} r={width * 0.62} color={blob2Color} />
          </Group>
        </Group>
      </Canvas>
      {/* Grano crosshatch (celda 3, líneas 1px con alphas asimétricos — §1.3 de la
          entrada), ENCIMA de los lavados: debajo de ellos el sello desaparece.
          JAMÁS anima (SPEC D4). */}
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern
            id="appgrain"
            width={SEAL_TOKENS.grainCell}
            height={SEAL_TOKENS.grainCell}
            patternUnits="userSpaceOnUse"
          >
            <Rect x={0} y={0} width={SEAL_TOKENS.grainCell} height={1} fill={seal.grainLineH} />
            <Rect x={0} y={0} width={1} height={SEAL_TOKENS.grainCell} fill={seal.grainLineV} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#appgrain)" opacity={seal.grainOpacity} />
      </Svg>
    </View>
  )
}
