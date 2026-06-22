import { useMemo, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { Save, Target } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button } from '../../../components'
import { StatCard, CardHeader, cd } from './shared'
import {
  BASE_NUTRIENTS,
  PRO_NUTRIENTS,
  upsertClientNutrientTarget,
  type NutrientDef,
} from '../../../lib/coach-client-extras'
import type { NutrientTargetRow } from '../../../lib/coach-nutrition-notes'

/**
 * Zona C (coach) · Editor de umbrales de micronutrientes — paridad con CoachNutrientTargetsEditor (web).
 * Define piso/meta/techo por nutriente para ESTE alumno. Base = sodio (tope) + fibra (meta).
 * Pro (nutrition_exchanges ON) suma azúcar + grasa saturada (tope) + grasa insaturada (meta).
 * Escribe via la sesión coach (RLS coach↔alumno). El gate real de escritura es server-side.
 */

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
          return (
            <View key={n.key} style={[styles.nutrientCard, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
              <View style={styles.nutrientHead}>
                <Text style={[styles.nutrientLabel, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{n.label}</Text>
                <View style={[styles.intentBadge, { backgroundColor: badgeColor + '18' }]}>
                  <Text style={[styles.intentTxt, { color: badgeColor, fontFamily: 'Inter_700Bold' }]}>{isCap ? 'Tope' : 'Meta'}</Text>
                </View>
              </View>
              <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{n.hint}</Text>
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
              <Button label={isSaving ? 'Guardando…' : 'Guardar'} leftIcon={Save} variant="outline" onPress={() => save(n)} disabled={isSaving} full />
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
})
