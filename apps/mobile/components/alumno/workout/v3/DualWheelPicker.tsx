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
 * Rango COMPLETO (decision CEO QA4), abre CENTRADA en el valor anterior de la serie (o el objetivo si
 * no hay anterior):
 *   · kg   = 0 a 400 en pasos de 2,5 (161 topes).
 *   · reps = 0 a 100 en pasos de 1  (101 topes).
 * El ancla se redondea al grid del paso para fijar el tope inicial bajo la capsula.
 */

// Alto de cada item (mockup a3c = 46px) y cuantos se ven (impar → hay un centro real).
const ITEM_HEIGHT = 46
const VISIBLE = 5
const PAD_V = ITEM_HEIGHT * Math.floor(VISIBLE / 2)

// Escala del tope central: fontSize base 22 × 1.227 ≈ 27px (mockup `.a3c-wv.sel` = 27px/900).
const CENTER_SCALE = 27 / 22

// Rango/paso por eje — COMPLETO (decision CEO QA4).
const KG_STEP = 2.5
const KG_MAX = 400 // 0..400 en pasos de 2,5 → 161 topes
const REPS_STEP = 1
const REPS_MAX = 100 // 0..100 en pasos de 1 → 101 topes

// Tick haptico: throttle en ms para no saturar en scroll rapido (el tick por-item ya lo acota).
const HAPTIC_THROTTLE_MS = 35

interface WheelValues {
  values: number[]
  initialIndex: number
}

/**
 * Construye el arreglo COMPLETO de valores 0..max en pasos de `step` (decision CEO QA4). El `anchor`
 * (valor anterior) ya NO recorta la lista: solo fija el tope inicial bajo la capsula (redondeado al
 * grid del paso, clamp a [0, max]).
 */
function buildWheelValues(anchor: number, step: number, max: number): WheelValues {
  const steps = Math.round(max / step)
  const values: number[] = []
  for (let i = 0; i <= steps; i += 1) {
    values.push(Math.round(i * step * 100) / 100)
  }
  const snapped = Math.min(max, Math.max(0, Math.round(anchor / step) * step))
  const initialIndex = Math.max(0, Math.min(values.length - 1, Math.round(snapped / step)))
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
    // Mockup a3c: centro opacidad 1 (y crece a 27px vía CENTER_SCALE); vecino f1 .5/.9; f2 .24/.78.
    const opacity = interpolate(dist, [0, ITEM_HEIGHT, ITEM_HEIGHT * 2], [1, 0.5, 0.24], Extrapolation.CLAMP)
    const scale = interpolate(dist, [0, ITEM_HEIGHT, ITEM_HEIGHT * 2], [CENTER_SCALE, 0.9, 0.78], Extrapolation.CLAMP)
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
      {/* Columna TRANSPARENTE sobre el sheet (mockup): sin caja hundida por columna; solo la capsula
          central tiene fondo. */}
      <View style={{ height: ITEM_HEIGHT * VISIBLE, position: 'relative', overflow: 'hidden' }}>
        {/* Capsula del centro (borde COMPLETO del acento al 55%) + hairlines blancas arriba/abajo. */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: PAD_V, left: 6, right: 6, height: ITEM_HEIGHT, borderRadius: 13, borderWidth: 2, borderColor: hexToRgba(exec.accent, 0.55), backgroundColor: hexToRgba(exec.accent, 0.08) }}
        />
        <View pointerEvents="none" style={{ position: 'absolute', top: PAD_V, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.14)' }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: PAD_V + ITEM_HEIGHT, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.14)' }} />
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
  exerciseName,
  totalSets,
}: {
  open: boolean
  onClose: () => void
  setNumber: number
  kgAnchor: number
  repsAnchor: number
  exec: ExecTheme
  reducedMotion?: boolean
  onDone: (weightKg: number, reps: number) => void
  /** Aditivos (mockup a3c): subtitulo "{ejercicio} · N de M" bajo el titulo "Serie N". */
  exerciseName?: string
  totalSets?: number
}) {
  const kg = useMemo(() => buildWheelValues(kgAnchor, KG_STEP, KG_MAX), [kgAnchor])
  const reps = useMemo(() => buildWheelValues(repsAnchor, REPS_STEP, REPS_MAX), [repsAnchor])

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
      snapPoints={['66%']}
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
      {/* Subtitulo del mockup a3c: "{ejercicio} · N de M" (fallback a la guia de deslizar si no hay datos). */}
      <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: s.textMuted, textAlign: 'center', marginBottom: 4 }}>
        {exerciseName && totalSets != null
          ? `${exerciseName} · ${setNumber} de ${totalSets}`
          : 'Desliza para ajustar el peso y las repeticiones'}
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
      {/* Nota inferior del mockup a3c: centrado + tick haptico (con "tick haptico" en acento). */}
      <Text style={{ fontFamily: FONT.ui, fontSize: 11, color: s.textMuted, textAlign: 'center', marginTop: 10 }}>
        Centrada en tu valor anterior · <Text style={{ fontFamily: FONT.uiBold, color: hexToRgba(exec.accent, 1) }}>tick háptico</Text> por paso
      </Text>
    </Sheet>
  )
}

