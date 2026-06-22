import { useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { Activity, Apple, Calendar, ChevronLeft, ChevronRight, Check, Droplets, Flame, Footprints, Heart, History, Lock, MessageCircle, Moon, Pencil, Scale, Send } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, EmptyState, ComplianceRing, ProgressBar } from '../../../components'
import { EvaLoader } from '../../../components/EvaLoader'
import { BarComposed, type BarComposedPoint } from '../charts/BarComposed'
import { StatCard, CardHeader, MetricBox, cd, formatDate, adherenceColor } from './shared'
import { deriveNutritionCoachAlerts, type NutritionCoachAlert } from '../../../lib/nutrition-coach-alerts'
import { getTodayInSantiago } from '../../../lib/date-utils'
import { getCoachProfile } from '../../../lib/coach'
import { hasModule } from '../../../lib/entitlements'
import {
  addCoachMealComment,
  getClientNutrientTargets,
  getCoachPrivateNotes,
  getNutritionPlanCycles,
  listCoachMealComments,
  upsertCoachPrivateNote,
  type MealCommentRow,
  type NutrientTargetRow,
  type NutritionCycleRow,
  type PrivateNoteRow,
} from '../../../lib/coach-nutrition-notes'
import { CoachNutrientTargetsEditor } from './CoachNutrientTargetsEditor'
import { ClientFoodRestrictionsCard } from './ClientFoodRestrictionsCard'
import { ClientFeaturePrefsPanel } from './ClientFeaturePrefsPanel'
import {
  getNutritionPrefs,
  resolveClientNutritionSections,
  type ClientNutritionSectionFlags,
} from '../../../lib/feature-prefs'
import { getClientFeaturePrefsOverride } from '../../../lib/coach-client-extras'
import { getAppConfig } from '../../../lib/app-config'
import type { ClientDayDetail, CoachClientDetailData } from '../../../lib/coach-client-detail'

const ALERT_COLORS: Record<NutritionCoachAlert['variant'], string> = { danger: '#EF4444', warning: '#F59E0B', info: '#3B82F6' }

// Encabezado de zona (espejo del ZoneHeader del web): badge cuadrado A/B/C + título + subtítulo.
function ZoneHeader({ letter, title, subtitle }: { letter: string; title: string; subtitle?: string }) {
  const { theme } = useTheme()
  return (
    <View style={styles.zoneHeader}>
      <View style={[styles.zoneBadge, { backgroundColor: theme.primary + '1A', borderRadius: theme.radius.md }]}>
        <Text style={[styles.zoneBadgeTxt, { color: theme.primary, fontFamily: 'Montserrat_800ExtraBold' }]}>{letter}</Text>
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={[styles.zoneTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.zoneSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{subtitle}</Text>
        ) : null}
      </View>
    </View>
  )
}

