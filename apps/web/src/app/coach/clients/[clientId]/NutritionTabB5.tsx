'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { eachDayOfInterval, format, parseISO, subDays } from 'date-fns'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
} from 'recharts'
import { Card } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Utensils,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Apple,
  Calendar,
  CheckCircle2,
  Clock,
  Pencil,
  ExternalLink,
  Copy,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Heart,
  Droplets,
  Footprints,
  Moon,
  Timer,
  MessageSquare,
} from 'lucide-react'
import { type DayAdherence } from '@/app/c/[coach_slug]/nutrition/_components/AdherenceStrip'
import { DayNavigator } from '@/app/c/[coach_slug]/nutrition/_components/DayNavigator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { getClientNutritionForDate, getClientNutritionActivityDates, getClientHabitsForDate } from './_actions/client-detail.actions'
import { calculateFoodItemMacros } from '@/lib/nutrition-utils'
import { mealConsumedPct, avgSatisfaction } from './profileDataHelpers'
import { duplicatePlanToClient, getCoachClientsLite } from '@/app/coach/nutrition-plans/_actions/nutrition-coach.actions'
import { deriveNutritionCoachAlerts } from '@/lib/nutrition-coach-alerts'
import { NutritionCoachAlertsPanel } from './NutritionCoachAlertsPanel'
import { NutritionCheckinContextCard, type NutritionCheckInLite } from './NutritionCheckinContextCard'
import {
  NutritionCycleHistorySection,
  type NutritionCycleRow,
  type NutritionHistoryEntryLite,
} from './NutritionCycleHistorySection'
import { NotesThread, type NotesThreadComment } from '@/components/nutrition/NotesThread'
import { CoachNutrientTargetsEditor } from './CoachNutrientTargetsEditor'
import { CoachPrivateNotesPanel } from './CoachPrivateNotesPanel'
import { ClientFoodRestrictionsCard } from './ClientFoodRestrictionsCard'
import { addCoachMealComment } from './_actions/nutrition-notes.actions'
import type { NutrientTargetRow } from '@/services/nutrient-targets.service'
import type { PrivateNoteRow, MealCommentRow } from '@/services/nutrition-notes.service'
import type { NutritionSectionKey } from '@eva/feature-prefs'
import type { ClientFeaturePrefsOverrideContext } from '@/services/feature-prefs.service'
import { ClientFeaturePrefsPanel } from '@/components/coach/ClientFeaturePrefsPanel'
import { MetricInfo } from '@/components/ui/metric-info'

export type NutritionTimelineRow = {
  date: string
  log_date: string
  plan_name: string
  target_calories: number
  target_protein: number
  target_carbs: number
  target_fats: number
  consumed_calories?: number
  consumed_protein?: number
  consumed_carbs?: number
  consumed_fats?: number
  mealsTotal: number
  mealsDone: number
  compliancePct: number
  mealLogs: unknown[]
}

type TodayMacros = {
  calories: number
  protein: number
  carbs: number
  fats: number
}

type NutritionTabB5Props = {
  clientId: string
  coachId: string
  coachSlug?: string
  santiagoTodayIso: string
  activeNutritionPlan: Record<string, unknown> | null | undefined
  nutritionTimeline: NutritionTimelineRow[]
  mealDetails: unknown[] | null | undefined
  adherence30d?: DayAdherence[]
  todayMacros?: TodayMacros
  hasTodayNutritionLog?: boolean
  nutritionMonthlyAvgPct?: number | null
  /** Adherencia 30d que cuenta TODOS los días (días sin registro = 0%). */
  nutritionAdherence30dAllDays?: number | null
  nutritionStreakDays?: number
  nutritionWeeklyAvgPct?: number
  nutritionPrevWeeklyAvgPct?: number
  /** Catalog foods the client marked as favorite (persisted). */
  clientFavoriteFoods?: { id: string; name: string }[]
  chartGridColor: string
  chartAxisColor: string
  tooltipBgColor: string
  tooltipBorderColor: string
  tooltipTextColor: string
  recentCheckIns?: NutritionCheckInLite[]
  nutritionPlanCycles?: NutritionCycleRow[]
  nutritionTemplatesLite?: { id: string; name: string }[]
  nutritionPlanHistoryEntries?: NutritionHistoryEntryLite[]
  /** Zona C (coach): umbrales de micros del alumno (+ defaults del coach). */
  coachNutrientTargets?: NutrientTargetRow[]
  /** Zona C (coach): notas privadas del coach sobre el alumno. */
  coachPrivateNotes?: PrivateNoteRow[]
  /** Zona C (coach): hilo bidireccional de comentarios del día de hoy. */
  coachMealComments?: MealCommentRow[]
  /** "Nutrición Pro" (nutrition_exchanges) ON ⇒ umbrales de micros avanzados (Zona C). */
  nutritionProEnabled?: boolean
  /**
   * Master switch del dominio Nutrición resuelto para ESTE alumno. `false` ⇒ el coach
   * apagó la nutrición para este alumno: se oculta toda la tab y se muestra una nota
   * compacta. Gating = solo render; el historial nunca se borra.
   */
  nutritionDomainEnabled?: boolean
  /**
   * Visibilidad por sección resuelta para ESTE alumno (`entitled AND wants`). El coach ve
   * lo que ve el alumno: las opcionales (micros, plate, recetas, notas, hábitos, etc.) se
   * muestran por flag; las core (plan/macros/adherencia) van siempre. `undefined`
   * (flag global OFF / sin resolver) ⇒ comportamiento de HOY: mostrar todo.
   */
  nutritionSectionFlags?: Record<NutritionSectionKey, boolean>
  /**
   * Contexto del override por-alumno (panel "Funciones para este alumno", Zona C). Trae el
   * `baseEffective` (lo heredado del default coach/team), el `override` ya guardado y el
   * entitlement por módulo. `undefined` ⇒ no se monta el panel (sin contexto resuelto).
   */
  nutritionOverrideContext?: ClientFeaturePrefsOverrideContext
}

const MACRO_COLORS = {
  cal: 'var(--sport-500)',
  prot: 'var(--color-macro-protein)',
  carb: 'var(--color-macro-carbs)',
  fat: 'var(--color-macro-fats)',
}

// ── Presentational helpers (EVA DS dark — transcripción del kit ficha-nutrition) ──

/** Separador de zona (kit `SectionTitle`): título fuerte en mayúsculas. */
function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn('text-sm font-black uppercase tracking-widest text-strong', className)}>
      {children}
    </h2>
  )
}

/** Título de card (acento sport, como las hermanas redesign de la ficha). */
function CardHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={cn('flex items-center gap-2 text-xs font-black uppercase tracking-widest text-sport-600', className)}>
      {children}
    </h3>
  )
}

/** Barra lineal de macro (kit `ProgressBar`): label + meta + track + fill por color de macro. */
function MacroBar({
  label,
  value,
  target,
  unit,
  color,
}: {
  label: string
  value: number
  target: number
  unit: string
  color: string
}) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-bold text-body">{label}</span>
        <span className="text-[11px] font-bold tabular-nums text-muted">
          {Math.round(value)} / {Math.round(target)} {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-pill bg-surface-sunken">
        <div className="h-full rounded-pill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function ZoneHeader({
  letter,
  title,
  subtitle,
}: {
  letter: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-sport-100 text-xs font-black text-sport-600">
        {letter}
      </span>
      <div className="min-w-0">
        <SectionTitle>{title}</SectionTitle>
        {subtitle ? (
          <p className="text-[11px] font-medium text-muted">{subtitle}</p>
        ) : null}
      </div>
    </div>
  )
}

