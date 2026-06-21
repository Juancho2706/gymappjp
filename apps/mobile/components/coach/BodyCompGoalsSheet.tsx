import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useTheme } from '../../context/ThemeContext'
import { Button, NativeDialog } from '../../components'
import {
  BODYCOMP_FORMULA_LABELS,
  calcMacrosBodyComp,
  leanBodyMassFromBodyFat,
  type ActivityKeyBC,
  type BodyCompFormula,
  type BodyCompGoals,
  type GoalKeyBC,
} from '../../lib/nutrition-builder'

const ACTIVITY_LABELS: Record<ActivityKeyBC, string> = {
  sedentary: 'Sedentario',
  light: 'Ligero (1–3 d/sem)',
  moderate: 'Moderado (3–5 d/sem)',
  active: 'Activo (6–7 d/sem)',
  very_active: 'Muy activo',
}
const GOAL_LABELS: Record<GoalKeyBC, string> = {
  lose: 'Déficit (bajar grasa)',
  maintain: 'Mantención',
  gain: 'Volumen (ganar músculo)',
}

interface Props {
  open: boolean
  onClose: () => void
  /** Peso del alumno (kg) — requerido para derivar masa magra desde % grasa. */
  weightKg: number | null
  onApply: (goals: BodyCompGoals) => void
}

/**
 * Calculadora de objetivos por composición corporal (módulo body_composition / Pro) —
 * espejo del panel "Objetivos por composición corporal" del PlanBuilderSidebar (web).
 * Katch-McArdle / Cunningham a partir de la masa magra (LBM cruda o derivada de % grasa).
 */
export function BodyCompGoalsSheet({ open, onClose, weightKg, onApply }: Props) {
  const { theme } = useTheme()
  const [formula, setFormula] = useState<BodyCompFormula>('katch')
  const [inputMode, setInputMode] = useState<'bodyfat' | 'lbm'>('bodyfat')
  const [bodyFat, setBodyFat] = useState('')
  const [lbm, setLbm] = useState('')
  const [activity, setActivity] = useState<ActivityKeyBC>('moderate')
  const [goal, setGoal] = useState<GoalKeyBC>('maintain')

  const leanMass = useMemo(() => {
    if (inputMode === 'lbm') {
      const v = parseFloat(lbm.replace(',', '.'))
      return Number.isFinite(v) && v > 0 && (!weightKg || v <= weightKg) ? v : null
    }
    const bf = parseFloat(bodyFat.replace(',', '.'))
    if (!weightKg || !Number.isFinite(bf) || bf < 3 || bf > 70) return null
    return leanBodyMassFromBodyFat(weightKg, bf)
  }, [inputMode, lbm, bodyFat, weightKg])

  const suggested = useMemo(() => {
    if (!weightKg || leanMass == null) return null
    return calcMacrosBodyComp(leanMass, weightKg, activity, goal, formula)
  }, [weightKg, leanMass, activity, goal, formula])

  return (
    <NativeDialog open={open} title="Objetivos por composición corporal" onClose={onClose}>
      <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
        {!weightKg ? (
          <View style={[styles.warn, { borderColor: '#F9731640', backgroundColor: '#F9731614' }]}>
            <Text style={[styles.warnText, { color: '#B45309', fontFamily: 'Inter_600SemiBold' }]}>
              El alumno no tiene peso registrado. Cargá su peso para derivar la masa magra.
            </Text>
          </View>
        ) : (
          <Text style={[styles.note, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Peso del alumno: {Math.round(weightKg)} kg
          </Text>
        )}

        <Chips theme={theme} label="Fórmula" value={formula}
          options={(Object.keys(BODYCOMP_FORMULA_LABELS) as BodyCompFormula[]).map((k) => ({ k, l: BODYCOMP_FORMULA_LABELS[k] }))}
          onPick={(k) => setFormula(k as BodyCompFormula)} />

        <Chips theme={theme} label="Entrada" value={inputMode}
          options={[{ k: 'bodyfat', l: '% grasa corporal' }, { k: 'lbm', l: 'Masa magra (kg)' }]}
          onPick={(k) => setInputMode(k as 'bodyfat' | 'lbm')} />

        {inputMode === 'bodyfat' ? (
          <NumField theme={theme} label="% grasa corporal" value={bodyFat} onChangeText={setBodyFat} placeholder="18" />
        ) : (
          <NumField theme={theme} label="Masa magra (kg)" value={lbm} onChangeText={setLbm} placeholder="60" />
        )}

        <Chips theme={theme} label="Actividad" value={activity}
          options={(Object.keys(ACTIVITY_LABELS) as ActivityKeyBC[]).map((k) => ({ k, l: ACTIVITY_LABELS[k] }))}
          onPick={(k) => setActivity(k as ActivityKeyBC)} />

        <Chips theme={theme} label="Objetivo" value={goal}
          options={(Object.keys(GOAL_LABELS) as GoalKeyBC[]).map((k) => ({ k, l: GOAL_LABELS[k] }))}
          onPick={(k) => setGoal(k as GoalKeyBC)} />

        {leanMass != null ? (
          <Text style={[styles.note, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Masa magra estimada: {Math.round(leanMass * 10) / 10} kg
          </Text>
        ) : null}

        {suggested ? (
          <View style={[styles.preview, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
            <Text style={[styles.previewLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sugerencia</Text>
            <Text style={[styles.previewValue, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              {suggested.calories} kcal · P{suggested.protein} C{suggested.carbs} G{suggested.fats}
            </Text>
          </View>
        ) : null}

        <Button label="Aplicar metas" disabled={!suggested} onPress={() => { if (suggested) { onApply(suggested); onClose() } }} full />
      </ScrollView>
    </NativeDialog>
  )
}

function NumField({ theme, label, value, onChangeText, placeholder }: { theme: any; label: string; value: string; onChangeText: (v: string) => void; placeholder?: string }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} keyboardType="decimal-pad" placeholder={placeholder} placeholderTextColor={theme.mutedForeground}
        style={[styles.input, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} />
    </View>
  )
}

function Chips({ theme, label, value, options, onPick }: { theme: any; label: string; value: string; options: { k: string; l: string }[]; onPick: (k: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {options.map((o) => {
          const on = o.k === value
          return (
            <TouchableOpacity key={o.k} onPress={() => onPick(o.k)} activeOpacity={0.8}
              style={{ borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '1A' : 'transparent' }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: on ? theme.primary : theme.mutedForeground }}>{o.l}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  warn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  warnText: { fontSize: 12, lineHeight: 16 },
  note: { fontSize: 12 },
  fieldLabel: { fontSize: 12 },
  input: { height: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  preview: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 3 },
  previewLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  previewValue: { fontSize: 15 },
})
