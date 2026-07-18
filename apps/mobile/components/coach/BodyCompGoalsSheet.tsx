import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Lock, Sparkles } from 'lucide-react-native'
import {
  computeCunningham,
  computeKatchMcArdle,
  computeTDEE,
  deriveCalorieTarget,
  deriveMacroTargets,
  leanBodyMassFromBodyFat,
  type ActivityLevel,
  type Goal,
} from '@eva/nutrition-engine'
import { useTheme } from '../../context/ThemeContext'
import { Button, NativeDialog } from '../index'
import { GLOWS } from '../../lib/shadows'

// Acento de dominio composición corporal = sport-500 (mismo que el panel web
// PlanBuilderSidebar). Literal SOLO para el glyph lucide; surfaces/texto usan
// utilities className (bg-sport-*/text-sport-*) que sí flipean en dark.
const SPORT_ICON = GLOWS.sport.shadowColor as string

type ActivityKey = ActivityLevel
type GoalKey = Goal
type BodyCompFormula = 'katch' | 'cunningham'

export interface MacroGoals {
  calories: number
  protein: number
  carbs: number
  fats: number
}

const GOAL_LABELS: Record<GoalKey, string> = {
  lose: 'Déficit (bajar grasa)',
  maintain: 'Mantención',
  gain: 'Volumen (ganar músculo)',
}

const ACTIVITY_LABELS: Record<ActivityKey, string> = {
  sedentary: 'Sedentario',
  light: 'Ligero (1–3 d/sem)',
  moderate: 'Moderado (3–5 d/sem)',
  active: 'Activo (6–7 d/sem)',
  very_active: 'Muy activo',
}

const FORMULA_LABELS: Record<BodyCompFormula, string> = {
  katch: 'Katch-McArdle',
  cunningham: 'Cunningham (atletas)',
}

/**
 * Objetivos por composición corporal (Pro): BMR vía Katch-McArdle / Cunningham
 * desde la masa magra (LBM), luego TDEE → calorías → macros. Delega 100% en
 * @eva/nutrition-engine → mismos números que el web PlanBuilderSidebar para el
 * mismo alumno/objetivo. La LBM viene de % de grasa (necesita peso) o cruda.
 */
function calcMacrosBodyComp(
  leanBodyMassKg: number,
  weightKg: number,
  activity: ActivityKey,
  goal: GoalKey,
  formula: BodyCompFormula
): MacroGoals {
  const bmr =
    formula === 'cunningham' ? computeCunningham(leanBodyMassKg) : computeKatchMcArdle(leanBodyMassKg)
  const tdee = computeTDEE(bmr, activity)
  const calories = deriveCalorieTarget(tdee, goal)
  const macros = deriveMacroTargets(calories, weightKg, goal)
  return { calories, protein: macros.protein_g, carbs: macros.carbs_g, fats: macros.fats_g }
}

interface Props {
  open: boolean
  onClose: () => void
  /**
   * Entitlement `body_composition` del workspace activo (espejo VISIBILIDAD del
   * hook useEntitlements). El gate de dinero NO vive acá: aplicar metas solo
   * escribe números en el plan (write-path ya existente, no gated por módulo).
   */
  hasModule: boolean
  /** Aplica las metas calculadas al draft (setMacrosManual + patch en el padre). */
  onApply: (goals: MacroGoals) => void
}

/**
 * Sheet Pro "Objetivos por composición corporal" — espejo del panel homónimo del
 * web (PlanBuilderSidebar). Autocontenido: captura peso + %grasa/masa-magra +
 * actividad + objetivo, computa la sugerencia y la aplica vía onApply. Cuando el
 * módulo está OFF muestra el teaser bloqueado (mismo comportamiento que web).
 */