/** Color de celda del heatmap por % de comidas del día (3 niveles + sin-registro). */
function heatmapCellColor(day: { hasLog: boolean; compliancePct: number | null }): string {
  if (!day.hasLog || day.compliancePct == null) return 'var(--ink-200)'
  if (day.compliancePct >= 80) return 'var(--success-500)'
  if (day.compliancePct >= 60) return 'var(--warning-500)'
  return 'var(--danger-500)'
}

const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

/** Collapsible "Detalle" accordion — collapsed by default. Reuses the file's
 *  framer-motion expand pattern so heavy charts stay out of the default view. */
function DetailAccordion({
  title,
  defaultOpen = false,
  reduceMotion,
  children,
}: {
  title: string
  defaultOpen?: boolean
  reduceMotion: boolean | null
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card padding="none" className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-sport-100"
        aria-expanded={open}
      >
        <span className="text-xs font-black uppercase tracking-widest text-muted">{title}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22 }}
            className="overflow-hidden border-t border-subtle"
          >
            <div className="space-y-6 p-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

export function NutritionTabB5({
  clientId,
  coachId,
  coachSlug,
  santiagoTodayIso,
  activeNutritionPlan,
  nutritionTimeline,
  mealDetails,
  todayMacros,
  hasTodayNutritionLog = false,
  nutritionMonthlyAvgPct,
  nutritionAdherence30dAllDays,
  nutritionStreakDays = 0,
  nutritionWeeklyAvgPct = 0,
  nutritionPrevWeeklyAvgPct = 0,
  clientFavoriteFoods = [],
  chartGridColor,
  chartAxisColor,
  tooltipBgColor,
  tooltipBorderColor,
  tooltipTextColor,
  recentCheckIns = [],
  nutritionPlanCycles = [],
  nutritionTemplatesLite = [],
  nutritionPlanHistoryEntries = [],
  coachNutrientTargets = [],
  coachPrivateNotes = [],
  coachMealComments = [],
  nutritionProEnabled = false,
  nutritionDomainEnabled = true,
  nutritionSectionFlags,
  nutritionOverrideContext,
}: NutritionTabB5Props) {
  const reduceMotion = useReducedMotion()
  // Helper de visibilidad por sección: `undefined` (flag global OFF / sin resolver) =>
  // mostrar todo (comportamiento de HOY). Las core nunca llaman acá: van siempre.
  const showSection = (key: NutritionSectionKey): boolean =>
    nutritionSectionFlags ? nutritionSectionFlags[key] === true : true
  // Micros (Zona C): el editor de umbrales cae bajo micros_base (umbrales base) y se
  // enriquece con micros_advanced (Nutrición Pro). Visible si cualquiera está prendida.
  const showMicros = showSection('micros_base') || showSection('micros_advanced')
  const [openMealId, setOpenMealId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [historyDate, setHistoryDate] = useState(santiagoTodayIso)
  const [historyData, setHistoryData] = useState<Awaited<ReturnType<typeof getClientNutritionForDate>>>(null)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [activityDates, setActivityDates] = useState<Set<string>>(new Set())
  const [habitsForDate, setHabitsForDate] = useState<{ water_ml: number | null; steps: number | null; sleep_hours: number | null; fasting_hours: number | null; supplements: string[] | null; notes: string | null } | null>(null)

  // Duplicate plan modal state
  const [dupOpen, setDupOpen] = useState(false)
  const [dupClients, setDupClients] = useState<{ id: string; full_name: string }[]>([])
  const [dupTargetId, setDupTargetId] = useState<string>('')
  const [dupLoading, setDupLoading] = useState(false)

  const handleOpenDuplicate = async () => {
    setDupOpen(true)
    setDupTargetId('')
    if (dupClients.length === 0) {
      const list = await getCoachClientsLite(coachId)
      setDupClients(list.filter((c) => c.id !== clientId))
    }
  }

  const handleDuplicate = async () => {
    const sourcePlanId = (activeNutritionPlan?.id as string | undefined) ?? ''
    if (!dupTargetId || !sourcePlanId) return
    setDupLoading(true)
    const res = await duplicatePlanToClient(coachId, sourcePlanId, dupTargetId)
    setDupLoading(false)
    if (res.success) {
      toast.success('Plan copiado correctamente.')
      setDupOpen(false)
    } else {
      toast.error(res.error ?? 'Error al duplicar el plan.')
    }
  }

  useEffect(() => {
    getClientNutritionActivityDates(clientId).then((dates) => setActivityDates(new Set(dates)))
    getClientHabitsForDate(clientId, santiagoTodayIso).then(setHabitsForDate)
  }, [clientId, santiagoTodayIso])

  const handleHistoryDateChange = (date: string) => {
    setHistoryDate(date)
    getClientHabitsForDate(clientId, date).then(setHabitsForDate)
    if (date === santiagoTodayIso) {
      setHistoryData(null)
      setHistoryLoaded(false)
      return
    }
    startTransition(async () => {
      const data = await getClientNutritionForDate(clientId, date)
      setHistoryData(data)
      setHistoryLoaded(true)
    })
  }

  const plan = activeNutritionPlan
  const kcal =
    (plan?.daily_calories as number | undefined) ??
    (plan?.target_calories as number | undefined) ??
    0

  const nutritionAlerts = useMemo(
    () =>
      deriveNutritionCoachAlerts({
        hasActivePlan: !!plan,
        kcalTarget: kcal,
        weeklyAvgPct: nutritionWeeklyAvgPct,
        prevWeeklyAvgPct: nutritionPrevWeeklyAvgPct,
        monthlyAvgPct: nutritionMonthlyAvgPct,
        nutritionTimeline: nutritionTimeline ?? [],
        santiagoTodayIso,
      }),
    [
      plan,
      kcal,
      nutritionWeeklyAvgPct,
      nutritionPrevWeeklyAvgPct,
      nutritionMonthlyAvgPct,
      nutritionTimeline,
      santiagoTodayIso,
    ]
  )
  const prot =
    (plan?.protein_g as number | undefined) ?? (plan?.target_protein as number | undefined) ?? 0
  const carb =
    (plan?.carbs_g as number | undefined) ?? (plan?.target_carbs as number | undefined) ?? 0
  const fat =
    (plan?.fats_g as number | undefined) ?? (plan?.target_fats as number | undefined) ?? 0
  const isCustom = !!(plan?.is_custom as boolean | undefined)

  const pCal = prot * 4
  const cCal = carb * 4
  const fCal = fat * 9
  const macroKcalTotal = pCal + cCal + fCal || 1

  const pieData = [
    { name: 'Proteína', value: pCal, color: MACRO_COLORS.prot },
    { name: 'Carbos', value: cCal, color: MACRO_COLORS.carb },
    { name: 'Grasas', value: fCal, color: MACRO_COLORS.fat },
  ].filter((d) => d.value > 0)

  const tm = todayMacros ?? { calories: 0, protein: 0, carbs: 0, fats: 0 }
  const consP = tm.protein * 4
  const consC = tm.carbs * 4
  const consF = tm.fats * 9
  const pieConsumed = [
    { name: 'Proteína', value: consP, color: MACRO_COLORS.prot },
    { name: 'Carbos', value: consC, color: MACRO_COLORS.carb },
    { name: 'Grasas', value: consF, color: MACRO_COLORS.fat },
  ].filter((d) => d.value > 0)

  // Adherencia headline (% canónico del motor) — la ventana de 30d que cuenta
  // TODOS los días (sin registro = 0%) manda; cae al mensual (solo días con
  // registro) y luego al semanal si el campo all-days no llegó por props.
  const headlineAdherencePct =
    nutritionAdherence30dAllDays != null
      ? nutritionAdherence30dAllDays
      : nutritionMonthlyAvgPct != null
        ? nutritionMonthlyAvgPct
        : nutritionWeeklyAvgPct
  const atRisk = !!plan && kcal > 0 && headlineAdherencePct < 60

  const heatmapDays = useMemo(() => {
    const end = santiagoTodayIso
      ? parseISO(`${santiagoTodayIso}T12:00:00`)
      : new Date()
    const start = subDays(end, 29)
    const byDate = new Map<string, NutritionTimelineRow>()
    for (const row of nutritionTimeline || []) {
      byDate.set(row.log_date, row)
    }
    return eachDayOfInterval({ start, end }).map((d) => {
      const dateKey = format(d, 'yyyy-MM-dd')
      const log = byDate.get(dateKey)
      return {
        dateKey,
        label: format(d, 'd'),
        hasLog: !!log,
        compliancePct: log ? log.compliancePct : null,
        mealsDone: log?.mealsDone ?? 0,
        mealsTotal: log?.mealsTotal ?? 0,
      }
    })
  }, [nutritionTimeline, santiagoTodayIso])

  // Comidas hechas HOY (para el header de la card "Hoy"): fila del timeline de hoy.
  const todayRow = useMemo(
    () => (nutritionTimeline || []).find((r) => r.log_date === santiagoTodayIso),
    [nutritionTimeline, santiagoTodayIso]
  )
  const mealsDoneToday = todayRow?.mealsDone ?? 0
  const mealsTotalToday = todayRow?.mealsTotal ?? 0
  const kcalPct = kcal > 0 ? Math.min(100, Math.round((tm.calories / kcal) * 100)) : 0

  const chartRows = useMemo(() => {
    return [...(nutritionTimeline || [])]
      .sort((a, b) => new Date(a.log_date).getTime() - new Date(b.log_date).getTime())
      .slice(-30)
      .map((r) => ({
        ...r,
        shortDate: new Date(r.log_date + 'T12:00:00').toLocaleDateString('es-ES', {
          day: '2-digit',
          month: 'short',
        }),
      }))
  }, [nutritionTimeline])

  const chart7d = useMemo(() => {
    const end = santiagoTodayIso
      ? parseISO(`${santiagoTodayIso}T12:00:00`)
      : new Date()
    const byDate = new Map(nutritionTimeline.map((r) => [r.log_date, r]))
    return eachDayOfInterval({ start: subDays(end, 6), end }).map((d) => {
      const key = format(d, 'yyyy-MM-dd')
      const row = byDate.get(key)
      return {
        log_date: key,
        shortDate: format(d, 'd MMM'),
        letter: DAY_LETTERS[new Date(`${key}T12:00:00`).getDay()] ?? '',
        consumed: row?.consumed_calories ?? 0,
        target: row?.target_calories || kcal || 0,
      }
    })
  }, [nutritionTimeline, santiagoTodayIso, kcal])

  // Escala del mini bar-chart 7d (meta + máximo consumido, con headroom).
  const chart7dScale = useMemo(() => {
    const max = Math.max(kcal || 0, ...chart7d.map((d) => d.consumed), 1)
    return max * 1.12
  }, [chart7d, kcal])

  const logRowsDesc = useMemo(() => {
    return [...(nutritionTimeline || [])].sort(
      (a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime()
    )
  }, [nutritionTimeline])

  const weekDelta = nutritionWeeklyAvgPct - nutritionPrevWeeklyAvgPct
  const WeekIcon = weekDelta > 1 ? TrendingUp : weekDelta < -1 ? TrendingDown : Minus

  // Barras de macro de HOY (consumido vs meta del plan) para la card "Hoy".
  const todayMacroBars = [
    { label: 'Proteína', value: tm.protein, target: prot, unit: 'g', color: MACRO_COLORS.prot },
    { label: 'Carbohidratos', value: tm.carbs, target: carb, unit: 'g', color: MACRO_COLORS.carb },
    { label: 'Grasas', value: tm.fats, target: fat, unit: 'g', color: MACRO_COLORS.fat },
  ]

  // Tiles de macro del plan (gramos + share de kcal) para la card del plan activo.
  const macroShare = [
    { name: 'Proteína', g: Math.round(prot), kcal: pCal },
    { name: 'Carbos', g: Math.round(carb), kcal: cCal },
    { name: 'Grasas', g: Math.round(fat), kcal: fCal },
  ]

  // ── ZONA A · Progreso ──────────────────────────────────────────────────────
  const zoneAProgreso = (
    <section id="nutrition-zone-a-progreso" aria-label="Zona A · Progreso" className="scroll-mt-24 space-y-4">
      {/* Banner de riesgo (adherencia < 60%) */}
      {atRisk && (
        <Card
          padding="md"
          className="flex items-center gap-3 border-l-[3px] border-l-[var(--danger-500)] bg-[var(--danger-100)]"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--danger-600)]" />
          <p className="text-sm font-bold text-[var(--danger-700)]">
            Adherencia nutricional en riesgo ({Math.round(headlineAdherencePct)}%)
          </p>
        </Card>
      )}

      {plan && kcal > 0 ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Hoy (Santiago) */}
          <Card padding="md">
            <div className="mb-2 flex items-baseline justify-between">
              <CardHeading>Hoy (Santiago)</CardHeading>
              <span className="text-xs text-muted">
                {mealsDoneToday}/{mealsTotalToday} comidas
              </span>
            </div>
            {!hasTodayNutritionLog ? (
              <p className="py-6 text-center text-sm text-muted">
                No ha registrado comidas hoy (sin log diario).
              </p>
            ) : (
              <>
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="font-display text-2xl font-black tabular-nums text-strong">
                    {Math.round(tm.calories).toLocaleString('es-CL')}
                  </span>
                  <span className="text-sm text-muted">/ {kcal.toLocaleString('es-CL')} kcal</span>
                </div>
                <div className="mb-3 h-2 overflow-hidden rounded-pill bg-surface-sunken">
                  <div
                    className="h-full rounded-pill bg-[var(--success-500)]"
                    style={{ width: `${kcalPct}%` }}
                  />
                </div>
                <div className="flex flex-col gap-2.5">
                  {todayMacroBars.map((m) => (
                    <MacroBar key={m.label} {...m} />
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* Adherencia · 30 días */}
          <Card padding="md">
            <div className="mb-3 flex items-center justify-between">
              <CardHeading>
                <Utensils className="h-4 w-4" /> Adherencia · 30 días
                <MetricInfo term="adherencia" iconClassName="text-sport-600" />
              </CardHeading>
              <span
                className="font-display text-xl font-black tabular-nums"
                style={{ color: atRisk ? 'var(--danger-600)' : 'var(--success-600)' }}
              >
                {Math.round(headlineAdherencePct)}%
              </span>
            </div>
            <p className="mb-1 text-[10px] font-medium text-muted">
              Promedio de 30 días; incluye los días sin registro como 0%.
            </p>
            <p className="mb-2 text-[10px] font-medium text-muted">
              Color según % de comidas del plan completadas ese día.
            </p>
            <div
              className="mb-3 grid gap-1 grid-cols-[repeat(15,minmax(0,1fr))]"
              role="grid"
              aria-label="Mapa de adherencia nutricional de los últimos 30 días; cada celda es un día"
            >
              {heatmapDays.map((d) => (
                <motion.div
                  key={d.dateKey}
                  role="gridcell"
                  aria-label={
                    d.hasLog
                      ? `${d.dateKey}: ${d.mealsDone}/${d.mealsTotal} comidas · ${d.compliancePct ?? 0}%`
                      : `${d.dateKey}: sin registro`
                  }
                  title={
                    d.hasLog
                      ? `${d.dateKey}: ${d.mealsDone}/${d.mealsTotal} comidas · ${d.compliancePct ?? 0}%`
                      : `${d.dateKey}: sin registro`
                  }
                  className="aspect-square rounded-[3px]"
                  style={{ background: heatmapCellColor(d) }}
                  whileHover={reduceMotion ? undefined : { scale: 1.12 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-control bg-surface-sunken px-2.5 py-2">
                <div className="font-display text-base font-black tabular-nums text-strong">
                  {nutritionMonthlyAvgPct != null ? `${nutritionMonthlyAvgPct}%` : '—'}
                </div>
                <div className="mt-0.5 text-[10px] text-muted">Prom. mensual</div>
              </div>
              <div className="rounded-control bg-surface-sunken px-2.5 py-2">
                <div className="font-display text-base font-black tabular-nums text-strong">
                  {nutritionStreakDays} d
                </div>
                <div className="mt-0.5 text-[10px] text-muted">Racha de nutrición ≥80%</div>
              </div>
              <div className="rounded-control bg-surface-sunken px-2.5 py-2">
                <div
                  className="flex items-center gap-1 font-display text-base font-black tabular-nums"
                  style={{ color: weekDelta >= 0 ? 'var(--success-600)' : 'var(--danger-600)' }}
                >
                  <WeekIcon className="h-3.5 w-3.5" />
                  {weekDelta >= 0 ? '+' : ''}
                  {Math.round(weekDelta)}%
                </div>
                <div className="mt-0.5 text-[10px] text-muted">Sem vs ant.</div>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <Card padding="md">
          <p className="py-6 text-center text-sm text-muted">
            Asigna un plan de nutrición con meta calórica para ver el progreso del alumno.
          </p>
        </Card>
      )}

      {/* Últimos 7 días · kcal vs meta */}
      {plan && (
        <Card padding="md">
          <CardHeading className="mb-1">Últimos 7 días · kcal vs meta</CardHeading>
          <p className="mb-3 text-[10px] font-medium text-muted">
            Consumo estimado según comidas del plan marcadas como hechas.
          </p>
          <div className="relative h-[110px]">
            {kcal > 0 && (
              <div
                className="absolute right-0 left-0 border-t-[1.5px] border-dashed border-[var(--ink-400)]"
                style={{ top: `${Math.max(0, 100 - (kcal / chart7dScale) * 100)}%` }}
              />
            )}
            <div className="flex h-full items-end gap-2">
              {chart7d.map((d) => (
                <div
                  key={d.log_date}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                  title={`${d.shortDate}: ${Math.round(d.consumed)} kcal`}
                >
                  <div
                    className="w-full rounded-t-[4px] bg-[var(--sport-500)]"
                    style={{ height: `${(d.consumed / chart7dScale) * 100}%` }}
                  />
                  <span className="text-[9px] text-subtle">{d.letter}</span>
                </div>
              ))}
            </div>
          </div>
          {kcal > 0 && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-subtle">
              <span className="inline-block w-3.5 border-t-[1.5px] border-dashed border-[var(--ink-400)]" />
              Meta {kcal.toLocaleString('es-CL')} kcal
            </div>
          )}
        </Card>
      )}
    </section>
  )

  // ── ZONA B · Plan y comidas ────────────────────────────────────────────────
  const zoneBPlan = (
    <section aria-label="Zona B · Plan y comidas" className="space-y-4">
      <ZoneHeader letter="B" title="Plan y comidas" subtitle="Plan activo, edición y lista de comidas" />

      {/* Alimentos favoritos del alumno (persistidos desde su app) */}
      {clientFavoriteFoods.length > 0 && (
        <Card padding="md">
          <div className="mb-2 flex items-center gap-2">
            <Heart className="h-4 w-4 shrink-0 fill-[var(--ember-500)] text-[var(--ember-500)]" />
            <span className="text-[11px] font-black uppercase tracking-widest text-subtle">
              Alimentos favoritos del alumno
            </span>
          </div>
          <p className="mb-3 text-[11px] text-muted">
            Marcados desde la app del alumno; se aplican a todos sus planes con esos alimentos del catálogo.
          </p>
          <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
            {clientFavoriteFoods.map((f) => (
              <Badge key={f.id} tone="neutral" size="sm" className="max-w-full truncate">
                {f.name}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Card del plan activo */}
      {plan && (
        <Card padding="md">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Apple className="h-4 w-4 shrink-0 text-sport-600" />
                <p className="truncate text-[15px] font-black text-strong">
                  Plan · {String(plan.name ?? '')}
                </p>
              </div>
              {kcal > 0 && (
                <p className="mt-0.5 text-xs text-muted">{kcal.toLocaleString('es-CL')} kcal / día</p>
              )}
            </div>
            <Badge tone={isCustom ? 'warning' : 'sport'} variant="soft" size="sm">
              {isCustom ? 'CUSTOM' : 'SYNCED'}
            </Badge>
          </div>

          {(plan.instructions as string)?.trim() && (
            <p className="mb-3 text-xs font-medium leading-relaxed whitespace-pre-wrap text-muted">
              {plan.instructions as string}
            </p>
          )}

          <div className="mb-3 flex gap-2">
            {macroShare.map((m) => (
              <div key={m.name} className="flex-1 rounded-control bg-surface-sunken p-2 text-center">
                <div className="font-display text-[15px] font-black tabular-nums text-strong">
                  {m.g}
                  <span className="text-[10px]">g</span>
                </div>
                <div className="text-[10px] text-muted">
                  {m.name} · {Math.round((m.kcal / macroKcalTotal) * 100)}%
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/coach/nutrition-plans/client/${clientId}`}
              className={buttonVariants({ variant: 'sport', size: 'sm', className: 'gap-1.5' })}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar plan
            </Link>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              onClick={handleOpenDuplicate}
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </Button>
            {coachSlug ? (
              <a
                href={`/c/${coachSlug}/nutrition`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-sport-600 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Ver como alumno
              </a>
            ) : null}
          </div>

          {/* Duplicate plan dialog */}
          <Dialog open={dupOpen} onOpenChange={setDupOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-base font-black uppercase">Copiar plan a otro alumno</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <p className="text-sm text-muted">
                  El plan se copiará como <span className="font-bold">CUSTOM</span> al alumno destino.
                  El historial de este alumno y el plan origen no se modifican.
                </p>
                <Select value={dupTargetId} onValueChange={(v) => setDupTargetId(v ?? '')}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Seleccionar alumno…" />
                  </SelectTrigger>
                  <SelectContent>
                    {dupClients.length === 0 && (
                      <SelectItem value="__none__" disabled>Cargando alumnos…</SelectItem>
                    )}
                    {dupClients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  className="h-10 w-full font-bold"
                  disabled={!dupTargetId || dupLoading}
                  onClick={handleDuplicate}
                >
                  {dupLoading ? 'Copiando…' : 'Confirmar copia'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </Card>
      )}
    </section>
  )

  // Lista de comidas del plan (Zona B) — card colapsable por comida.
  const mealsList = mealDetails && mealDetails.length > 0 && (
    <Card padding="none" className="overflow-hidden">
      {(mealDetails as Record<string, unknown>[]).map((meal, idx) => {
        const id = String(meal.id)
        const open = openMealId === id
        const items = (meal.food_items as unknown[]) || []
        let p = 0,
          c = 0,
          f = 0,
          mealKcal = 0
        for (const fi of items) {
          const row = fi as { foods?: Record<string, number>; quantity?: number }
          const food = row.foods
          if (!food) continue
          const q = Number(row.quantity) || 1
          p += (food.protein_g ?? 0) * q
          c += (food.carbs_g ?? 0) * q
          f += (food.fats_g ?? 0) * q
          mealKcal += (food.calories ?? 0) * q
        }
        const hasMacros = p + c + f > 0
        return (
          <div key={id}>
            {idx > 0 && <div className="mx-3.5 h-px bg-[var(--border-subtle)]" />}
            <button
              type="button"
              onClick={() => setOpenMealId(open ? null : id)}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-sport-100"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-strong">{String(meal.name)}</p>
                {hasMacros && (
                  <p className="mt-0.5 text-[10px] font-bold text-muted">
                    P {Math.round(p)}g · C {Math.round(c)}g · G {Math.round(f)}g
                  </p>
                )}
              </div>
              {mealKcal > 0 && (
                <span className="font-mono text-xs text-subtle">{Math.round(mealKcal)} kcal</span>
              )}
              <ChevronRight
                className={cn(
                  'h-4 w-4 shrink-0 text-[var(--ink-300)] transition-transform',
                  open && 'rotate-90'
                )}
              />
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.22 }}
                  className="overflow-hidden"
                >
                  <ul className="space-y-2 px-3.5 pb-3">
                    {String(meal.description ?? '').trim() ? (
                      <li className="text-[11px] text-muted">{String(meal.description)}</li>
                    ) : null}
                    {items.length === 0 ? (
                      <li className="text-[10px] italic text-muted">Sin alimentos enlazados</li>
                    ) : (
                      items.map((fi: unknown) => {
                        const row = fi as {
                          id?: string
                          foods?: { name?: string; calories?: number }
                          quantity?: number
                          unit?: string
                        }
                        const fd = row.foods
                        const label = fd?.name ?? 'Alimento'
                        return (
                          <li
                            key={row.id ?? label}
                            className="flex flex-wrap justify-between gap-2 border-b border-subtle pb-2 text-[10px] last:border-0"
                          >
                            <span className="font-bold text-body">{label}</span>
                            <span className="font-medium text-muted">
                              {row.quantity != null
                                ? `${row.quantity}${row.unit ? ` ${row.unit}` : ''}`
                                : ''}
                              {fd?.calories != null ? ` · ${Math.round(fd.calories)} kcal` : ''}
                            </span>
                          </li>
                        )
                      })
                    )}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </Card>
  )

  // ── Hilo bidireccional de comentarios (coach ⇄ alumno) ─────────────────────
  const notesThreadComments = useMemo<NotesThreadComment[]>(
    () =>
      coachMealComments.map((cm) => ({
        id: cm.id,
        author_role: cm.author_role === 'coach' ? 'coach' : 'client',
        body: cm.body,
        created_at: cm.created_at,
      })),
    [coachMealComments]
  )

  const handleCoachReply = async (body: string) => {
    const res = await addCoachMealComment({
      clientId,
      logDate: santiagoTodayIso,
      body,
    })
    if (!res.ok) {
      toast.error(res.error)
    }
  }

  // ── ZONA C · Alertas y contexto (coach-only) ───────────────────────────────
  const zoneCContexto = (
    <section aria-label="Zona C · Alertas y contexto" className="space-y-4">
      <ZoneHeader
        letter="C"
        title="Alertas y contexto"
        subtitle="Señales del coach, check-ins y ciclos del plan"
      />
      {/* Override por-alumno de la zona "Funciones": el coach fuerza mostrar/ocultar
          secciones de Nutrición SOLO para este alumno, encima del default coach/team. */}
      {nutritionOverrideContext && (
        <ClientFeaturePrefsPanel
          clientId={clientId}
          domain="nutrition"
          baseEffective={nutritionOverrideContext.baseEffective}
          override={nutritionOverrideContext.override}
          entitledByModule={nutritionOverrideContext.entitledByModule}
          domainEnabledBase={nutritionOverrideContext.domainEnabledBase}
          useTeamBase={nutritionOverrideContext.useTeamBase}
        />
      )}
      <NutritionCoachAlertsPanel alerts={nutritionAlerts} />
      <NutritionCheckinContextCard
        recentCheckIns={recentCheckIns}
        nutritionWeeklyAvgPct={nutritionWeeklyAvgPct}
      />

      {/* Restricciones dietarias (A2/A3). Oculto cuando la nutrición está desactivada
          para el alumno por el early-return de dominio más arriba. */}
      <ClientFoodRestrictionsCard clientId={clientId} coachId={coachId} />

      {/* Hilo bidireccional: el coach responde los comentarios del alumno. */}
      {showSection('notes') && (
        <Card padding="md">
          <CardHeading className="mb-3">
            <MessageSquare className="h-3.5 w-3.5" /> Conversación de nutrición · hoy
          </CardHeading>
          <NotesThread
            comments={notesThreadComments}
            currentRole="coach"
            onSubmit={handleCoachReply}
            emptyHint="Sin comentarios del alumno hoy. Puedes escribirle una nota."
          />
        </Card>
      )}

      {/* Umbrales de micros (base + avanzados con Nutrición Pro). */}
      {showMicros && (
        <CoachNutrientTargetsEditor
          clientId={clientId}
          initial={coachNutrientTargets}
          proEnabled={nutritionProEnabled}
        />
      )}

      {/* Nota privada del coach — el alumno nunca la ve. */}
      <CoachPrivateNotesPanel clientId={clientId} notes={coachPrivateNotes} />

      <NutritionCycleHistorySection
        coachId={coachId}
        clientId={clientId}
        planId={typeof activeNutritionPlan?.id === 'string' ? activeNutritionPlan.id : undefined}
        santiagoTodayIso={santiagoTodayIso}
        activeCycle={nutritionPlanCycles.find((c) => c.is_active) ?? null}
        templates={nutritionTemplatesLite}
        historyEntries={nutritionPlanHistoryEntries}
      />

      {/* Hábitos del día (agua/pasos/sueño/ayuno/suplementos del alumno). */}
      {showSection('habits') && habitsForDate && (habitsForDate.water_ml != null || habitsForDate.steps != null || habitsForDate.sleep_hours != null || habitsForDate.fasting_hours != null || (habitsForDate.supplements?.length ?? 0) > 0) && (
        <Card padding="md">
          <CardHeading className="mb-3">
            <Droplets className="h-3.5 w-3.5" /> Hábitos del día
          </CardHeading>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {habitsForDate.water_ml != null && (
              <div className="flex items-center gap-2.5">
                <Droplets className="h-4 w-4 shrink-0 text-sport-600" />
                <div>
                  <div className="font-display text-base font-black tabular-nums text-strong">
                    {habitsForDate.water_ml >= 1000
                      ? `${(habitsForDate.water_ml / 1000).toFixed(1).replace('.0', '')} L`
                      : `${habitsForDate.water_ml} ml`}
                  </div>
                  <div className="text-[10px] text-muted">Agua</div>
                </div>
              </div>
            )}
            {habitsForDate.steps != null && (
              <div className="flex items-center gap-2.5">
                <Footprints className="h-4 w-4 shrink-0 text-sport-600" />
                <div>
                  <div className="font-display text-base font-black tabular-nums text-strong">
                    {habitsForDate.steps.toLocaleString('es-CL')}
                  </div>
                  <div className="text-[10px] text-muted">Pasos</div>
                </div>
              </div>
            )}
            {habitsForDate.sleep_hours != null && (
              <div className="flex items-center gap-2.5">
                <Moon className="h-4 w-4 shrink-0 text-sport-600" />
                <div>
                  <div className="font-display text-base font-black tabular-nums text-strong">
                    {habitsForDate.sleep_hours} h
                  </div>
                  <div className="text-[10px] text-muted">Sueño</div>
                </div>
              </div>
            )}
            {habitsForDate.fasting_hours != null && (
              <div className="flex items-center gap-2.5">
                <Timer className="h-4 w-4 shrink-0 text-sport-600" />
                <div>
                  <div className="font-display text-base font-black tabular-nums text-strong">
                    {habitsForDate.fasting_hours} h
                  </div>
                  <div className="text-[10px] text-muted">Ayuno</div>
                </div>
              </div>
            )}
          </div>
          {(habitsForDate.supplements?.length ?? 0) > 0 && (
            <div className="mt-3 text-xs text-muted">
              Suplementos:{' '}
              <span className="font-semibold text-body">
                {habitsForDate.supplements!.join(' · ')}
              </span>
            </div>
          )}
          {habitsForDate.notes?.trim() && (
            <div className="mt-2 flex gap-2 rounded-control bg-surface-sunken px-3 py-2 text-xs text-body">
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-subtle" />
              <span>
                <span className="font-bold">Nota del alumno:</span> {habitsForDate.notes}
              </span>
            </div>
          )}
        </Card>
      )}
    </section>
  )

  const macroMetaPieDetail = pieData.length > 0 && (
    <div className="mx-auto w-full max-w-[260px]">
      <p className="mb-2 text-center text-[9px] font-black uppercase tracking-widest text-muted">
        Macros meta (kcal)
      </p>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="46%"
              innerRadius={44}
              outerRadius={66}
              paddingAngle={2}
              label={({ cx, cy, midAngle, outerRadius, name, value }) => {
                if (midAngle === undefined) return null
                const RADIAN = Math.PI / 180
                const radius = outerRadius + 20
                const x = cx + radius * Math.cos(-midAngle * RADIAN)
                const y = cy + radius * Math.sin(-midAngle * RADIAN)
                return (
                  <text
                    x={x}
                    y={y}
                    textAnchor={x > cx ? 'start' : 'end'}
                    dominantBaseline="central"
                    fontSize={9}
                    fontWeight={700}
                    fill="currentColor"
                  >
                    {`${(name ?? '').slice(0, 4)}: ${Math.round(value ?? 0)}kcal`}
                  </text>
                )
              }}
              labelLine={false}
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0]!.payload as (typeof pieData)[0]
                return (
                  <div
                    className="rounded-lg border px-2 py-1.5 text-[10px] font-semibold shadow-md"
                    style={{
                      backgroundColor: tooltipBgColor,
                      borderColor: tooltipBorderColor,
                      color: tooltipTextColor,
                    }}
                  >
                    {p.name}: {Math.round(p.value)} kcal
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )

  // ── DETALLE · gráficos densos (collapsed) ──────────────────────────────────
  const detailCharts = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {macroMetaPieDetail ? <Card padding="lg">{macroMetaPieDetail}</Card> : null}
      <Card padding="lg">
        <CardHeading className="mb-1">Objetivo kcal vs adherencia</CardHeading>
        <p className="mb-4 text-[10px] font-medium text-muted">
          Barras: objetivo calórico del día en el log. Línea: % de comidas marcadas.
        </p>
        {chartRows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">Sin logs recientes.</p>
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartRows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                <XAxis
                  dataKey="shortDate"
                  tick={{ fill: chartAxisColor, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: chartAxisColor, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fill: chartAxisColor, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <ReferenceArea yAxisId="right" y1={80} y2={100} fill="var(--success-500)" fillOpacity={0.08} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0]?.payload as NutritionTimelineRow & { shortDate: string }
                    return (
                      <div
                        className="rounded-lg border px-3 py-2 text-[11px] font-semibold shadow-md"
                        style={{
                          backgroundColor: tooltipBgColor,
                          borderColor: tooltipBorderColor,
                          color: tooltipTextColor,
                        }}
                      >
                        <p className="font-black">{row.log_date}</p>
                        <p>Objetivo: {row.target_calories || '—'} kcal</p>
                        <p>
                          Adherencia: {row.compliancePct}% ({row.mealsDone}/{row.mealsTotal})
                        </p>
                        {row.consumed_calories != null && row.consumed_calories > 0 && (
                          <p>Consumidas (estim.): {row.consumed_calories} kcal</p>
                        )}
                        {row.plan_name && (
                          <p className="max-w-[200px] truncate opacity-80">{row.plan_name}</p>
                        )}
                      </div>
                    )
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 700 }} />
                <Bar
                  yAxisId="left"
                  dataKey="target_calories"
                  name="Objetivo kcal"
                  fill="rgba(38, 128, 255, 0.32)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="compliancePct"
                  name="% comidas"
                  stroke="var(--success-500)"
                  strokeWidth={2}
                  dot={{ r: 2, fill: 'var(--success-500)' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {hasTodayNutritionLog && pieConsumed.length > 0 && (
        <Card padding="lg">
          <CardHeading className="mb-2">Consumido hoy (kcal por macro)</CardHeading>
          <div className="mx-auto h-[240px] w-full max-w-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieConsumed}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="46%"
                  innerRadius={38}
                  outerRadius={62}
                  paddingAngle={2}
                  label={({ cx, cy, midAngle, outerRadius, name, value }) => {
                    if (midAngle === undefined) return null
                    const RADIAN = Math.PI / 180
                    const radius = outerRadius + 20
                    const x = cx + radius * Math.cos(-midAngle * RADIAN)
                    const y = cy + radius * Math.sin(-midAngle * RADIAN)
                    return (
                      <text
                        x={x}
                        y={y}
                        textAnchor={x > cx ? 'start' : 'end'}
                        dominantBaseline="central"
                        fontSize={9}
                        fontWeight={700}
                        fill="currentColor"
                      >
                        {`${(name ?? '').slice(0, 4)}: ${Math.round(value ?? 0)}kcal`}
                      </text>
                    )
                  }}
                  labelLine={false}
                >
                  {pieConsumed.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const p = payload[0]!.payload as (typeof pieConsumed)[0]
                    return (
                      <div
                        className="rounded-lg border px-2 py-1.5 text-[10px] font-semibold shadow-md"
                        style={{
                          backgroundColor: tooltipBgColor,
                          borderColor: tooltipBorderColor,
                          color: tooltipTextColor,
                        }}
                      >
                        {p.name}: {Math.round(p.value)} kcal
                      </div>
                    )
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  )

  // ── DETALLE · historial de logs (collapsed) ────────────────────────────────
  const detailHistory = (
    <>
      {(() => {
        const latest = [...nutritionTimeline].sort(
          (a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime()
        )[0]
        if (!latest) return null
        return (
          <Card padding="lg">
            <CardHeading className="mb-4">
              <Calendar className="h-4 w-4" /> Último día registrado
            </CardHeading>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted">
              {latest.log_date} · {latest.compliancePct}% · {latest.mealsDone}/{latest.mealsTotal} comidas
              {latest.consumed_calories != null && latest.consumed_calories > 0 && (
                <> · {latest.consumed_calories} kcal consumidas (estim.)</>
              )}
            </p>
            {latest.mealLogs.length === 0 ? (
              <p className="text-sm text-muted">Sin comidas en el log.</p>
            ) : (
              <div className="space-y-2">
                {[...latest.mealLogs]
                  .sort(
                    (a: unknown, b: unknown) =>
                      ((a as { nutrition_meals?: { order_index?: number } }).nutrition_meals?.order_index ?? 0) -
                      ((b as { nutrition_meals?: { order_index?: number } }).nutrition_meals?.order_index ?? 0)
                  )
                  .map((ml: unknown, i: number) => {
                    const row = ml as { is_completed?: boolean; nutrition_meals?: { name?: string } }
                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex items-center justify-between rounded-control border px-3 py-2.5 text-sm',
                          row.is_completed
                            ? 'border-[var(--success-500)]/30 bg-[var(--success-100)]'
                            : 'border-subtle bg-surface-sunken'
                        )}
                      >
                        <span className="truncate font-bold text-body">
                          {row.nutrition_meals?.name || `Comida ${i + 1}`}
                        </span>
                        {row.is_completed ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success-500)]" />
                        ) : (
                          <Clock className="h-4 w-4 shrink-0 text-muted" />
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
          </Card>
        )
      })()}

      <Card padding="lg">
        <CardHeading className="mb-4">Historial de logs (30)</CardHeading>
        {logRowsDesc.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Sin registros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[10px] font-bold uppercase tracking-widest">
              <thead>
                <tr className="border-b border-subtle text-muted">
                  <th className="pr-3 pb-2">Fecha</th>
                  <th className="pr-3 pb-2">Plan</th>
                  <th className="pr-3 pb-2">Obj. kcal</th>
                  <th className="pr-3 pb-2">Cons. kcal</th>
                  <th className="pr-3 pb-2">Adher.</th>
                  <th className="pb-2">Comidas</th>
                </tr>
              </thead>
              <tbody>
                {logRowsDesc.slice(0, 30).map((row, i) => (
                  <tr
                    key={`${row.log_date}-${row.plan_name ?? 'p'}-${i}`}
                    className={cn(
                      'border-b border-subtle',
                      row.compliancePct < 60 && 'border-l-2 border-l-[var(--danger-500)] bg-[var(--danger-100)]'
                    )}
                  >
                    <td className="py-2.5 pr-3 font-mono text-strong normal-case">{row.log_date}</td>
                    <td className="max-w-[140px] truncate py-2.5 pr-3 font-semibold normal-case text-muted">
                      {row.plan_name || '—'}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-body">{row.target_calories || '—'}</td>
                    <td className="py-2.5 pr-3 tabular-nums normal-case text-body">
                      {row.consumed_calories != null && row.consumed_calories > 0 ? row.consumed_calories : '—'}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        style={{
                          color:
                            row.compliancePct >= 80
                              ? 'var(--success-600)'
                              : row.compliancePct >= 60
                                ? 'var(--warning-700)'
                                : 'var(--danger-600)',
                        }}
                      >
                        {row.compliancePct}%
                      </span>
                    </td>
                    <td className="py-2.5 tabular-nums normal-case text-body">
                      {row.mealsDone}/{row.mealsTotal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Historial por fecha ── */}
      <Card padding="md" className="space-y-4">
        <CardHeading className="text-muted">
          <Calendar className="h-3.5 w-3.5" /> Ver día específico
        </CardHeading>
        <DayNavigator
          selectedDate={historyDate}
          onDateChange={handleHistoryDateChange}
          adherenceDates={activityDates}
          isLoading={isPending}
        />
        {historyDate !== santiagoTodayIso && (
          <div className="pt-1">
            {isPending && (
              <p className="animate-pulse py-6 text-center text-sm text-muted">Cargando…</p>
            )}
            {!isPending && historyLoaded && !historyData && (
              <p className="py-6 text-center text-sm text-muted">
                Sin registros de nutrición para este día.
              </p>
            )}
            {!isPending && historyData && <NutritionDayReadOnly log={historyData} />}
          </div>
        )}
      </Card>
    </>
  )

  // Dominio Nutrición apagado para ESTE alumno: el coach apagó la nutrición en sus
  // preferencias. Mostrar una nota compacta en vez de la tab completa. Gating = render.
  if (!nutritionDomainEnabled) {
    return (
      <div className="space-y-4">
        <Card padding="lg" className="text-center">
          <Utensils className="mx-auto mb-3 h-6 w-6 text-muted" />
          <h3 className="text-sm font-black uppercase tracking-widest text-strong">
            Nutrición desactivada para este alumno
          </h3>
          <p className="mx-auto mt-2 max-w-md text-xs font-medium text-muted">
            Apagaste el módulo de nutrición para este alumno en tus preferencias. Sus datos se
            conservan; vuelve a activarlo para ver plan, macros y adherencia.
          </p>
        </Card>
        {/* Escape hatch: re-activar la nutrición desde la misma ficha. */}
        {nutritionOverrideContext && (
          <ClientFeaturePrefsPanel
            clientId={clientId}
            domain="nutrition"
            baseEffective={nutritionOverrideContext.baseEffective}
            override={nutritionOverrideContext.override}
            entitledByModule={nutritionOverrideContext.entitledByModule}
            domainEnabledBase={nutritionOverrideContext.domainEnabledBase}
            useTeamBase={nutritionOverrideContext.useTeamBase}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Zona A · Progreso — los números canónicos del motor de adherencia */}
      {zoneAProgreso}

      {/* Zona B · Plan y comidas */}
      {zoneBPlan}
      {mealsList}

      {/* Zona C · Alertas y contexto */}
      {zoneCContexto}

      {/* Detalle — gráficos densos e historial, colapsados por defecto */}
      <DetailAccordion title="Detalle · gráficos densos" reduceMotion={reduceMotion}>
        {detailCharts}
      </DetailAccordion>
      <DetailAccordion title="Detalle · historial de logs" reduceMotion={reduceMotion}>
        {detailHistory}
      </DetailAccordion>

      {/* CTA final — abrir el editor del plan nutricional */}
      <Link
        href={`/coach/nutrition-plans/client/${clientId}`}
        className={buttonVariants({ variant: 'sport', size: 'lg', className: 'w-full gap-2' })}
      >
        <Utensils className="h-5 w-5" />
        Abrir plan nutricional
      </Link>
    </div>
  )
}

// ── Sub-componente: vista de nutrición de un día (solo lectura) ──────────────
type NutritionDayLog = NonNullable<Awaited<ReturnType<typeof getClientNutritionForDate>>>

function NutritionDayReadOnly({ log }: { log: NutritionDayLog }) {
  const mealLogs = (log.nutrition_meal_logs ?? []) as any[]
  const swapLogs = (log.nutrition_meal_food_swaps ?? []) as Array<{
    id?: string
    meal_id: string
    original_food_id: string
    swapped_food_id: string
    swapped_quantity?: number | null
    swapped_unit?: string | null
    original_food?: { id?: string; name?: string } | null
    swapped_food?: { id?: string; name?: string } | null
  }>
  const swapsByMeal = new Map<string, typeof swapLogs>()
  for (const s of swapLogs) {
    const list = swapsByMeal.get(s.meal_id) ?? []
    list.push(s)
    swapsByMeal.set(s.meal_id, list)
  }

  // Calcular macros consumidos del día
  let totalCal = 0, totalP = 0, totalC = 0, totalF = 0
  for (const ml of mealLogs) {
    if (!ml.is_completed) continue
    const items = ml.nutrition_meals?.food_items ?? []
    for (const fi of items) {
      if (!fi.foods) continue
      const m = calculateFoodItemMacros({
        quantity: Number(fi.quantity) || 0,
        unit: fi.unit ?? 'g',
        foods: {
          name: fi.foods.name ?? '',
          calories: fi.foods.calories ?? 0,
          protein_g: fi.foods.protein_g ?? 0,
          carbs_g: fi.foods.carbs_g ?? 0,
          fats_g: fi.foods.fats_g ?? 0,
          serving_size: fi.foods.serving_size ?? 100,
          serving_unit: fi.foods.serving_unit ?? null,
        },
      })
      totalCal += m.calories; totalP += m.protein; totalC += m.carbs; totalF += m.fats
    }
  }

  const sortedMeals = [...mealLogs].sort(
    (a, b) => (a.nutrition_meals?.order_index ?? 0) - (b.nutrition_meals?.order_index ?? 0)
  )

  // Satisfacción promedio del día (1-5), solo comidas con score declarado por el alumno
  const dayAvgSat = avgSatisfaction(mealLogs)

  return (
    <div className="space-y-4">
      {/* Resumen macros del día */}
      <div className="grid grid-cols-4 gap-2 rounded-control bg-surface-sunken p-3 text-center">
        {[
          { label: 'Kcal', value: Math.round(totalCal), color: 'var(--sport-600)' },
          { label: 'P', value: `${Math.round(totalP)}g`, color: 'var(--color-macro-protein)' },
          { label: 'C', value: `${Math.round(totalC)}g`, color: 'var(--color-macro-carbs)' },
          { label: 'G', value: `${Math.round(totalF)}g`, color: 'var(--color-macro-fats)' },
        ].map((m) => (
          <div key={m.label}>
            <p className="font-display text-base font-black tabular-nums" style={{ color: m.color }}>
              {m.value}
            </p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{m.label}</p>
          </div>
        ))}
      </div>
      {/* Satisfacción promedio del día (declarada por el alumno, 1-5) */}
      {dayAvgSat != null && (
        <div className="flex items-center justify-between rounded-control border border-subtle bg-surface-card px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5 text-sport-600" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
              Satisfacción prom.
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-sm font-black tabular-nums text-strong">
              {dayAvgSat}<span className="text-[10px] font-bold text-muted">/5</span>
            </span>
            <span className="text-[9px] text-muted">satisfacción declarada por el alumno, 1-5</span>
          </div>
        </div>
      )}
      {/* Lista de comidas */}
      <div className="space-y-2">
        {sortedMeals.map((ml: any) => {
          const meal = ml.nutrition_meals
          if (!meal) return null
          const mealSwaps = swapsByMeal.get(meal.id) ?? []
          return (
            <div
              key={ml.id}
              className={cn(
                'space-y-1.5 rounded-control border p-3',
                ml.is_completed
                  ? 'border-[var(--success-500)]/30 bg-[var(--success-100)]'
                  : 'border-subtle bg-surface-sunken opacity-70'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-widest text-strong">{meal.name}</p>
                {(() => {
                  const pct = mealConsumedPct(ml)
                  if (pct == null) {
                    // No completada: mantener el estado binario existente
                    return (
                      <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
                        No completada
                      </span>
                    )
                  }
                  const partial = pct < 100
                  return (
                    <span
                      title="porción consumida (% de lo prescrito)"
                      className="shrink-0 rounded-[var(--radius-xs)] border border-subtle bg-surface-sunken px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                      style={{ color: partial ? 'var(--warning-600)' : 'var(--success-600)' }}
                    >
                      {partial ? `Comió ${pct}%` : 'Completa 100%'}
                    </span>
                  )
                })()}
              </div>
              {(meal.food_items ?? []).length > 0 && (
                <ul className="space-y-0.5">
                  {(meal.food_items as any[]).map((fi: any) => (
                    <li key={fi.id} className="text-[11px] text-muted">
                      {fi.foods?.name ?? '—'} — {fi.quantity} {fi.unit}
                    </li>
                  ))}
                </ul>
              )}
              {mealSwaps.length > 0 && (
                <div className="space-y-1 rounded-control bg-[var(--info-100)] px-2.5 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-[var(--info-600)]">Swaps aplicados</p>
                  {mealSwaps.map((s) => (
                    <p key={s.id ?? `${s.meal_id}-${s.original_food_id}-${s.swapped_food_id}`} className="text-[10px] text-[var(--info-600)]">
                      {(s.original_food?.name ?? 'Alimento')} → {(s.swapped_food?.name ?? 'Alternativa')}
                      {s.swapped_quantity != null
                        ? ` (${s.swapped_quantity}${s.swapped_unit ? ` ${s.swapped_unit}` : ''})`
                        : ''}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
