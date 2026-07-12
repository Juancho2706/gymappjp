import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Activity, Apple, ChevronDown, ChevronLeft, ChevronRight, Check, Droplets, Flame, Footprints, Heart, Lock, MessageSquare, Moon, Pencil, RotateCcw, Salad, Save, Scale, Send, SlidersHorizontal, Timer, Utensils } from 'lucide-react-native'
import { useFocusEffect } from 'expo-router'
import { useTheme } from '../../../context/ThemeContext'
import { Button, EmptyState, ComplianceRing, ProgressBar, MacroPill } from '../../../components'
import { EvaLoader } from '../../../components/EvaLoader'
import { MACRO_COLORS } from '../../MacroRingSummary'
import { FONT } from '../../../lib/typography'
import { BarComposed, type BarComposedPoint } from '../charts/BarComposed'
import { StatCard, CardHeader, MetricBox, cd, formatDate, adherenceColor } from './shared'
import { deriveNutritionCoachAlerts, type NutritionCoachAlert } from '../../../lib/nutrition-coach-alerts'
import { getTodayInSantiago } from '../../../lib/date-utils'
import {
  addCoachMealComment,
  getCoachNutritionZoneC,
  setClientNutritionOverride,
  upsertCoachNutrientTarget,
  upsertCoachPrivateNote,
  type ClientDayDetail,
  type CoachClientDetailData,
  type CoachMealCommentEntry,
  type CoachNutrientTargetEntry,
  type CoachPrivateNoteEntry,
  type NutritionZoneCData,
} from '../../../lib/coach-client-detail'
import { NUTRITION_SECTIONS, DOMAIN_ENABLED_KEY, type NutritionSectionKey, type SectionPrefs } from '@eva/feature-prefs'

// Ámbar de "warning": el DS mobile aún no expone un token semántico de warning (solo
// destructive/success), así que se centraliza acá el único literal en vez de esparcirlo.
const WARNING = '#F59E0B'

function alertColor(variant: NutritionCoachAlert['variant'], theme: { destructive: string; primary: string }): string {
  return variant === 'danger' ? theme.destructive : variant === 'warning' ? WARNING : theme.primary
}

