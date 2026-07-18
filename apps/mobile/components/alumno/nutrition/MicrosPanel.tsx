import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { AnimatePresence, MotiView } from 'moti'
import { ArrowUp, Check, ChevronDown, Triangle } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { shadow } from '../../../lib/shadows'
import { MACRO_COLORS } from '../../MacroRingSummary'
import { apiFetch, ApiError } from '../../../lib/api'

/**
 * MicrosPanel (E4-09, gap 2.2) — panel colapsable "Micronutrientes". Espejo del
 * `MicrosPanel` de web (`apps/web/.../nutrition/_components/MicrosPanel.tsx`):
 *  - BASE (sodio `cap` + fibra `aimup`): gratis; visible salvo que el coach lo apague.
 *  - AVANZADOS (azúcar/grasa sat./insat., Pro): GATEADO server-side por el módulo
 *    `nutrition_exchanges`. El gate vive en el endpoint (`resolveFeaturePrefs`,
 *    fail-closed) — este componente SOLO renderiza lo que llega. Los datos Pro
 *    NUNCA se serializan si la sección no está habilitada (money-safety) → aquí
 *    `advanced == null` significa "sin derecho" y muestra el upsell, no el dato.
 *
 * Autofetch: consume `/api/mobile/nutrition/micros?date=YYYY-MM-DD` (Bearer del
 * alumno; RLS + assertModule del lado servidor). Presentacional salvo el fetch.
 * Barras de rango con topes del coach (mínimo/meta/máximo) y estado redundante
 * (color + palabra + icono + posición), igual que `NutrientRangeBar` de web.
 */

interface MicroTarget {
  floor?: number
  target?: number
  ceiling?: number
}

interface MicrosResponse {
  hasPlan: boolean
  domainEnabled: boolean
  date: string
  sections?: { microsBase: boolean; microsAdvanced: boolean }
  base?: {
    sodiumMg: number | null
    fiberG: number | null
    sodiumTarget: MicroTarget | null
    fiberTarget: MicroTarget | null
  }
  advanced?: {
    sugarG: number | null
    saturatedFatG: number | null
    unsaturatedFatG: number | null
    sugarTarget: MicroTarget | null
    saturatedFatTarget: MicroTarget | null
    unsaturatedFatTarget: MicroTarget | null
  } | null
}

type Intent = 'cap' | 'aimup'
type Status = 'low' | 'optimal' | 'high'

interface MicroRow {
  key: string
  label: string
  value: number | null
  unit: string
  intent: Intent
  target: MicroTarget | null
}

function hasAnyBound(t?: MicroTarget | null): boolean {
  return t != null && (t.floor != null || t.target != null || t.ceiling != null)
}

function roundish(n: number): number {
  return Math.abs(n) < 10 ? Math.round(n * 10) / 10 : Math.round(n)
}

/** Estado redundante (mirror `nutrientStatus` de web). */
function nutrientStatus(value: number, intent: Intent, t?: MicroTarget | null): Status {
  const floor = t?.floor
  const target = t?.target
  const ceiling = t?.ceiling
  if (intent === 'cap') {
    const limit = ceiling ?? target
    if (limit != null && value > limit) return 'high'
    return 'optimal'
  }
  if (ceiling != null && value > ceiling) return 'high'
  const reach = target ?? floor
  if (reach != null && value >= reach) return 'optimal'
  if (floor != null && value >= floor) return 'optimal'
  return 'low'
}

/** Tope superior de la escala (mirror `scaleMax` de web): +10% de aire. */
function scaleMax(value: number, t?: MicroTarget | null): number {
  const candidates = [value, t?.floor ?? 0, t?.target ?? 0, t?.ceiling ?? 0].filter((n) => n > 0)
  const max = candidates.length ? Math.max(...candidates) : 1
  return max * 1.1
}

function pct(n: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(Math.max((n / max) * 100, 0), 100)
}