/**
 * Rueda de UN valor (QA4 · roller) — MISMA mecánica/estética que la dual (reusa `WheelColumn`, el Sheet
 * nativo, la cápsula y el tick háptico), con UNA sola columna. NO toca el guardado: sólo produce un
 * número y lo entrega por `onDone`, que el llamador escribe por su camino de estado/prefill existente.
 * Componente HERMANO aditivo — la rueda dual queda intacta.
 */
export function SingleWheelPicker({
  open,
  onClose,
  value,
  step = 1,
  max = 100,
  label,
  title,
  subtitle,
  exec,
  reducedMotion = false,
  onDone,
  testID = 'single-wheel',
}: {
  open: boolean
  onClose: () => void
  value: number
  step?: number
  max?: number
  label: string
  title: string
  subtitle?: string | null
  exec: ExecTheme
  reducedMotion?: boolean
  onDone: (value: number) => void
  testID?: string
}) {
  const col = useMemo(() => buildWheelValues(value, step, max), [value, step, max])
  const idx = useRef(col.initialIndex)
  useEffect(() => {
    idx.current = col.initialIndex
  }, [col])
  const s = exec.surface
  const handleDone = () => onDone(col.values[idx.current] ?? value)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      forceDark
      scrollable={false}
      snapPoints={['58%']}
      title={title}
      accessibilityLabel={`Rueda de ${label}`}
      footer={
        <JuicyButton
          testID={`${testID}-done`}
          label="Listo"
          onPress={handleDone}
          exec={exec}
          reducedMotion={reducedMotion}
          icon={<Check size={18} color={exec.accentText} strokeWidth={2.6} />}
          accessibilityLabel={`Listo, usar este valor de ${label}`}
        />
      }
    >
      {subtitle ? (
        <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: s.textMuted, textAlign: 'center', marginBottom: 4 }}>
          {subtitle}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        <View style={{ width: '58%' }}>
          <WheelColumn
            key={`single-${value}`}
            testID={`${testID}-col`}
            caption={label}
            values={col.values}
            initialIndex={col.initialIndex}
            onIndexChange={(i) => {
              idx.current = i
            }}
            reducedMotion={reducedMotion}
            exec={exec}
            format={(v) => String(v)}
            accessibilityLabel={`Rueda de ${label}`}
          />
        </View>
      </View>
      <Text style={{ fontFamily: FONT.ui, fontSize: 11, color: s.textMuted, textAlign: 'center', marginTop: 10 }}>
        Centrada en tu valor actual · <Text style={{ fontFamily: FONT.uiBold, color: hexToRgba(exec.accent, 1) }}>tick háptico</Text> por paso
      </Text>
    </Sheet>
  )
}