export function NutricionTab({
  clientId,
  data,
  selectedDate,
  onSelectDate,
  dayDetail,
  dayLoading,
  onEditNutrition,
}: {
  clientId: string
  data: CoachClientDetailData
  selectedDate: string
  onSelectDate: (date: string) => void
  dayDetail: ClientDayDetail | null
  dayLoading: boolean
  onEditNutrition?: () => void
}) {
  const { theme } = useTheme()
  const { activeNutrition, nutritionTimeline, nutritionMonthlyAvgPct, nutritionStreakDays, compliance, favoriteFoods, checkIns } = data
  const todayIso = getTodayInSantiago().iso

  const alerts = useMemo(
    () => deriveNutritionCoachAlerts({
      hasActivePlan: !!activeNutrition,
      kcalTarget: Number(activeNutrition?.daily_calories ?? 0),
      weeklyAvgPct: compliance?.nutritionWeeklyAvgPct ?? 0,
      prevWeeklyAvgPct: compliance?.nutritionPrevWeeklyAvgPct ?? 0,
      monthlyAvgPct: nutritionMonthlyAvgPct,
      nutritionTimeline: nutritionTimeline.map((t) => ({ log_date: t.date, mealsDone: t.mealsDone, mealsTotal: t.mealsTotal })),
      santiagoTodayIso: todayIso,
    }),
    [activeNutrition, compliance, nutritionMonthlyAvgPct, nutritionTimeline, todayIso]
  )

  if (!activeNutrition) {
    return (
      <View style={{ gap: 14 }}>
        <EmptyState icon={Apple} title="Sin plan de nutrición" subtitle="Este alumno no tiene un plan activo." />
        {onEditNutrition ? <Button label="Asignar plan de nutrición" leftIcon={Apple} onPress={onEditNutrition} full /> : null}
        <CoachNutritionZoneC clientId={clientId} todayIso={todayIso} />
      </View>
    )
  }

  const today = nutritionTimeline.find((t) => t.date === todayIso) ?? nutritionTimeline[0]
  const kcalPct = today && today.targetCalories > 0 ? Math.min(1, today.consumedCalories / today.targetCalories) : 0
  const todayCompliance = today ? today.compliancePct / 100 : 0

  const asc = [...nutritionTimeline].reverse() // oldest→newest
  const chartPoints: BarComposedPoint[] = asc.map((t, i) => ({ i, bar: t.consumedCalories, avg: t.targetCalories, label: formatDate(t.date) }))
  const heat = asc.slice(-30)

  const weekAvg = compliance?.nutritionWeeklyAvgPct ?? 0

  const recentWeights = checkIns.slice(0, 3)

  return (
    <View style={{ gap: 14 }}>
      {/* Alertas de coach */}
      {alerts.length ? (
        <View style={{ gap: 8 }}>
          {alerts.map((a) => {
            const c = alertColor(a.variant, theme)
            return (
              <View key={a.id} style={[styles.alert, { backgroundColor: c + '14', borderColor: c + '40' }]}>
                <Text style={[styles.alertTitle, { color: c, fontFamily: FONT.uiBold }]}>{a.title}</Text>
                <Text style={[styles.alertDesc, { color: theme.foreground, fontFamily: theme.fontSans }]}>{a.description}</Text>
              </View>
            )
          })}
        </View>
      ) : null}

      {/* Plan + macros */}
      <StatCard>
        <CardHeader icon={Salad} title="Plan activo" right={
          onEditNutrition ? <TouchableOpacity onPress={onEditNutrition} hitSlop={8}><Pencil size={16} color={theme.primary} /></TouchableOpacity> : undefined
        } />
        <Text numberOfLines={1} style={[cd.big, { color: theme.foreground, fontFamily: FONT.display }]}>{activeNutrition.name}</Text>
        <View style={styles.macroRow}>
          {activeNutrition.daily_calories != null && <MacroPill label="kcal" value={activeNutrition.daily_calories} color={theme.primary} />}
          {activeNutrition.protein_g != null && <MacroPill label="P" value={activeNutrition.protein_g} color={MACRO_COLORS.protein} />}
          {activeNutrition.carbs_g != null && <MacroPill label="C" value={activeNutrition.carbs_g} color={MACRO_COLORS.carbs} />}
          {activeNutrition.fats_g != null && <MacroPill label="G" value={activeNutrition.fats_g} color={MACRO_COLORS.fats} />}
        </View>
        {onEditNutrition ? <Button label="Editar / asignar plan" variant="outline" leftIcon={Pencil} onPress={onEditNutrition} full /> : null}
      </StatCard>

      {/* Rings de hoy */}
      <StatCard>
        <CardHeader icon={Flame} title="Hoy" />
        <View style={styles.ringRow}>
          <ComplianceRing value={kcalPct} label="kcal" color={theme.primary} size={64} />
          <ComplianceRing value={todayCompliance} label="Comidas" color={adherenceColor(today?.compliancePct ?? 0, theme)} size={64} />
        </View>
        {today ? (
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            {today.consumedCalories} / {today.targetCalories} kcal · {today.mealsDone}/{today.mealsTotal} comidas
          </Text>
        ) : null}
      </StatCard>

      {/* Métricas de adherencia */}
      <View style={cd.grid2}>
        <MetricBox value={`${weekAvg}%`} label="Adherencia 7d" />
        <MetricBox value={`${nutritionMonthlyAvgPct}%`} label="Adherencia 30d" />
        <MetricBox value={`${nutritionStreakDays}d`} label="Racha" color={WARNING} />
      </View>

      {/* Heatmap adherencia 30d */}
      <StatCard>
        <CardHeader icon={Activity} title="Adherencia (30 días)" />
        <View style={styles.heatRow}>
          {heat.map((t) => (
            <View key={t.date} style={[styles.heatCell, { backgroundColor: adherenceColor(t.compliancePct, theme), opacity: t.mealsTotal > 0 ? 1 : 0.28 }]} />
          ))}
        </View>
      </StatCard>

      {/* Timeline ComposedChart */}
      {chartPoints.length >= 1 ? (
        <StatCard>
          <CardHeader icon={Flame} title="Calorías consumidas vs objetivo" />
          <BarComposed points={chartPoints} barColor={theme.primary} lineColor={theme.success} suffix=" kcal" />
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Barras = consumidas · Línea = objetivo.</Text>
        </StatCard>
      ) : null}

      {/* Day navigator + detalle */}
      <DayNutritionDetail
        timeline={nutritionTimeline}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        dayDetail={dayDetail}
        loading={dayLoading}
      />

      {/* Check-in context */}
      {recentWeights.length ? (
        <StatCard>
          <CardHeader icon={Scale} title="Contexto de check-ins" />
          {recentWeights.map((c) => (
            <View key={c.id} style={cd.row}>
              <Text style={[cd.rowTitle, { color: theme.foreground, fontFamily: FONT.uiSemibold }]}>{formatDate(c.date)}</Text>
              <Text style={[cd.rowMetric, { color: theme.primary, fontFamily: FONT.display }]}>{c.weight != null ? `${c.weight} kg` : '—'}</Text>
            </View>
          ))}
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Cruzá la adherencia con la evolución de peso para ajustar el plan.</Text>
        </StatCard>
      ) : null}

      {/* Favoritos */}
      {favoriteFoods.length ? (
        <StatCard>
          <CardHeader icon={Heart} title="Favoritos del alumno" color={theme.destructive} />
          <View style={styles.favWrap}>
            {favoriteFoods.slice(0, 12).map((f) => (
              <View key={f.id} style={[styles.favChip, { backgroundColor: theme.destructive + '18', borderColor: theme.destructive + '44', borderRadius: theme.radius.sm }]}>
                <Text numberOfLines={1} style={[styles.favTxt, { color: theme.destructive, fontFamily: FONT.uiBold }]}>{f.name}</Text>
              </View>
            ))}
          </View>
        </StatCard>
      ) : null}

      {/* Zona C · Alertas y contexto (coach) */}
      <CoachNutritionZoneC clientId={clientId} todayIso={todayIso} />
    </View>
  )
}