function MicroBar({ row }: { row: MicroRow }) {
  const { theme } = useTheme()

  // Estado neutro: sin valor logueado y sin meta del coach.
  if (row.value == null && !hasAnyBound(row.target)) {
    return (
      <View testID={`nutrition-micro-${row.key}`} style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text className="text-muted" style={{ fontFamily: FONT.uiMedium, fontSize: 12 }}>{row.label}</Text>
          <Text className="text-muted" style={{ fontFamily: FONT.monoMedium, fontSize: 12, fontVariant: ['tabular-nums'] }}>— {row.unit}</Text>
        </View>
        <Text className="text-subtle" style={{ fontFamily: FONT.ui, fontSize: 10.5 }}>sin meta definida</Text>
      </View>
    )
  }

  // Valor presente pero sin meta del coach: número plano.
  if (!hasAnyBound(row.target)) {
    return (
      <View testID={`nutrition-micro-${row.key}`} style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text className="text-muted" style={{ fontFamily: FONT.uiMedium, fontSize: 12 }}>{row.label}</Text>
          <Text className="text-strong" style={{ fontFamily: FONT.monoMedium, fontSize: 12, fontVariant: ['tabular-nums'] }}>
            {roundish(row.value ?? 0)}{row.unit}
          </Text>
        </View>
        <Text className="text-subtle" style={{ fontFamily: FONT.ui, fontSize: 10.5 }}>sin meta definida</Text>
      </View>
    )
  }

  const value = row.value ?? 0
  const status = nutrientStatus(value, row.intent, row.target)
  const max = scaleMax(value, row.target)
  const fillPct = pct(value, max)

  // Codificación redundante: color + palabra + icono + posición.
  const statusMeta: Record<Status, { word: string; color: string; Icon: typeof ArrowUp }> = {
    low: { word: 'Bajo', color: theme.mutedForeground, Icon: ArrowUp },
    optimal: { word: 'Óptimo', color: theme.success, Icon: Check },
    high: { word: 'Alto', color: theme.destructive, Icon: Triangle },
  }
  const meta = statusMeta[status]
  const StatusIcon = meta.Icon
  const fillColor = status === 'high' ? theme.destructive : status === 'optimal' ? theme.success : MACRO_COLORS.protein

  const ticks = [
    row.target?.floor != null ? { key: 'floor', at: row.target.floor, ceiling: false } : null,
    row.target?.target != null ? { key: 'target', at: row.target.target, ceiling: false } : null,
    row.target?.ceiling != null ? { key: 'ceiling', at: row.target.ceiling, ceiling: true } : null,
  ].filter((t): t is { key: string; at: number; ceiling: boolean } => t !== null)

  return (
    <View testID={`nutrition-micro-${row.key}`} style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text className="text-muted" style={{ fontFamily: FONT.uiMedium, fontSize: 12 }}>{row.label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ color: meta.color, fontFamily: FONT.monoMedium, fontSize: 12, fontVariant: ['tabular-nums'] }}>
            {roundish(value)}{row.unit}
          </Text>
          <StatusIcon size={12} color={meta.color} strokeWidth={2.5} />
          <Text style={{ color: meta.color, fontFamily: FONT.uiSemibold, fontSize: 11 }}>{meta.word}</Text>
        </View>
      </View>
      <View style={{ height: 10, borderRadius: 9999, backgroundColor: theme.muted, overflow: 'hidden', position: 'relative' }}>
        <MotiView
          from={{ width: '0%' }}
          animate={{ width: `${fillPct}%` }}
          transition={{ type: 'timing', duration: 420 }}
          style={{ height: '100%', borderRadius: 9999, backgroundColor: fillColor }}
        />
        {ticks.map((t) => (
          <View
            key={t.key}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: 1.5,
              left: `${pct(t.at, max)}%`,
              backgroundColor: t.ceiling ? theme.destructive : theme.foreground,
              opacity: t.ceiling ? 0.9 : 0.4,
            }}
          />
        ))}
      </View>
    </View>
  )
}

