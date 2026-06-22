import { useMemo, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { ArrowUp, Check, Save, Target, Triangle } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button } from '../../../components'
import { StatCard, CardHeader, cd } from './shared'
import {
  BASE_NUTRIENTS,
  PRO_NUTRIENTS,
  upsertClientNutrientTarget,
  type NutrientDef,
  type NutrientIntent,
} from '../../../lib/coach-client-extras'
import type { NutrientTargetRow } from '../../../lib/coach-nutrition-notes'

/**
 * Zona C (coach) · Editor de umbrales de micronutrientes — paridad con CoachNutrientTargetsEditor (web).
 * Define piso/meta/techo por nutriente para ESTE alumno. Base = sodio (tope) + fibra (meta).
 * Pro (nutrition_exchanges ON) suma azúcar + grasa saturada (tope) + grasa insaturada (meta).
 * Escribe via la sesión coach (RLS coach↔alumno). El gate real de escritura es server-side.
 */

/** Valor de ejemplo para el preview de la barra (espejo del previewValue del web). */
const PREVIEW_VALUE: Record<string, number> = {
  sodium_mg: 1500,
  fiber_g: 18,
  sugar_g: 30,
  saturated_fat_g: 15,
  unsaturated_fat_g: 25,
}

// ── NutrientRangeBar (RN) — paridad visual con components/nutrition/NutrientRangeBar.tsx ──
// Estado redundante: color + palabra (Bajo/Óptimo/Alto) + ícono + posición del fill.
type NutrientStatus = 'low' | 'optimal' | 'high'