// Anillo de proporción de macro (% kcal) — espejo del MacroShareRing del web.
// El anillo muestra la cuota de kcal; el centro muestra los gramos (como en web).
function MacroShareRing({ label, grams, kcalSharePct, color, unit = 'g' }: { label: string; grams: number; kcalSharePct: number; color: string; unit?: string }) {
  const { theme } = useTheme()
  const pct = Math.min(100, Math.max(0, Math.round(kcalSharePct)))
  const size = 64
  const stroke = 7
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  return (
    <View style={styles.shareRing}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={color + '22'} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct / 100)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={[styles.shareCenter, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
            {grams}{unit === 'g' ? 'g' : ''}
          </Text>
        </View>
      </View>
      <Text style={[styles.shareLabel, { color: '#9CA3AF', fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.sharePct, { color: '#9CA3AF', fontFamily: 'Inter_700Bold' }]}>{pct}% kcal</Text>
    </View>
  )
}

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
  const clientId = data.client?.id ?? null

  // Flag `featurePrefsEnabled` (Edge Config en web, server-only) leido via `GET /api/mobile/config`.
  // fail-OPEN: default `false` hasta resolver => mostrar TODO (comportamiento de hoy). Cuando es
  // `true`, se aplica el gating de Zona C. Espejo del contrato fail-OPEN de feature-prefs.service.ts.
  const [featurePrefsEnabled, setFeaturePrefsEnabled] = useState(false)
  useEffect(() => {
    let cancelled = false
    getAppConfig()
      .then((cfg) => { if (!cancelled) setFeaturePrefsEnabled(cfg.featurePrefsEnabled) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Feature-prefs por-alumno (espejo web): visible = ENTITLED (billing) AND ENABLED (pref
  // coach/alumno). Gobierna que superficies de la Zona C (hilo, micros, restricciones, habitos)
  // se muestran. `null` mientras carga / flag OFF / sin clientId => no gatear (mostrar todo, como hoy).
  const [sectionFlags, setSectionFlags] = useState<ClientNutritionSectionFlags | null>(null)
  useEffect(() => {
    if (!featurePrefsEnabled || !clientId) { setSectionFlags(null); return }
    let cancelled = false
    Promise.all([getNutritionPrefs(), getClientFeaturePrefsOverride(clientId)])
      .then(([prefs, override]) => {
        if (!cancelled) setSectionFlags(resolveClientNutritionSections(prefs, override))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [clientId, featurePrefsEnabled])

  // Helpers de visibilidad: `null` (sin resolver / sin clientId) => mostrar (comportamiento de hoy).
  const showSection = (key: string): boolean => (sectionFlags ? sectionFlags.sections[key] === true : true)
  const showHabits = showSection('habits')

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
  const prevWeekAvg = compliance?.nutritionPrevWeeklyAvgPct ?? 0
  const weekDelta = weekAvg - prevWeekAvg
  const weekTrend = weekDelta > 1 ? '↑ mejora' : weekDelta < -1 ? '↓ baja' : '→ estable'
  const weekTrendColor = weekDelta > 1 ? theme.success : weekDelta < -1 ? theme.destructive : theme.mutedForeground

  // Cuota de kcal por macro (espejo del MacroShareRing del web).
  const kcal = Number(activeNutrition.daily_calories ?? 0)
  const prot = Number(activeNutrition.protein_g ?? 0)
  const carb = Number(activeNutrition.carbs_g ?? 0)
  const fat = Number(activeNutrition.fats_g ?? 0)
  const pCal = prot * 4
  const cCal = carb * 4
  const fCal = fat * 9
  const macroKcalTotal = pCal + cCal + fCal || 1

  const recentWeights = checkIns.slice(0, 5)

  return (
    <View style={{ gap: 16 }}>
      {/* ── ZONA A · Progreso ── */}
      <ZoneHeader letter="A" title="Progreso" subtitle="Hoy (Santiago) · adherencia 30 días" />

      {/* Hoy (Santiago): energía + comidas */}
      <StatCard>
        <Text style={[styles.zoneSubhead, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>Hoy (Santiago)</Text>
        <View style={styles.ringRow}>
          <ComplianceRing value={kcalPct} label="kcal" color={theme.primary} size={64} />
          <ComplianceRing value={todayCompliance} label="Comidas" color={adherenceColor(today?.compliancePct ?? 0, theme)} size={64} />
        </View>
        {today ? (
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            {today.consumedCalories} / {today.targetCalories} kcal · {today.mealsDone}/{today.mealsTotal} comidas
          </Text>
        ) : (
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            No ha registrado comidas hoy (sin log diario).
          </Text>
        )}
      </StatCard>

      {/* Métricas de adherencia (labels verbatim del web) */}
      <View style={cd.grid2}>
        <MetricBox value={`${nutritionMonthlyAvgPct}%`} label="Promedio mensual" />
        <MetricBox value={`${nutritionStreakDays} días`} label="Racha (≥80%)" color="#F59E0B" />
        <MetricBox value={`${weekAvg}% vs ${prevWeekAvg}%`} label="Semana vs anterior" sub={weekTrend} subColor={weekTrendColor} />
      </View>

      {/* Heatmap adherencia 30d */}
      <StatCard>
        <CardHeader icon={Activity} title="Adherencia · 30 días" />
        <View style={styles.heatRow}>
          {heat.map((t) => (
            <View key={t.date} style={[styles.heatCell, { backgroundColor: adherenceColor(t.compliancePct, theme), opacity: t.mealsTotal > 0 ? 1 : 0.28 }]} />
          ))}
        </View>
        <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Color según % de comidas del plan completadas ese día.</Text>
      </StatCard>

      {/* Timeline ComposedChart */}
      {chartPoints.length >= 1 ? (
        <StatCard>
          <CardHeader icon={Flame} title="Últimos 7 días · kcal consumidas vs meta del log" />
          <BarComposed points={chartPoints} barColor={theme.primary} lineColor="#10B981" suffix=" kcal" />
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Barras = consumidas · Línea = objetivo.</Text>
        </StatCard>
      ) : null}

      {/* ── ZONA B · Plan y comidas ── */}
      <ZoneHeader letter="B" title="Plan y comidas" subtitle="Plan activo, edición y lista de comidas" />

      {/* Favoritos del alumno */}
      {favoriteFoods.length ? (
        <StatCard>
          <CardHeader icon={Heart} title="Alimentos favoritos del alumno" color="#F43F5E" />
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Marcados desde la app del alumno; se aplican a todos sus planes con esos alimentos del catálogo.
          </Text>
          <View style={styles.favWrap}>
            {favoriteFoods.slice(0, 12).map((f) => (
              <View key={f.id} style={[styles.favChip, { backgroundColor: '#F43F5E18', borderColor: '#F43F5E44', borderRadius: theme.radius.sm }]}>
                <Text numberOfLines={1} style={[styles.favTxt, { color: '#F43F5E', fontFamily: 'Inter_700Bold' }]}>{f.name}</Text>
              </View>
            ))}
          </View>
        </StatCard>
      ) : null}

      {/* Card de plan activo (rica): título Apple + badge SYNCED, kcal/día, macro share rings */}
      <StatCard>
        <CardHeader
          icon={Apple}
          title={`Plan activo · ${activeNutrition.name}`}
          right={
            onEditNutrition ? <TouchableOpacity onPress={onEditNutrition} hitSlop={8}><Pencil size={16} color={theme.primary} /></TouchableOpacity> : undefined
          }
        />
        {kcal > 0 ? (
          <Text style={[styles.kcalBig, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
            {kcal} <Text style={[styles.kcalUnit, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>kcal / día</Text>
          </Text>
        ) : null}
        <View style={styles.shareRow}>
          <MacroShareRing label="Proteína" grams={Math.round(prot)} kcalSharePct={(pCal / macroKcalTotal) * 100} color="#EF4444" />
          <MacroShareRing label="Carbos" grams={Math.round(carb)} kcalSharePct={(cCal / macroKcalTotal) * 100} color="#F59E0B" />
          <MacroShareRing label="Grasas" grams={Math.round(fat)} kcalSharePct={(fCal / macroKcalTotal) * 100} color="#8B5CF6" />
          <View style={[styles.distBox, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
            <Flame size={18} color={theme.primary} />
            <Text style={[styles.distLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Distribución</Text>
            <Text style={[styles.distSub, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]} numberOfLines={2}>Meta (kcal macros)</Text>
          </View>
        </View>
        {onEditNutrition ? <Button label="Editar / asignar plan" variant="outline" leftIcon={Pencil} onPress={onEditNutrition} full /> : null}
      </StatCard>

      {/* Day navigator + detalle (lista de comidas + hábitos) */}
      <DayNutritionDetail
        timeline={nutritionTimeline}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        dayDetail={dayDetail}
        loading={dayLoading}
        showHabits={showHabits}
      />

      {/* ── ZONA C · Alertas y contexto ── */}
      <ZoneHeader letter="C" title="Alertas y contexto" subtitle="Señales del coach, check-ins y ciclos del plan" />

      {/* Alertas de coach */}
      {alerts.length ? (
        <View style={{ gap: 8 }}>
          {alerts.map((a) => (
            <View key={a.id} style={[styles.alert, { backgroundColor: ALERT_COLORS[a.variant] + '14', borderColor: ALERT_COLORS[a.variant] + '40' }]}>
              <Text style={[styles.alertTitle, { color: ALERT_COLORS[a.variant], fontFamily: 'Inter_700Bold' }]}>{a.title}</Text>
              <Text style={[styles.alertDesc, { color: theme.foreground, fontFamily: theme.fontSans }]}>{a.description}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Check-in y nutrición (peso × adherencia semanal) */}
      {recentWeights.length ? (
        <StatCard>
          <CardHeader icon={Scale} title="Check-in y nutrición" color="#0EA5E9" right={<Apple size={16} color="#10B981CC" />} />
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Cruzamos el peso declarado en check-in con la adherencia a comidas de esta semana (~{Math.round(weekAvg)}%). Los datos son autodeclarados por el alumno.
          </Text>
          {recentWeights.map((c) => (
            <View key={c.id} style={cd.row}>
              <Text style={[cd.rowTitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{formatDate(c.date)}</Text>
              <Text style={[cd.rowMetric, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{c.weight != null ? `${Number(c.weight).toFixed(1)} kg` : '—'}</Text>
            </View>
          ))}
        </StatCard>
      ) : (
        <StatCard>
          <CardHeader icon={Scale} title="Check-in y nutrición" color="#0EA5E9" right={<Apple size={16} color="#10B981CC" />} />
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Aún no hay check-ins con peso registrado.</Text>
        </StatCard>
      )}

      {/* Zona C · contexto del coach (hilo, nota privada, restricciones, micros, funciones, ciclos) */}
      {data.client ? <NutritionCoachZoneC clientId={data.client.id} todayIso={todayIso} sectionFlags={sectionFlags} /> : null}
    </View>
  )
}

// ── Zona C (coach): hilo + nota privada + restricciones + micros + funciones + ciclos ──
function NutritionCoachZoneC({ clientId, todayIso, sectionFlags }: { clientId: string; todayIso: string; sectionFlags: ClientNutritionSectionFlags | null }) {
  const [coachId, setCoachId] = useState<string | null>(null)
  const [comments, setComments] = useState<MealCommentRow[]>([])
  const [notes, setNotes] = useState<PrivateNoteRow[]>([])
  const [targets, setTargets] = useState<NutrientTargetRow[]>([])
  const [cycles, setCycles] = useState<NutritionCycleRow[]>([])
  const [proEnabled, setProEnabled] = useState(false)

  // Gating por seccion (espejo web): `null` (sin resolver) => mostrar (comportamiento de hoy).
  const showSection = (key: string): boolean => (sectionFlags ? sectionFlags.sections[key] === true : true)
  const domainEnabled = sectionFlags ? sectionFlags.domainEnabled : true
  // El hilo bidireccional cae bajo `notes` (la superficie de notas/comentarios del alumno).
  const showNotesThread = showSection('notes')
  // El editor de umbrales cae bajo micros_base (base) y se enriquece con micros_advanced (Pro).
  const showMicros = showSection('micros_base') || showSection('micros_advanced')
  // Restricciones: el web no la gatea por seccion, solo la oculta cuando el dominio esta OFF.
  const showRestrictions = domainEnabled

  async function reload() {
    const [c, n, t, cy] = await Promise.all([
      listCoachMealComments(clientId, todayIso),
      getCoachPrivateNotes(clientId),
      getClientNutrientTargets(clientId),
      getNutritionPlanCycles(clientId),
    ])
    setComments(c)
    setNotes(n)
    setTargets(t)
    setCycles(cy)
  }

  useEffect(() => {
    let cancelled = false
    getCoachProfile().then((p) => { if (!cancelled) setCoachId(p?.id ?? null) }).catch(() => {})
    hasModule('nutrition_exchanges').then((v) => { if (!cancelled) setProEnabled(v) }).catch(() => {})
    reload()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, todayIso])

  return (
    <View style={{ gap: 14 }}>
      {/* Hilo bidireccional: gateado por `notes` (la superficie de notas del alumno). */}
      {showNotesThread ? <NotesThread comments={comments} clientId={clientId} todayIso={todayIso} onSent={reload} /> : null}
      {/* Nota privada del coach — el alumno nunca la ve (feature E). No se gatea. */}
      <PrivateNotePanel notes={notes} coachId={coachId} clientId={clientId} onSaved={reload} />
      {/* Restricciones: visible salvo que el dominio Nutricion este apagado para el alumno. */}
      {showRestrictions ? <ClientFoodRestrictionsCard clientId={clientId} /> : null}
      {/* Umbrales de micros: gateado por micros_base/micros_advanced (espejo de lo que ve el alumno). */}
      {showMicros ? <CoachNutrientTargetsEditor clientId={clientId} initial={targets} proEnabled={proEnabled} onSaved={reload} /> : null}
      {/* Panel de override por-alumno: SIEMPRE visible (escape hatch para re-activar funciones). */}
      <ClientFeaturePrefsPanel clientId={clientId} />
      {cycles.length ? <CycleHistoryCard cycles={cycles} /> : null}
    </View>
  )
}

function NotesThread({ comments, clientId, todayIso, onSent }: { comments: MealCommentRow[]; clientId: string; todayIso: string; onSent: () => void }) {
  const { theme } = useTheme()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  async function send() {
    const trimmed = body.trim()
    if (!trimmed) return
    setSending(true)
    const r = await addCoachMealComment(clientId, todayIso, trimmed)
    setSending(false)
    if (r.ok) { setBody(''); onSent() }
  }

  return (
    <StatCard>
      <CardHeader icon={MessageCircle} title="Conversación de nutrición · hoy" />
      {comments.length ? (
        <View style={{ gap: 8 }}>
          {comments.map((c) => {
            const mine = c.author_role === 'coach'
            return (
              <View key={c.id} style={[styles.bubble, { alignSelf: mine ? 'flex-end' : 'flex-start', backgroundColor: mine ? theme.primary + '18' : theme.secondary, borderColor: mine ? theme.primary + '40' : theme.border, borderRadius: theme.radius.lg }]}>
                <Text style={[styles.bubbleRole, { color: mine ? theme.primary : theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{mine ? 'Coach' : 'Alumno'}</Text>
                <Text style={[styles.bubbleBody, { color: theme.foreground, fontFamily: theme.fontSans }]}>{c.body}</Text>
              </View>
            )
          })}
        </View>
      ) : (
        <Text style={[cd.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin comentarios del alumno hoy. Puedes escribirle una nota.</Text>
      )}
      <View style={styles.threadInputRow}>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Escribe una nota…"
          placeholderTextColor={theme.mutedForeground}
          multiline
          style={[styles.threadInput, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]}
        />
        <TouchableOpacity activeOpacity={0.85} onPress={send} disabled={sending || !body.trim()} style={[styles.sendBtn, { backgroundColor: theme.primary, opacity: sending || !body.trim() ? 0.5 : 1 }]}>
          <Send size={18} color={theme.primaryForeground} />
        </TouchableOpacity>
      </View>
    </StatCard>
  )
}

function PrivateNotePanel({ notes, coachId, clientId, onSaved }: { notes: PrivateNoteRow[]; coachId: string | null; clientId: string; onSaved: () => void }) {
  const { theme } = useTheme()
  const latest = notes[0] ?? null
  const [body, setBody] = useState(latest?.body ?? '')
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState(false)

  // Sincroniza el textarea con la nota cargada (solo si el coach no escribió aún).
  useEffect(() => { if (!touched) setBody(latest?.body ?? '') }, [latest?.body, touched])

  async function save() {
    if (!coachId) return
    setSaving(true)
    const r = await upsertCoachPrivateNote(coachId, clientId, body)
    setSaving(false)
    if (r.ok) { setTouched(false); onSaved() }
  }

  const olderNotes = notes.slice(1)

  return (
    <View style={[styles.privateCard, { backgroundColor: '#F59E0B0A', borderColor: '#F59E0B40', borderRadius: theme.radius.xl }]}>
      <View style={styles.privateHead}>
        <Lock size={14} color="#F59E0B" />
        <Text style={[styles.privateTitle, { color: '#F59E0B', fontFamily: 'Montserrat_700Bold' }]}>Nota privada</Text>
      </View>
      <View style={[styles.privateBadge, { backgroundColor: '#F59E0B18' }]}>
        <Text style={[styles.privateBadgeTxt, { color: '#F59E0B', fontFamily: 'Inter_700Bold' }]}>Privada — el alumno no la ve</Text>
      </View>
      <TextInput
        value={body}
        onChangeText={(t) => { setBody(t); setTouched(true) }}
        placeholder="Observaciones internas: adherencia, ajustes pendientes, contexto del alumno…"
        placeholderTextColor={theme.mutedForeground}
        multiline
        maxLength={5000}
        style={[styles.privateInput, { borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans }]}
      />
      <View style={styles.privateActions}>
        <Text style={[styles.privateCount, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{body.length}/5000</Text>
        <Button label={saving ? 'Guardando…' : 'Guardar nota'} onPress={save} disabled={saving || !body.trim() || !coachId} />
      </View>
      {latest?.updated_at ? (
        <Text style={[styles.privateMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Última actualización: {formatDate(latest.updated_at)}</Text>
      ) : null}
      {olderNotes.length ? (
        <View style={{ gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingTop: 10 }}>
          <Text style={[styles.privateOlderHead, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Notas anteriores</Text>
          {olderNotes.map((n) => (
            <View key={n.id} style={[styles.privateOlder, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
              <Text style={[styles.bubbleBody, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{n.body}</Text>
              <Text style={[styles.privateMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{formatDate(n.updated_at ?? n.created_at)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function CycleHistoryCard({ cycles }: { cycles: NutritionCycleRow[] }) {
  const { theme } = useTheme()
  return (
    <StatCard>
      <CardHeader icon={Calendar} title="Ciclo de dieta" />
      <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        Organiza el plan de tu alumno por fases semanales, cada una con su plantilla. El sistema calcula en qué fase va el alumno hoy.
      </Text>
      <View style={{ gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingTop: 10 }}>
        <View style={styles.cycleHistHead}>
          <History size={14} color={theme.mutedForeground} />
          <Text style={[styles.cycleHistTitle, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Historial del plan (autosave)</Text>
        </View>
        {cycles.map((c) => (
          <View key={c.id} style={cd.row}>
            <Text numberOfLines={1} style={[cd.rowTitle, { color: theme.foreground, fontFamily: 'Inter_600SemiBold', flex: 1 }]}>{c.label ?? 'Ciclo'}</Text>
            <Text style={[cd.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{formatDate(c.created_at)}</Text>
          </View>
        ))}
      </View>
    </StatCard>
  )
}

function DayNutritionDetail({ timeline, selectedDate, onSelectDate, dayDetail, loading, showHabits = true }: {
  timeline: CoachClientDetailData['nutritionTimeline']
  selectedDate: string
  onSelectDate: (date: string) => void
  dayDetail: ClientDayDetail | null
  loading: boolean
  /** Gating por feature-prefs: `false` oculta la card de habitos (espejo web `showSection('habits')`). */
  showHabits?: boolean
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
          <Text style={[styles.navDate, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{formatDate(selectedDate)}</Text>
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
                    <Text numberOfLines={1} style={[cd.rowTitle, { color: meal.completed ? theme.foreground : theme.mutedForeground, fontFamily: 'Inter_600SemiBold', flex: 1 }]}>{meal.name}</Text>
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

      {habits && showHabits ? (
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
      <Text style={[styles.habitVal, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{value}</Text>
      <Text style={[styles.habitLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  alert: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
  alertTitle: { fontSize: 13 },
  alertDesc: { fontSize: 12, lineHeight: 17 },
  zoneHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  zoneBadge: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  zoneBadgeTxt: { fontSize: 13 },
  zoneTitle: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.2 },
  zoneSub: { fontSize: 11, marginTop: 2 },
  zoneSubhead: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  shareRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-around' },
  shareRing: { alignItems: 'center', gap: 5, width: '21%', minWidth: 70 },
  shareCenter: { fontSize: 13, letterSpacing: -0.3 },
  shareLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' },
  sharePct: { fontSize: 10, letterSpacing: 0.2 },
  distBox: { width: '21%', minWidth: 70, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 10, paddingHorizontal: 4 },
  distLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' },
  distSub: { fontSize: 9.5, textAlign: 'center', lineHeight: 12 },
  kcalBig: { fontSize: 26, letterSpacing: -0.5 },
  kcalUnit: { fontSize: 13 },
  cycleHistHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cycleHistTitle: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.7 },
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
  bubble: { maxWidth: '85%', borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8, gap: 2 },
  bubbleRole: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6 },
  bubbleBody: { fontSize: 13, lineHeight: 18 },
  threadInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 2 },
  threadInput: { flex: 1, minHeight: 44, maxHeight: 110, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13.5 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  privateCard: { borderWidth: 1, padding: 16, gap: 10 },
  privateHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  privateTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  privateBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  privateBadgeTxt: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5 },
  privateInput: { minHeight: 96, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13.5, textAlignVertical: 'top' },
  privateActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  privateCount: { fontSize: 11 },
  privateMeta: { fontSize: 10.5 },
  privateOlderHead: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6 },
  privateOlder: { borderWidth: 1, padding: 10, gap: 4 },
})