function DayNutritionDetail({ timeline, selectedDate, onSelectDate, dayDetail, loading }: {
  timeline: CoachClientDetailData['nutritionTimeline']
  selectedDate: string
  onSelectDate: (date: string) => void
  dayDetail: ClientDayDetail | null
  loading: boolean
}) {
  const { theme } = useTheme()
  const [openMeals, setOpenMeals] = useState<Set<number>>(() => new Set())
  const days = useMemo(() => [...timeline].map((t) => t.date).sort(), [timeline])
  const sidx = days.findIndex((d) => d === selectedDate)
  const go = (delta: 1 | -1) => {
    const ni = sidx + delta
    if (ni < 0 || ni >= days.length) return
    onSelectDate(days[ni]!)
  }

  const meals = dayDetail?.nutritionMeals ?? []
  const habits = dayDetail?.habits ?? null
  const done = meals.filter((m) => m.completed).length

  return (
    <View style={{ gap: 12 }}>
      <StatCard>
        <CardHeader icon={Apple} title="Día seleccionado" />
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => go(-1)} disabled={sidx <= 0} hitSlop={8}><ChevronLeft size={22} color={sidx <= 0 ? theme.muted : theme.foreground} /></TouchableOpacity>
          <Text style={[styles.navDate, { color: theme.foreground, fontFamily: FONT.display }]}>{formatDate(selectedDate)}</Text>
          <TouchableOpacity onPress={() => go(1)} disabled={sidx >= days.length - 1} hitSlop={8}><ChevronRight size={22} color={sidx >= days.length - 1 ? theme.muted : theme.foreground} /></TouchableOpacity>
        </View>
        {loading ? (
          <View style={{ paddingVertical: 20 }}><EvaLoader size="sm" subtitle="Cargando día…" /></View>
        ) : meals.length ? (
          <>
            <ProgressBar value={done / meals.length} color={done / meals.length >= 0.8 ? theme.success : WARNING} height={7} />
            {meals.map((meal, i) => {
              const isOpen = openMeals.has(i)
              const hasFoods = meal.foods.length > 0
              return (
                <View key={`${meal.name}-${i}`}>
                  <TouchableOpacity activeOpacity={hasFoods ? 0.7 : 1} onPress={() => { if (!hasFoods) return; setOpenMeals((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n }) }} style={styles.mealRow}>
                    <Check size={14} color={meal.completed ? theme.success : theme.mutedForeground} />
                    <Text numberOfLines={1} style={[cd.rowTitle, { color: meal.completed ? theme.foreground : theme.mutedForeground, fontFamily: FONT.uiSemibold, flex: 1 }]}>{meal.name}</Text>
                    {hasFoods ? <Text style={[styles.mealCount, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{meal.foods.length} alim.</Text> : null}
                    {hasFoods ? <ChevronRight size={14} color={theme.mutedForeground} style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }} /> : null}
                  </TouchableOpacity>
                  {isOpen && hasFoods ? (
                    <View style={styles.foodList}>
                      {meal.foods.map((f, fi) => (
                        <Text key={fi} numberOfLines={1} style={[styles.foodItem, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                          • {f.name}{f.quantity != null ? ` — ${f.quantity}${f.unit ? ` ${f.unit}` : ''}` : ''}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              )
            })}
          </>
        ) : (
          <Text style={[cd.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin registro nutricional este día.</Text>
        )}
      </StatCard>

      {habits ? (
        <StatCard>
          <CardHeader icon={Flame} title="Hábitos del día" />
          <View style={styles.habitGrid}>
            <Habit icon={Droplets} label="Agua" value={habits.water_ml != null ? `${habits.water_ml} ml` : '—'} />
            <Habit icon={Footprints} label="Pasos" value={habits.steps != null ? habits.steps.toLocaleString('es-CL') : '—'} />
            <Habit icon={Moon} label="Sueño" value={habits.sleep_hours != null ? `${habits.sleep_hours}h` : '—'} />
            <Habit icon={Activity} label="Ayuno" value={habits.fasting_hours != null ? `${habits.fasting_hours}h` : '—'} />
          </View>
        </StatCard>
      ) : null}
    </View>
  )
}

function Habit({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  const { theme } = useTheme()
  return (
    <View style={[styles.habit, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <Icon size={15} color={theme.primary} />
      <Text style={[styles.habitVal, { color: theme.foreground, fontFamily: FONT.display }]}>{value}</Text>
      <Text style={[styles.habitLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
    </View>
  )
}

// ── Zona C · Alertas y contexto (coach) ──────────────────────────────────────
// Espejo de NutritionTabB5 zona C: override de "Funciones", hilo de comentarios del día,
// editor de umbrales de micros y nota privada. Carga su propio contexto (getCoachNutritionZoneC).
function CoachNutritionZoneC({ clientId, todayIso }: { clientId: string; todayIso: string }) {
  const { theme } = useTheme()
  const [zc, setZc] = useState<NutritionZoneCData | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      setZc(await getCoachNutritionZoneC(clientId, todayIso))
    } catch (e) {
      console.warn('[nutrition-zone-c] load failed', e)
    } finally {
      setLoading(false)
    }
  }, [clientId, todayIso])
  useEffect(() => { reload() }, [reload])

  if (loading) return <View style={{ paddingVertical: 16 }}><EvaLoader size="sm" subtitle="Cargando zona coach…" /></View>
  if (!zc) return null

  const showSection = (k: NutritionSectionKey): boolean => (zc.prefsEnabled ? zc.effective[k] === true : true)
  const showMicros = showSection('micros_base') || showSection('micros_advanced')

  return (
    <View style={{ gap: 14 }}>
      <ZoneHeader letter="C" title="Alertas y contexto" subtitle="Señales del coach y funciones del alumno" />
      <FeaturePrefsOverridePanel zc={zc} clientId={clientId} onSaved={reload} />
      {showSection('notes') ? <MealCommentsThread comments={zc.mealComments} clientId={clientId} logDate={todayIso} onPosted={reload} /> : null}
      {showMicros ? <NutrientTargetsEditor targets={zc.nutrientTargets} proEnabled={zc.proEnabled} clientId={clientId} onSaved={reload} /> : null}
      <PrivateNotePanel notes={zc.privateNotes} clientId={clientId} onSaved={reload} />
    </View>
  )
}

function ZoneHeader({ letter, title, subtitle }: { letter: string; title: string; subtitle: string }) {
  const { theme } = useTheme()
  return (
    <View style={styles.zoneHeader}>
      <View style={[styles.zoneBadge, { backgroundColor: theme.primary + '1A', borderColor: theme.primary + '55' }]}>
        <Text style={[styles.zoneBadgeTxt, { color: theme.primary, fontFamily: FONT.displayBlack }]}>{letter}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.zoneTitle, { color: theme.foreground, fontFamily: FONT.display }]}>{title}</Text>
        <Text style={[styles.zoneSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{subtitle}</Text>
      </View>
    </View>
  )
}

// Hilo bidireccional coach ⇄ alumno del día (nutrition_meal_comments).
function MealCommentsThread({ comments, clientId, logDate, onPosted }: { comments: CoachMealCommentEntry[]; clientId: string; logDate: string; onPosted: () => void }) {
  const { theme } = useTheme()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  async function send() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    const r = await addCoachMealComment(clientId, logDate, body)
    setSending(false)
    if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo enviar el comentario.'); return }
    setText('')
    onPosted()
  }
  return (
    <StatCard>
      <CardHeader icon={MessageSquare} title="Conversación de nutrición · hoy" />
      {comments.length ? (
        <View style={{ gap: 8 }}>
          {comments.map((c) => {
            const mine = c.authorRole === 'coach'
            return (
              <View key={c.id} style={[styles.bubble, { alignSelf: mine ? 'flex-end' : 'flex-start', backgroundColor: mine ? theme.primary + '18' : theme.secondary, borderColor: mine ? theme.primary + '44' : theme.border, borderRadius: theme.radius.lg }]}>
                <Text style={[styles.bubbleRole, { color: mine ? theme.primary : theme.mutedForeground, fontFamily: FONT.uiBold }]}>{mine ? 'Tú' : 'Alumno'}</Text>
                <Text style={[styles.bubbleTxt, { color: theme.foreground, fontFamily: theme.fontSans }]}>{c.body}</Text>
              </View>
            )
          })}
        </View>
      ) : (
        <Text style={[cd.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin comentarios del alumno hoy. Puedes escribirle una nota.</Text>
      )}
      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder="Escribe un mensaje…"
          placeholderTextColor={theme.mutedForeground}
          style={[styles.composerInput, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.lg, fontFamily: theme.fontSans }]}
        />
        <TouchableOpacity onPress={send} disabled={sending || !text.trim()} style={[styles.sendBtn, { backgroundColor: theme.primary, borderRadius: theme.radius.lg, opacity: sending || !text.trim() ? 0.5 : 1 }]}>
          <Send size={16} color={theme.primaryForeground} />
        </TouchableOpacity>
      </View>
    </StatCard>
  )
}

// Editor de umbrales de micros (nutrient_targets). Catálogo 1:1 con CoachNutrientTargetsEditor web.
type NutrientDef = { key: string; label: string; unit: string; intent: 'aimup' | 'cap'; fields: ('floor' | 'target' | 'ceiling')[]; hint: string }
const BASE_NUTRIENTS: NutrientDef[] = [
  { key: 'sodium_mg', label: 'Sodio', unit: 'mg', intent: 'cap', fields: ['target', 'ceiling'], hint: 'Tope diario sugerido ~2300 mg. Define el techo a no superar.' },
  { key: 'fiber_g', label: 'Fibra', unit: 'g', intent: 'aimup', fields: ['floor', 'target'], hint: 'Meta diaria sugerida 25–30 g. Define el piso/meta a alcanzar.' },
]
const PRO_NUTRIENTS: NutrientDef[] = [
  { key: 'sugar_g', label: 'Azúcar', unit: 'g', intent: 'cap', fields: ['target', 'ceiling'], hint: 'Tope diario sugerido < 50 g (añadidos). Define el techo a no superar.' },
  { key: 'saturated_fat_g', label: 'Grasa saturada', unit: 'g', intent: 'cap', fields: ['target', 'ceiling'], hint: 'Tope diario sugerido < 10% de las kcal.' },
  { key: 'unsaturated_fat_g', label: 'Grasa insaturada', unit: 'g', intent: 'aimup', fields: ['floor', 'target'], hint: 'Prioriza grasas insaturadas (mono/poli).' },
]

function NutrientTargetsEditor({ targets, proEnabled, clientId, onSaved }: { targets: CoachNutrientTargetEntry[]; proEnabled: boolean; clientId: string; onSaved: () => void }) {
  const { theme } = useTheme()
  const nutrients = proEnabled ? [...BASE_NUTRIENTS, ...PRO_NUTRIENTS] : BASE_NUTRIENTS
  // Prioriza la fila específica del alumno sobre el default del coach (client_id null).
  const byKey = useMemo(() => {
    const m = new Map<string, CoachNutrientTargetEntry>()
    for (const t of targets) {
      const ex = m.get(t.nutrient_key)
      if (!ex || (t.client_id === clientId && ex.client_id !== clientId)) m.set(t.nutrient_key, t)
    }
    return m
  }, [targets, clientId])
  return (
    <StatCard>
      <CardHeader icon={SlidersHorizontal} title="Umbrales de micronutrientes" />
      <View style={{ gap: 12 }}>
        {nutrients.map((n) => <NutrientRow key={n.key} def={n} initial={byKey.get(n.key)} clientId={clientId} onSaved={onSaved} />)}
      </View>
      {!proEnabled ? <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Nutrición Pro desbloquea umbrales para más micros (azúcar, grasas).</Text> : null}
    </StatCard>
  )
}

function NutrientRow({ def, initial, clientId, onSaved }: { def: NutrientDef; initial?: CoachNutrientTargetEntry; clientId: string; onSaved: () => void }) {
  const { theme } = useTheme()
  const [floor, setFloor] = useState(initial?.floor_value != null ? String(initial.floor_value) : '')
  const [target, setTarget] = useState(initial?.target_value != null ? String(initial.target_value) : '')
  const [ceiling, setCeiling] = useState(initial?.ceiling_value != null ? String(initial.ceiling_value) : '')
  const [saving, setSaving] = useState(false)
  const parse = (s: string): number | null => { const t = s.trim(); if (!t) return null; const n = Number(t); return Number.isFinite(n) && n >= 0 ? n : null }
  async function save() {
    setSaving(true)
    const r = await upsertCoachNutrientTarget({
      clientId,
      nutrientKey: def.key,
      intent: def.intent,
      floorValue: def.fields.includes('floor') ? parse(floor) : null,
      targetValue: def.fields.includes('target') ? parse(target) : null,
      ceilingValue: def.fields.includes('ceiling') ? parse(ceiling) : null,
    })
    setSaving(false)
    if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo guardar el umbral.'); return }
    onSaved()
  }
  const capTone = def.intent === 'cap'
  const fieldsUI: { key: 'floor' | 'target' | 'ceiling'; label: string; value: string; set: (s: string) => void }[] = [
    { key: 'floor', label: 'Piso', value: floor, set: setFloor },
    { key: 'target', label: 'Meta', value: target, set: setTarget },
    { key: 'ceiling', label: 'Techo', value: ceiling, set: setCeiling },
  ]
  return (
    <View style={[styles.nutrientRow, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.lg }]}>
      <View style={styles.nutrientHead}>
        <Text style={[styles.nutrientLabel, { color: theme.foreground, fontFamily: FONT.uiBold }]}>{def.label}</Text>
        <View style={[styles.intentPill, { backgroundColor: (capTone ? WARNING : theme.success) + '22' }]}>
          <Text style={[styles.intentTxt, { color: capTone ? WARNING : theme.success, fontFamily: FONT.uiBold }]}>{capTone ? 'Tope' : 'Meta'}</Text>
        </View>
      </View>
      <Text style={[styles.nutrientHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{def.hint}</Text>
      <View style={styles.nutrientFields}>
        {fieldsUI.map((f) => {
          const enabled = def.fields.includes(f.key)
          return (
            <View key={f.key} style={[styles.nutrientField, { opacity: enabled ? 1 : 0.4 }]}>
              <Text style={[styles.nutrientFieldLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>{f.label}</Text>
              <TextInput
                value={f.value}
                onChangeText={f.set}
                editable={enabled && !saving}
                keyboardType="decimal-pad"
                placeholder={enabled ? def.unit : '—'}
                placeholderTextColor={theme.mutedForeground}
                style={[styles.nutrientInput, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.card, borderRadius: theme.radius.md, fontFamily: theme.fontSans }]}
              />
            </View>
          )
        })}
      </View>
      <Button label={saving ? 'Guardando…' : 'Guardar'} variant="outline" leftIcon={Save} onPress={save} disabled={saving} full />
    </View>
  )
}

// Nota privada del coach (nutrition_private_notes) — el alumno nunca la ve.
function PrivateNotePanel({ notes, clientId, onSaved }: { notes: CoachPrivateNoteEntry[]; clientId: string; onSaved: () => void }) {
  const { theme } = useTheme()
  const latest = notes[0] ?? null
  const [body, setBody] = useState(latest?.body ?? '')
  const [saving, setSaving] = useState(false)
  async function save() {
    const trimmed = body.trim()
    if (!trimmed) { Alert.alert('Nota vacía', 'La nota no puede estar vacía.'); return }
    setSaving(true)
    const r = await upsertCoachPrivateNote(clientId, trimmed)
    setSaving(false)
    if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo guardar la nota.'); return }
    onSaved()
  }
  const older = notes.slice(1)
  return (
    <StatCard>
      <CardHeader icon={Lock} title="Nota privada" color={WARNING} />
      <View style={[styles.privateBadge, { backgroundColor: WARNING + '22' }]}>
        <Text style={[styles.privateBadgeTxt, { color: WARNING, fontFamily: FONT.uiBold }]}>Privada — el alumno no la ve</Text>
      </View>
      <TextInput
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={5000}
        placeholder="Observaciones internas: adherencia, ajustes pendientes, contexto del alumno…"
        placeholderTextColor={theme.mutedForeground}
        style={[styles.noteInput, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.lg, fontFamily: theme.fontSans }]}
      />
      <View style={styles.noteFooter}>
        <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{body.length}/5000</Text>
        <Button label={saving ? 'Guardando…' : 'Guardar nota'} leftIcon={Save} onPress={save} disabled={saving || !body.trim()} />
      </View>
      {older.length ? (
        <View style={{ gap: 6, marginTop: 4 }}>
          <Text style={[cd.listHeading, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>Notas anteriores</Text>
          {older.map((n) => {
            const dateIso = (n.updated_at ?? n.created_at)
            return (
              <View key={n.id} style={[styles.oldNote, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.md }]}>
                <Text style={[styles.oldNoteTxt, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{n.body}</Text>
                {dateIso ? <Text style={[styles.oldNoteDate, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>{formatDate(dateIso.slice(0, 10))}</Text> : null}
              </View>
            )
          })}
        </View>
      ) : null}
    </StatCard>
  )
}

// Override por-alumno de la zona "Funciones" (client_feature_prefs). Tri-state heredar/mostrar/ocultar.
function FeaturePrefsOverridePanel({ zc, clientId, onSaved }: { zc: NutritionZoneCData; clientId: string; onSaved: () => void }) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<SectionPrefs>(zc.override)
  const [saved, setSaved] = useState<SectionPrefs>(zc.override)
  const [saving, setSaving] = useState(false)

  const toggleable = useMemo(() => NUTRITION_SECTIONS.filter((s) => !s.core), [])
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const overrideCount = Object.keys(draft).length

  // Setea (o auto-hereda si matchea el valor heredado) una key del borrador.
  function setKey(key: string, value: boolean, inherited: boolean) {
    setDraft((d) => {
      const next = { ...d }
      if (value === inherited) delete next[key]
      else next[key] = value
      return next
    })
  }
  async function save() {
    setSaving(true)
    const r = await setClientNutritionOverride(clientId, draft)
    setSaving(false)
    if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo guardar.'); return }
    setSaved(draft)
    onSaved()
  }
  const domainEnabledEff = draft[DOMAIN_ENABLED_KEY] ?? zc.domainEnabledBase
  const baseLabel = zc.useTeamBase ? 'del equipo' : 'tuyo (coach)'

  return (
    <StatCard>
      <TouchableOpacity onPress={() => setOpen((o) => !o)} activeOpacity={0.8} style={styles.prefsHead}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <View style={styles.prefsTitleRow}>
            <SlidersHorizontal size={15} color={WARNING} />
            <Text style={[styles.prefsTitle, { color: WARNING, fontFamily: FONT.uiBold }]}>Funciones para este alumno{overrideCount ? ` · ${overrideCount}` : ''}</Text>
          </View>
          <Text style={[styles.prefsSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sobrescribe el default {baseLabel} solo para este alumno</Text>
        </View>
        <ChevronDown size={18} color={theme.mutedForeground} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </TouchableOpacity>
      {open ? (
        <View style={{ gap: 10, marginTop: 6 }}>
          <PrefRow
            label="Mostrar Nutrición"
            hint="Apaga toda la nutrición de este alumno. No borra su historial."
            checked={domainEnabledEff}
            onChange={(v) => setKey(DOMAIN_ENABLED_KEY, v, zc.domainEnabledBase)}
            disabled={saving}
          />
          {toggleable.map((s) => {
            const entitled = s.requiresModule ? zc.entitledByModule[s.requiresModule] === true : true
            const locked = s.requiresModule !== null && !entitled
            const inherited = zc.baseEffective[s.key] === true
            const checked = (draft[s.key] ?? inherited) === true
            if (locked) {
              return (
                <View key={s.key} style={[styles.prefRow, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.lg }]}>
                  <Text style={[styles.prefLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans, flex: 1 }]}>{s.label}</Text>
                  <View style={styles.prefLock}><Lock size={12} color={theme.primary} /><Text style={[styles.prefLockTxt, { color: theme.primary, fontFamily: FONT.uiBold }]}>Pro</Text></View>
                </View>
              )
            }
            return (
              <View key={s.key} style={[styles.prefRow, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.lg }]}>
                <Text style={[styles.prefLabel, { color: theme.foreground, fontFamily: theme.fontSans, flex: 1 }]}>{s.label}{draft[s.key] !== undefined ? ' •' : ''}</Text>
                <Switch value={checked} onValueChange={(v) => setKey(s.key, v, inherited)} disabled={saving} />
              </View>
            )
          })}
          <View style={styles.prefsFooter}>
            <Button label="Restaurar heredado" variant="ghost" leftIcon={RotateCcw} onPress={() => setDraft({})} disabled={saving || overrideCount === 0} />
            <Button label={saving ? 'Guardando…' : 'Guardar'} leftIcon={Save} onPress={save} disabled={saving || !dirty} />
          </View>
        </View>
      ) : null}
    </StatCard>
  )
}

function PrefRow({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { theme } = useTheme()
  return (
    <View style={[styles.prefRow, { borderColor: theme.border, backgroundColor: theme.card, borderRadius: theme.radius.lg }]}>
      <View style={{ flex: 1, gap: 2, paddingRight: 10 }}>
        <Text style={[styles.prefLabel, { color: theme.foreground, fontFamily: FONT.uiSemibold }]}>{label}</Text>
        <Text style={[styles.prefHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{hint}</Text>
      </View>
      <Switch value={checked} onValueChange={onChange} disabled={disabled} />
    </View>
  )
}

const styles = StyleSheet.create({
  alert: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
  alertTitle: { fontSize: 13 },
  alertDesc: { fontSize: 12, lineHeight: 17 },
  macroRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  ringRow: { flexDirection: 'row', justifyContent: 'space-around', gap: 8, paddingTop: 4 },
  heatRow: { flexDirection: 'row', gap: 2, flexWrap: 'wrap' },
  heatCell: { width: 16, height: 16, borderRadius: 4 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navDate: { fontSize: 14, textTransform: 'capitalize' },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  mealCount: { fontSize: 11 },
  foodList: { paddingLeft: 22, paddingBottom: 6, gap: 3 },
  foodItem: { fontSize: 12, lineHeight: 17 },
  habitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  habit: { width: '47%', flexGrow: 1, borderWidth: 1, padding: 10, gap: 3 },
  habitVal: { fontSize: 14 },
  habitLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  favWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  favChip: { maxWidth: '48%', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  favTxt: { fontSize: 11 },
  // Zona C
  zoneHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6 },
  zoneBadge: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  zoneBadgeTxt: { fontSize: 17 },
  zoneTitle: { fontSize: 16, letterSpacing: -0.2 },
  zoneSub: { fontSize: 12, lineHeight: 16 },
  bubble: { maxWidth: '86%', borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8, gap: 2 },
  bubbleRole: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  bubbleTxt: { fontSize: 13, lineHeight: 18 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  composerInput: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  sendBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  nutrientRow: { borderWidth: 1, padding: 12, gap: 8 },
  nutrientHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nutrientLabel: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6 },
  intentPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  intentTxt: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.6 },
  nutrientHint: { fontSize: 11, lineHeight: 15 },
  nutrientFields: { flexDirection: 'row', gap: 8 },
  nutrientField: { flex: 1, gap: 4 },
  nutrientFieldLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.6 },
  nutrientInput: { height: 44, borderWidth: 1, paddingHorizontal: 10, fontSize: 14, textAlign: 'center' },
  privateBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  privateBadgeTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  noteInput: { minHeight: 96, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, textAlignVertical: 'top' },
  noteFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  oldNote: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, gap: 3 },
  oldNoteTxt: { fontSize: 12, lineHeight: 17 },
  oldNoteDate: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.6 },
  prefsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  prefsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prefsTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.7 },
  prefsSub: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  prefLabel: { fontSize: 13 },
  prefHint: { fontSize: 10, lineHeight: 14 },
  prefLock: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  prefLockTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  prefsFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 2 },
})