function nutrientStatus(
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

function roundish(n: number): number {
  return Math.abs(n) < 10 ? Math.round(n * 10) / 10 : Math.round(n)
}

function scaleMax(value: number, floor?: number, target?: number, ceiling?: number): number {
  const candidates = [value, floor ?? 0, target ?? 0, ceiling ?? 0].filter((n) => n > 0)
  const max = candidates.length ? Math.max(...candidates) : 1
  return max * 1.1
}

function clampPct(n: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(Math.max((n / max) * 100, 0), 100)
}

function NutrientRangeBar({
  label,
  value,
  unit,
  floor,
  target,
  ceiling,
  intent,
}: {
  label: string
  value: number
  unit: string
  floor?: number
  target?: number
  ceiling?: number
  intent: NutrientIntent
}) {
  const { theme } = useTheme()
  const status = nutrientStatus(value, intent, floor, target, ceiling)
  const STATUS_META: Record<NutrientStatus, { word: string; Icon: typeof ArrowUp; color: string }> = {
    low: { word: 'Bajo', Icon: ArrowUp, color: theme.mutedForeground },
    optimal: { word: 'Óptimo', Icon: Check, color: '#10B981' },
    high: { word: 'Alto', Icon: Triangle, color: '#EF4444' },
  }
  const meta = STATUS_META[status]
  const StatusIcon = meta.Icon
  const max = scaleMax(value, floor, target, ceiling)
  const fillPct = clampPct(value, max)
  const fillColor = status === 'high' ? '#EF4444' : status === 'optimal' ? '#10B981' : '#3B82F6'

  const ticks = [
    floor != null ? { key: 'floor', at: floor, ceiling: false } : null,
    target != null ? { key: 'target', at: target, ceiling: false } : null,
    ceiling != null ? { key: 'ceiling', at: ceiling, ceiling: true } : null,
  ].filter((t): t is { key: string; at: number; ceiling: boolean } => t !== null)

  return (
    <View style={{ gap: 4 }}>
      <View style={styles.barLabelRow}>
        <Text style={[styles.barLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
        <View style={styles.barStatus}>
          <Text style={[styles.barStatusVal, { color: meta.color, fontFamily: theme.fontSans }]}>
            {roundish(value)}{unit}
          </Text>
          <StatusIcon size={11} color={meta.color} />
          <Text style={[styles.barStatusWord, { color: meta.color, fontFamily: 'Inter_600SemiBold' }]}>{meta.word}</Text>
        </View>
      </View>
      <View style={[styles.barTrack, { backgroundColor: theme.border }]}>
        <View style={[styles.barFill, { width: `${fillPct}%`, backgroundColor: fillColor }]} />
        {ticks.map((t) => (
          <View
            key={t.key}
            style={[styles.barTick, { left: `${clampPct(t.at, max)}%`, backgroundColor: t.ceiling ? '#EF4444' : theme.foreground + '66' }]}
          />
        ))}
      </View>
    </View>
  )
}

type Draft = { floor: string; target: string; ceiling: string }

function rowToDraft(row?: NutrientTargetRow): Draft {
  return {
    floor: row?.floor_value != null ? String(row.floor_value) : '',
    target: row?.target_value != null ? String(row.target_value) : '',
    ceiling: row?.ceiling_value != null ? String(row.ceiling_value) : '',
  }
}

function parseNum(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

const FIELD_LABEL: Record<keyof Draft, string> = { floor: 'Piso', target: 'Meta', ceiling: 'Techo' }

export function CoachNutrientTargetsEditor({
  clientId,
  initial,
  proEnabled = false,
  onSaved,
}: {
  clientId: string
  initial: NutrientTargetRow[]
  proEnabled?: boolean
  onSaved?: () => void
}) {
  const { theme } = useTheme()
  const nutrients = useMemo(
    () => (proEnabled ? [...BASE_NUTRIENTS, ...PRO_NUTRIENTS] : BASE_NUTRIENTS),
    [proEnabled]
  )

  const initialByKey = useMemo(() => {
    const map = new Map<string, NutrientTargetRow>()
    for (const row of initial) map.set(row.nutrient_key, row)
    return map
  }, [initial])

  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const out: Record<string, Draft> = {}
    for (const n of [...BASE_NUTRIENTS, ...PRO_NUTRIENTS]) out[n.key] = rowToDraft(initialByKey.get(n.key))
    return out
  })
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setField = (key: string, field: keyof Draft, value: string) => {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key]!, [field]: value } }))
  }

  async function save(n: NutrientDef) {
    setError(null)
    const draft = drafts[n.key]!
    const floorValue = n.fields.includes('floor') ? parseNum(draft.floor) : null
    const targetValue = n.fields.includes('target') ? parseNum(draft.target) : null
    const ceilingValue = n.fields.includes('ceiling') ? parseNum(draft.ceiling) : null
    if (floorValue == null && targetValue == null && ceilingValue == null) {
      setError('Define al menos un umbral.')
      return
    }
    setSavingKey(n.key)
    const r = await upsertClientNutrientTarget({
      clientId,
      nutrientKey: n.key,
      floorValue,
      targetValue,
      ceilingValue,
      intent: n.intent,
    })
    setSavingKey(null)
    if (!r.ok) setError(r.error ?? 'No se pudo guardar.')
    else onSaved?.()
  }

  return (
    <StatCard>
      <CardHeader icon={Target} title="Umbrales de micronutrientes" />
      <View style={{ gap: 14 }}>
        {nutrients.map((n) => {
          const draft = drafts[n.key]!
          const isSaving = savingKey === n.key
          const isCap = n.intent === 'cap'
          const badgeColor = isCap ? '#EF4444' : '#10B981'
          const floor = n.fields.includes('floor') ? parseNum(draft.floor) : null
          const target = n.fields.includes('target') ? parseNum(draft.target) : null
          const ceiling = n.fields.includes('ceiling') ? parseNum(draft.ceiling) : null
          const previewValue = PREVIEW_VALUE[n.key] ?? 0
          return (
            <View key={n.key} style={[styles.nutrientCard, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
              <View style={styles.nutrientHead}>
                <Text style={[styles.nutrientLabel, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{n.label}</Text>
                <View style={[styles.intentBadge, { backgroundColor: badgeColor + '18' }]}>
                  <Text style={[styles.intentTxt, { color: badgeColor, fontFamily: 'Inter_700Bold' }]}>{isCap ? 'Tope' : 'Meta'}</Text>
                </View>
              </View>
              <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{n.hint}</Text>
              {/* Preview redundante (color + palabra + ícono + posición). */}
              <NutrientRangeBar
                label={`Ejemplo (${previewValue} ${n.unit})`}
                value={previewValue}
                unit={n.unit}
                floor={floor ?? undefined}
                target={target ?? undefined}
                ceiling={ceiling ?? undefined}
                intent={n.intent}
              />
              <View style={styles.fieldRow}>
                {(['floor', 'target', 'ceiling'] as const).map((field) => {
                  const enabled = n.fields.includes(field)
                  return (
                    <View key={field} style={[styles.fieldCol, { opacity: enabled ? 1 : 0.4 }]}>
                      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{FIELD_LABEL[field]}</Text>
                      <TextInput
                        value={draft[field]}
                        onChangeText={(v) => setField(n.key, field, v)}
                        editable={enabled && !isSaving}
                        keyboardType="decimal-pad"
                        placeholder={enabled ? n.unit : '—'}
                        placeholderTextColor={theme.mutedForeground}
                        style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans }]}
                      />
                    </View>
                  )
                })}
              </View>
              <Button label={isSaving ? 'Guardando…' : 'Guardar'} leftIcon={Save} onPress={() => save(n)} disabled={isSaving} full />
            </View>
          )
        })}
      </View>
      {error ? <Text style={{ color: theme.destructive, fontSize: 13, fontFamily: theme.fontSans }}>{error}</Text> : null}
      {!proEnabled ? (
        <Text style={[styles.proHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Nutrición Pro desbloquea umbrales para más micros (azúcar, grasas).
        </Text>
      ) : null}
    </StatCard>
  )
}

const styles = StyleSheet.create({
  nutrientCard: { borderWidth: 1, padding: 12, gap: 9 },
  nutrientHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nutrientLabel: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6 },
  intentBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  intentTxt: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.6 },
  hint: { fontSize: 11.5, lineHeight: 16 },
  fieldRow: { flexDirection: 'row', gap: 8 },
  fieldCol: { flex: 1, gap: 5 },
  fieldLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.6 },
  input: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 14 },
  proHint: { fontSize: 11, lineHeight: 16 },
  barLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  barLabel: { fontSize: 11 },
  barStatus: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  barStatusVal: { fontSize: 11 },
  barStatusWord: { fontSize: 11 },
  barTrack: { position: 'relative', height: 9, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
  barTick: { position: 'absolute', top: 0, height: '100%', width: 1.5 },
})
