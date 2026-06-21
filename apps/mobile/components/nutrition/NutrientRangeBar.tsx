import { StyleSheet, Text, View } from 'react-native'
import { ArrowUp, Check, Triangle } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'

/**
 * Barra de rango de un micronutriente con floor/target/ceiling y un fill — lado ALUMNO (mobile).
 * Espejo de apps/web/src/components/nutrition/NutrientRangeBar.tsx. Estado redundante: color +
 * palabra (Bajo/Optimo/Alto) + icono + posicion (nunca color solo).
 */

export type NutrientIntent = 'aimup' | 'cap'
export type NutrientStatus = 'low' | 'optimal' | 'high'

export interface NutrientRangeBarProps {
  label: string
  value: number
  unit: string
  floor?: number
  target?: number
  ceiling?: number
  intent: NutrientIntent
}

function roundish(n: number): number {
  return Math.abs(n) < 10 ? Math.round(n * 10) / 10 : Math.round(n)
}

/** Logica de estado 1:1 con la web (nutrientStatus). */
export function nutrientStatus(
  value: number,
  intent: NutrientIntent,
  floor?: number,
  target?: number,
  ceiling?: number
): NutrientStatus {
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

function scaleMax(value: number, floor?: number, target?: number, ceiling?: number): number {
  const candidates = [value, floor ?? 0, target ?? 0, ceiling ?? 0].filter((n) => n > 0)
  const max = candidates.length ? Math.max(...candidates) : 1
  return max * 1.1
}

function pct(n: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(Math.max((n / max) * 100, 0), 100)
}

export function NutrientRangeBar({
  label,
  value,
  unit,
  floor,
  target,
  ceiling,
  intent,
}: NutrientRangeBarProps) {
  const { theme } = useTheme()
  const status = nutrientStatus(value, intent, floor, target, ceiling)

  const STATUS_META: Record<NutrientStatus, { word: string; Icon: typeof ArrowUp; color: string }> = {
    low: { word: 'Bajo', Icon: ArrowUp, color: theme.mutedForeground },
    optimal: { word: 'Óptimo', Icon: Check, color: theme.macro.goal },
    high: { word: 'Alto', Icon: Triangle, color: theme.macro.over },
  }
  const meta = STATUS_META[status]
  const StatusIcon = meta.Icon

  const max = scaleMax(value, floor, target, ceiling)
  const fillPct = pct(value, max)
  const fillColor =
    status === 'high' ? theme.macro.over : status === 'optimal' ? theme.macro.goal : theme.macro.protein

  const ticks = [
    floor != null ? { key: 'floor', at: floor } : null,
    target != null ? { key: 'target', at: target } : null,
    ceiling != null ? { key: 'ceiling', at: ceiling } : null,
  ].filter((t): t is { key: string; at: number } => t !== null)

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
        <View style={styles.valueRow}>
          <Text style={[styles.value, { color: meta.color, fontFamily: 'Inter_600SemiBold' }]}>
            {roundish(value)}
            {unit}
          </Text>
          <StatusIcon size={12} color={meta.color} />
          <Text style={[styles.word, { color: meta.color, fontFamily: 'Montserrat_700Bold' }]}>{meta.word}</Text>
        </View>
      </View>
      <View style={[styles.track, { backgroundColor: theme.secondary }]}>
        <View style={[styles.fill, { width: `${fillPct}%`, backgroundColor: fillColor }]} />
        {ticks.map((t) => (
          <View
            key={t.key}
            style={[
              styles.tick,
              {
                left: `${pct(t.at, max)}%`,
                backgroundColor: t.key === 'ceiling' ? theme.macro.over : theme.foreground + '66',
              },
            ]}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 11 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  value: { fontSize: 11 },
  word: { fontSize: 11 },
  track: { height: 10, borderRadius: 999, overflow: 'hidden', position: 'relative' },
  fill: { height: '100%', borderRadius: 999 },
  tick: { position: 'absolute', top: 0, height: '100%', width: 1 },
})