export function BodyCompGoalsSheet({ open, onClose, hasModule, onApply }: Props) {
  const { theme } = useTheme()
  const [formula, setFormula] = useState<BodyCompFormula>('katch')
  const [inputMode, setInputMode] = useState<'bodyfat' | 'lbm'>('bodyfat')
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [lbm, setLbm] = useState('')
  const [activity, setActivity] = useState<ActivityKey>('moderate')
  const [goal, setGoal] = useState<GoalKey>('maintain')

  // LBM resuelta: cruda (validada contra el peso) o derivada de % grasa.
  const leanMass = useMemo(() => {
    const w = Number.parseFloat(weight)
    const validW = Number.isFinite(w) && w > 0
    if (inputMode === 'lbm') {
      const raw = Number.parseFloat(lbm)
      return Number.isFinite(raw) && raw > 0 && (!validW || raw <= w) ? raw : null
    }
    const bf = Number.parseFloat(bodyFat)
    if (!validW || !Number.isFinite(bf) || bf < 3 || bf > 70) return null
    return leanBodyMassFromBodyFat(w, bf)
  }, [weight, inputMode, lbm, bodyFat])

  const suggested = useMemo(() => {
    const w = Number.parseFloat(weight)
    if (!hasModule || !Number.isFinite(w) || w <= 0 || leanMass == null) return null
    return calcMacrosBodyComp(leanMass, w, activity, goal, formula)
  }, [hasModule, weight, leanMass, activity, goal, formula])

  return (
    <NativeDialog open={open} title="Objetivos por composición corporal" onClose={onClose}>
      {!hasModule ? (
        <View style={{ gap: 12 }}>
          <View className="bg-surface-sunken rounded-control" style={styles.lockBox}>
            <Lock size={18} color={theme.mutedForeground} />
            <Text className="font-sans text-muted" style={styles.lockText}>
              Función <Text className="font-sans-bold text-strong">Pro</Text>. Activa el módulo de
              composición corporal para calcular objetivos desde la masa magra (Katch-McArdle /
              Cunningham). Más preciso para alumnos con % de grasa medido (ISAK, DEXA, BIA).
            </Text>
          </View>
          <Button label="Entendido" variant="outline" onPress={onClose} full />
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <Sparkles size={15} color={SPORT_ICON} />
            <Text className="font-sans text-muted" style={styles.hint}>
              Estima el gasto energético desde la masa magra en vez de solo peso y altura.
            </Text>
          </View>

          <Chips
            label="Fórmula (BMR)"
            value={formula}
            options={(Object.keys(FORMULA_LABELS) as BodyCompFormula[]).map((k) => ({ k, l: FORMULA_LABELS[k] }))}
            onPick={(k) => setFormula(k as BodyCompFormula)}
          />

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <NumField theme={theme} testID="bodycomp-weight" label="Peso (kg)" value={weight} onChangeText={setWeight} />
            {inputMode === 'bodyfat' ? (
              <NumField theme={theme} testID="bodycomp-bodyfat" label="% Grasa" value={bodyFat} onChangeText={setBodyFat} placeholder="Ej: 18" />
            ) : (
              <NumField theme={theme} testID="bodycomp-lbm" label="Masa magra (kg)" value={lbm} onChangeText={setLbm} placeholder="Ej: 64" />
            )}
          </View>

          <Chips
            label="Fuente de masa magra"
            value={inputMode}
            options={[
              { k: 'bodyfat', l: '% Grasa' },
              { k: 'lbm', l: 'Masa magra (kg)' },
            ]}
            onPick={(k) => setInputMode(k as 'bodyfat' | 'lbm')}
          />

          <Chips
            label="Actividad"
            value={activity}
            options={(Object.keys(ACTIVITY_LABELS) as ActivityKey[]).map((k) => ({ k, l: ACTIVITY_LABELS[k] }))}
            onPick={(k) => setActivity(k as ActivityKey)}
          />

          <Chips
            label="Objetivo"
            value={goal}
            options={(Object.keys(GOAL_LABELS) as GoalKey[]).map((k) => ({ k, l: GOAL_LABELS[k] }))}
            onPick={(k) => setGoal(k as GoalKey)}
          />

          {leanMass != null ? (
            <Text className="font-sans text-muted" style={styles.hint}>
              Masa magra usada:{' '}
              <Text className="font-mono-medium text-sport-600">{leanMass.toFixed(1)} kg</Text>
            </Text>
          ) : null}

          {suggested ? (
            <View className="bg-sport-100 border border-sport-300 rounded-control" style={styles.result}>
              <ResultRow label="kcal" value={String(suggested.calories)} valueClass="text-sport-700" />
              <ResultRow label="Proteína" value={`${suggested.protein}g`} valueClass="text-ember-600" />
              <ResultRow label="Carbos" value={`${suggested.carbs}g`} valueClass="text-sport-600" />
              <ResultRow label="Grasas" value={`${suggested.fats}g`} valueClass="text-aqua-600" />
            </View>
          ) : null}

          <Button
            testID="bodycomp-apply"
            label="Aplicar metas sugeridas"
            disabled={!suggested}
            onPress={() => {
              if (!suggested) return
              onApply(suggested)
              onClose()
            }}
            full
          />
        </ScrollView>
      )}
    </NativeDialog>
  )
}

function NumField({
  theme,
  testID,
  label,
  value,
  onChangeText,
  placeholder,
}: {
  theme: ReturnType<typeof useTheme>['theme']
  testID: string
  label: string
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
}) {
  return (
    <View style={{ flex: 1, gap: 5 }}>
      <Text className="text-muted font-sans" style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder={placeholder ?? '0'}
        placeholderTextColor={theme.mutedForeground}
        className="bg-surface-card border border-default text-strong font-sans"
        style={styles.numInput}
      />
    </View>
  )
}

function Chips({
  label,
  value,
  options,
  onPick,
}: {
  label: string
  value: string
  options: { k: string; l: string }[]
  onPick: (k: string) => void
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text className="text-muted font-sans" style={styles.fieldLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {options.map((o) => {
          const on = o.k === value
          return (
            <TouchableOpacity
              key={o.k}
              testID="bodycomp-chip"
              onPress={() => onPick(o.k)}
              activeOpacity={0.8}
              className={on ? 'border-sport-500 bg-sport-100' : 'border-subtle'}
              style={styles.chip}
            >
              <Text className={`font-sans-semibold ${on ? 'text-sport-700' : 'text-muted'}`} style={styles.chipText}>
                {o.l}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

function ResultRow({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
  return (
    <View style={styles.resultRow}>
      <Text className="font-sans text-muted" style={styles.resultLabel}>{label}</Text>
      <Text className={`font-mono-medium ${valueClass}`} style={styles.resultValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  lockBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
  lockText: { flex: 1, fontSize: 12, lineHeight: 17 },
  hint: { fontSize: 12, lineHeight: 16, flex: 1 },
  fieldLabel: { fontSize: 12 },
  numInput: { height: 46, borderRadius: 10, paddingHorizontal: 8, fontSize: 15, textAlign: 'center' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  chipText: { fontSize: 12 },
  result: { paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultLabel: { fontSize: 12 },
  resultValue: { fontSize: 14 },
})
