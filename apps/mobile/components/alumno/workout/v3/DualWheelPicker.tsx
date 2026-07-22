import { type ReactNode, useEffect, useMemo, useRef } from 'react'
import { Text, View } from 'react-native'
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import { Check } from 'lucide-react-native'
import { formatWeightEsCl } from '@eva/workout-engine'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { haptics } from '../../../../lib/haptics'
import { Sheet } from '../../../Sheet'
import { JuicyButton } from './JuicyButton'
import type { ExecTheme } from './exec-theme'

/**
 * Rueda dual kg | reps del ejecutor V3 (E2.5, decision CEO 8) — captura por gesto de MANTENER
 * PRESIONADO sobre el valor de una serie de fuerza (el TAP corto sigue abriendo el teclado custom).
 * Dos columnas verticales estilo selector iOS: 5 items visibles, item central resaltado en una
 * capsula con borde del acento + hairlines arriba/abajo, fisica de scroll con snap por item, tick
 * haptico por paso (throttle) y respeto de reduce-motion (sin escalado/opacidad decorativa; el snap
 * se conserva porque es funcional, no adorno).
 *
 * NO toca la logica de guardado/draft/cola: la rueda solo PRODUCE (peso, reps) y los entrega por el
 * MISMO mecanismo de prefill/autofill (nonce) que ya usa la fila "Anterior" — el guardado sigue siendo
 * el CTA normal de la serie.
 *
 * Rango corto centrado en el valor anterior de la serie (o el objetivo si no hay anterior):
 *   · kg   = ancla ± 20 en pasos de 2,5 (clamp ≥ 0).
 *   · reps = ancla ± 10 en pasos de 1  (clamp ≥ 0).
 * El ancla se redondea al grid del paso para que la rueda muestre multiplos limpios.
 */

// Alto de cada item (≥44px, target minimo) y cuantos se ven (impar → hay un centro real).
const ITEM_HEIGHT = 44
const VISIBLE = 5
const PAD_V = ITEM_HEIGHT * Math.floor(VISIBLE / 2)

// Rango/paso por eje (decision CEO 8).
const KG_STEP = 2.5
const KG_SPREAD = 8 // 8 × 2,5 = ±20
const REPS_STEP = 1
const REPS_SPREAD = 10 // ±10

// Tick haptico: throttle en ms para no saturar en scroll rapido (el tick por-item ya lo acota).
const HAPTIC_THROTTLE_MS = 35

interface WheelValues {
  values: number[]
  initialIndex: number
}

/** Construye el arreglo de valores centrado en `anchor`, redondeado al grid del paso, clamp ≥ 0. */
function buildWheelValues(anchor: number, step: number, spread: number): WheelValues {
  const base = Math.max(0, Math.round(anchor / step) * step)
  const values: number[] = []
  for (let i = -spread; i <= spread; i += 1) {
    const v = Math.round((base + i * step) * 100) / 100
    if (v >= 0) values.push(v)
  }
  const initialIndex = Math.max(0, values.indexOf(base))
  return { values, initialIndex }
}

/**
 * Un item de la columna. Con motion: escala/opacidad interpoladas por distancia al centro (efecto
 * rueda). Con reduce-motion: fijo (opacidad plena, sin escala) — el snap sigue funcionando.
 */
function WheelItem({
  index,
  scrollY,
  reducedMotion,
  color,
  children,
}: {
  index: number
  scrollY: SharedValue<number>
  reducedMotion: boolean
  color: string
  children: ReactNode
}) {
  const style = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 1, transform: [{ scale: 1 }] }
    const pos = index * ITEM_HEIGHT
    const dist = Math.abs(pos - scrollY.value)
    const opacity = interpolate(dist, [0, ITEM_HEIGHT, ITEM_HEIGHT * 2], [1, 0.45, 0.18], Extrapolation.CLAMP)
    const scale = interpolate(dist, [0, ITEM_HEIGHT, ITEM_HEIGHT * 2], [1, 0.84, 0.7], Extrapolation.CLAMP)
    return { opacity, transform: [{ scale }] }
  })
  return (
    <Animated.View style={[{ height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ fontFamily: FONT.monoBold, fontSize: 22, color, fontVariant: ['tabular-nums', 'lining-nums'] }}>
        {children}
      </Text>
    </Animated.View>
  )
}

