import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Activity, Apple, ChevronLeft, ChevronRight, Check, Droplets, Flame, Footprints, Heart, Moon, Pencil, Salad, Scale } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, EmptyState, ComplianceRing, ProgressBar, MacroPill } from '../../../components'
import { EvaLoader } from '../../../components/EvaLoader'
import { BarComposed, type BarComposedPoint } from '../charts/BarComposed'
import { StatCard, CardHeader, MetricBox, cd, formatDate, adherenceColor } from './shared'
import { deriveNutritionCoachAlerts, type NutritionCoachAlert } from '../../../lib/nutrition-coach-alerts'
import { getTodayInSantiago } from '../../../lib/date-utils'
import type { ClientDayDetail, CoachClientDetailData } from '../../../lib/coach-client-detail'

const ALERT_COLORS: Record<NutritionCoachAlert['variant'], string> = { danger: '#EF4444', warning: '#F59E0B', info: '#3B82F6' }

export function NutricionTab({
  data,
  selectedDate,
  onSelectDate,
  dayDetail,
  dayLoading,
  onEditNutrition,
}: {
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
          {alerts.map((a) => (
            <View key={a.id} style={[styles.alert, { backgroundColor: ALERT_COLORS[a.variant] + '14', borderColor: ALERT_COLORS[a.variant] + '40' }]}>
              <Text style={[styles.alertTitle, { color: ALERT_COLORS[a.variant], fontFamily: 'HankenGrotesk_700Bold' }]}>{a.title}</Text>
              <Text style={[styles.alertDesc, { color: theme.foreground, fontFamily: theme.fontSans }]}>{a.description}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Plan + macros */}
      <StatCard>
        <CardHeader icon={Salad} title="Plan activo" right={
          onEditNutrition ? <TouchableOpacity onPress={onEditNutrition} hitSlop={8}><Pencil size={16} color={theme.primary} /></TouchableOpacity> : undefined
        } />
        <Text numberOfLines={1} style={[cd.big, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>{activeNutrition.name}</Text>
        <View style={styles.macroRow}>
          {activeNutrition.daily_calories != null && <MacroPill label="kcal" value={activeNutrition.daily_calories} color={theme.primary} />}
          {activeNutrition.protein_g != null && <MacroPill label="P" value={activeNutrition.protein_g} color="#EF4444" />}
          {activeNutrition.carbs_g != null && <MacroPill label="C" value={activeNutrition.carbs_g} color="#F59E0B" />}
          {activeNutrition.fats_g != null && <MacroPill label="G" value={activeNutrition.fats_g} color="#8B5CF6" />}
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
        <MetricBox value={`${nutritionStreakDays}d`} label="Racha" color="#F59E0B" />
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
          <BarComposed points={chartPoints} barColor={theme.primary} lineColor="#10B981" suffix=" kcal" />
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
              <Text style={[cd.rowTitle, { color: theme.foreground, fontFamily: 'HankenGrotesk_600SemiBold' }]}>{formatDate(c.date)}</Text>
              <Text style={[cd.rowMetric, { color: theme.primary, fontFamily: 'Archivo_700Bold' }]}>{c.weight != null ? `${c.weight} kg` : '—'}</Text>
            </View>
          ))}
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Cruzá la adherencia con la evolución de peso para ajustar el plan.</Text>
        </StatCard>
      ) : null}

      {/* Favoritos */}
      {favoriteFoods.length ? (
        <StatCard>
          <CardHeader icon={Heart} title="Favoritos del alumno" color="#F43F5E" />
          <View style={styles.favWrap}>
            {favoriteFoods.slice(0, 12).map((f) => (
              <View key={f.id} style={[styles.favChip, { backgroundColor: '#F43F5E18', borderColor: '#F43F5E44', borderRadius: theme.radius.sm }]}>
                <Text numberOfLines={1} style={[styles.favTxt, { color: '#F43F5E', fontFamily: 'HankenGrotesk_700Bold' }]}>{f.name}</Text>
              </View>
            ))}
          </View>
        </StatCard>
      ) : null}
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
          <Text style={[styles.navDate, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>{formatDate(selectedDate)}</Text>
          <TouchableOpacity onPress={() => go(1)} disabled={sidx >= days.length - 1} hitSlop={8}><ChevronRight size={22} color={sidx >= days.length - 1 ? theme.muted : theme.foreground} /></TouchableOpacity>
        </View>
        {loading ? (
          <View style={{ paddingVertical: 20 }}><EvaLoader size="sm" subtitle="Cargando día…" /></View>
        ) : meals.length ? (
          <>
            <ProgressBar value={done / meals.length} color={done / meals.length >= 0.8 ? theme.success : '#F59E0B'} height={7} />
            {meals.map((meal, i) => {
              const isOpen = openMeals.has(i)
              const hasFoods = meal.foods.length > 0
              return (
                <View key={`${meal.name}-${i}`}>
                  <TouchableOpacity activeOpacity={hasFoods ? 0.7 : 1} onPress={() => { if (!hasFoods) return; setOpenMeals((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n }) }} style={styles.mealRow}>
                    <Check size={14} color={meal.completed ? theme.success : theme.mutedForeground} />
                    <Text numberOfLines={1} style={[cd.rowTitle, { color: meal.completed ? theme.foreground : theme.mutedForeground, fontFamily: 'HankenGrotesk_600SemiBold', flex: 1 }]}>{meal.name}</Text>
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
      <Text style={[styles.habitVal, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>{value}</Text>
      <Text style={[styles.habitLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
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
})