export function MicrosPanel({ date }: { date: string }) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<MicrosResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setFailed(false)
    apiFetch<MicrosResponse>(`/api/mobile/nutrition/micros?date=${encodeURIComponent(date)}`, {
      authenticated: true,
    })
      .then((res) => { if (alive) setData(res) })
      .catch((e) => {
        if (!alive) return
        setData(null)
        // Silencioso: micros es un panel secundario; degrada ocultándose (no bloquea nutrición).
        if (!(e instanceof ApiError)) setFailed(true)
        else setFailed(true)
      })
    return () => { alive = false }
  }, [date])

  // Degradación limpia: sin plan / dominio OFF / base apagada por el coach / error → ocultar panel.
  if (failed || !data || !data.hasPlan || !data.domainEnabled) return null
  if (!data.sections?.microsBase) return null

  const base = data.base
  const baseRows: MicroRow[] = [
    { key: 'sodio', label: 'Sodio', value: base?.sodiumMg ?? null, unit: 'mg', intent: 'cap', target: base?.sodiumTarget ?? null },
    { key: 'fibra', label: 'Fibra', value: base?.fiberG ?? null, unit: 'g', intent: 'aimup', target: base?.fiberTarget ?? null },
  ]

  const adv = data.advanced
  const advancedRows: MicroRow[] = adv
    ? [
        { key: 'azucar', label: 'Azúcar', value: adv.sugarG, unit: 'g', intent: 'cap', target: adv.sugarTarget },
        { key: 'grasa-saturada', label: 'Grasa saturada', value: adv.saturatedFatG, unit: 'g', intent: 'cap', target: adv.saturatedFatTarget },
        { key: 'grasa-insaturada', label: 'Grasa insaturada', value: adv.unsaturatedFatG, unit: 'g', intent: 'aimup', target: adv.unsaturatedFatTarget },
      ]
    : []

  return (
    <View
      testID="nutrition-micros-panel"
      style={[
        { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius['2xl'], overflow: 'hidden' },
        shadow('sm', theme.scheme),
      ]}
    >
      <Pressable
        testID="nutrition-micros-toggle"
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingVertical: 13 }}
      >
        <Text className="text-strong" style={{ fontFamily: FONT.displayBold, fontSize: 17, letterSpacing: -0.3 }}>
          Micronutrientes
        </Text>
        <MotiView animate={{ rotate: open ? '180deg' : '0deg' }} transition={{ type: 'timing', duration: 200 }}>
          <ChevronDown size={18} color={theme.mutedForeground} strokeWidth={2.5} />
        </MotiView>
      </Pressable>

      <AnimatePresence>
        {open && (
          <MotiView
            from={{ opacity: 0, translateY: -6 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, translateY: -6 }}
            transition={{ type: 'timing', duration: 220 }}
            style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 2, gap: 16 }}
          >
            {baseRows.map((row) => (
              <MicroBar key={row.key} row={row} />
            ))}

            {/* Divisor AVANZADOS · PRO */}
            <View style={{ gap: 8, paddingTop: 2 }}>
              <View style={{ height: 1, backgroundColor: theme.border }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text className="text-muted" style={{ fontFamily: FONT.uiExtra, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Avanzados
                </Text>
                <View style={{ backgroundColor: `${MACRO_COLORS.protein}22`, borderRadius: 9999, paddingHorizontal: 6, paddingVertical: 1.5 }}>
                  <Text style={{ color: MACRO_COLORS.protein, fontFamily: FONT.uiExtra, fontSize: 9, letterSpacing: 0.3 }}>PRO</Text>
                </View>
              </View>
            </View>

            {adv ? (
              advancedRows.map((row) => <MicroBar key={row.key} row={row} />)
            ) : (
              <Text className="text-subtle" style={{ fontFamily: FONT.ui, fontSize: 10.5, lineHeight: 15 }}>
                Azúcar y grasas detalladas con Nutrición Pro de tu coach.
              </Text>
            )}
          </MotiView>
        )}
      </AnimatePresence>
    </View>
  )
}