/** Una columna de la rueda (kg o reps). */
function WheelColumn({
  testID,
  caption,
  values,
  initialIndex,
  onIndexChange,
  reducedMotion,
  exec,
  format,
  accessibilityLabel,
}: {
  testID: string
  caption: string
  values: number[]
  initialIndex: number
  onIndexChange: (index: number) => void
  reducedMotion: boolean
  exec: ExecTheme
  format: (v: number) => string
  accessibilityLabel: string
}) {
  const s = exec.surface
  const scrollY = useSharedValue(initialIndex * ITEM_HEIGHT)
  const lastIdx = useSharedValue(initialIndex)
  const lastHaptic = useRef(0)

  const tick = (idx: number) => {
    const now = Date.now()
    if (now - lastHaptic.current > HAPTIC_THROTTLE_MS) {
      lastHaptic.current = now
      haptics.select()
    }
    onIndexChange(idx)
  }

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y
      const raw = Math.round(e.contentOffset.y / ITEM_HEIGHT)
      const idx = raw < 0 ? 0 : raw > values.length - 1 ? values.length - 1 : raw
      if (idx !== lastIdx.value) {
        lastIdx.value = idx
        runOnJS(tick)(idx)
      }
    },
  })

  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{ fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: s.textMuted, textAlign: 'center', marginBottom: 8 }}
      >
        {caption}
      </Text>
      <View style={{ height: ITEM_HEIGHT * VISIBLE, position: 'relative', overflow: 'hidden', borderRadius: 16, backgroundColor: s.surfaceSunken }}>
        {/* Capsula del centro + hairlines arriba/abajo (borde del acento). */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: PAD_V, left: 6, right: 6, height: ITEM_HEIGHT, borderRadius: 12, borderWidth: 2, borderColor: hexToRgba(exec.accent, 0.9), backgroundColor: hexToRgba(exec.accent, 0.08) }}
        />
        <View pointerEvents="none" style={{ position: 'absolute', top: PAD_V, left: 0, right: 0, height: 1, backgroundColor: hexToRgba(exec.accent, 0.28) }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: PAD_V + ITEM_HEIGHT, left: 0, right: 0, height: 1, backgroundColor: hexToRgba(exec.accent, 0.28) }} />
        <Animated.ScrollView
          testID={testID}
          accessibilityLabel={accessibilityLabel}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentOffset={{ x: 0, y: initialIndex * ITEM_HEIGHT }}
          contentContainerStyle={{ paddingVertical: PAD_V }}
        >
          {values.map((v, i) => (
            <WheelItem key={`${v}-${i}`} index={i} scrollY={scrollY} reducedMotion={reducedMotion} color={s.text}>
              {format(v)}
            </WheelItem>
          ))}
        </Animated.ScrollView>
      </View>
    </View>
  )
}

/**
 * Sheet con la rueda dual. Se monta con el patron nativo probado del ejecutor (`Sheet nativeModal
 * forceDark`, sin scroll interno para no chocar con el gesto de la rueda). "Listo" entrega ambos valores
 * al padre por `onDone`, que los inyecta en el autofill de la serie activa (mecanismo existente).
 */
export function DualWheelPicker({
  open,
  onClose,
  setNumber,
  kgAnchor,
  repsAnchor,
  exec,
  reducedMotion = false,
  onDone,
}: {
  open: boolean
  onClose: () => void
  setNumber: number
  kgAnchor: number
  repsAnchor: number
  exec: ExecTheme
  reducedMotion?: boolean
  onDone: (weightKg: number, reps: number) => void
}) {
  const kg = useMemo(() => buildWheelValues(kgAnchor, KG_STEP, KG_SPREAD), [kgAnchor])
  const reps = useMemo(() => buildWheelValues(repsAnchor, REPS_STEP, REPS_SPREAD), [repsAnchor])

  // Indice seleccionado por columna (ref: vive fuera del ciclo de render — el scroll lo actualiza en vivo).
  const kgIdx = useRef(kg.initialIndex)
  const repsIdx = useRef(reps.initialIndex)
  useEffect(() => { kgIdx.current = kg.initialIndex }, [kg])
  useEffect(() => { repsIdx.current = reps.initialIndex }, [reps])

  const s = exec.surface

  const handleDone = () => {
    const w = kg.values[kgIdx.current] ?? kgAnchor
    const r = reps.values[repsIdx.current] ?? repsAnchor
    onDone(w, r)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      forceDark
      scrollable={false}
      snapPoints={['54%']}
      title={`Serie ${setNumber}`}
      accessibilityLabel={`Rueda de valores para la serie ${setNumber}`}
      footer={
        <JuicyButton
          testID="wheel-done"
          label="Listo"
          onPress={handleDone}
          exec={exec}
          reducedMotion={reducedMotion}
          icon={<Check size={18} color={exec.accentText} strokeWidth={2.6} />}
          accessibilityLabel="Listo, usar estos valores en la serie"
        />
      }
    >
      <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: s.textMuted, textAlign: 'center', marginBottom: 4 }}>
        Desliza para ajustar el peso y las repeticiones
      </Text>
      {/* Columnas re-montadas por ancla (key) para que al reabrir en otra serie recentren el scroll. */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <WheelColumn
          key={`kg-${kgAnchor}`}
          testID="wheel-col-kg"
          caption="Kg"
          values={kg.values}
          initialIndex={kg.initialIndex}
          onIndexChange={(i) => { kgIdx.current = i }}
          reducedMotion={reducedMotion}
          exec={exec}
          format={(v) => formatWeightEsCl(v)}
          accessibilityLabel="Rueda de kilos"
        />
        <WheelColumn
          key={`reps-${repsAnchor}`}
          testID="wheel-col-reps"
          caption="Reps"
          values={reps.values}
          initialIndex={reps.initialIndex}
          onIndexChange={(i) => { repsIdx.current = i }}
          reducedMotion={reducedMotion}
          exec={exec}
          format={(v) => String(v)}
          accessibilityLabel="Rueda de repeticiones"
        />
      </View>
    </Sheet>
  )
}
