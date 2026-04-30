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
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar'
import 'react-circular-progressbar/dist/styles.css'
import { GlassCard } from '@/components/ui/glass-card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Utensils,
  ChevronDown,
  ChevronUp,
  Apple,
  Flame,
  Calendar,
  CheckCircle2,
  Clock,
  Pencil,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Heart,
  Droplets,
} from 'lucide-react'
import { AdherenceStrip, type DayAdherence } from '@/app/c/[coach_slug]/nutrition/_components/AdherenceStrip'
import { MacroRingSummary } from '@/app/c/[coach_slug]/nutrition/_components/MacroRingSummary'
import { DayNavigator } from '@/app/c/[coach_slug]/nutrition/_components/DayNavigator'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { getClientNutritionForDate, getClientNutritionActivityDates, getClientHabitsForDate } from './actions'
import { calculateFoodItemMacros } from '@/lib/nutrition-utils'
import { duplicatePlanToClient, getCoachClientsLite } from '@/app/coach/nutrition-plans/_actions/nutrition-coach.actions'

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
}

const MACRO_COLORS = {
  cal: '#007AFF',
  prot: '#10b981',
  carb: '#f59e0b',
  fat: '#ef4444',
}

function MacroShareRing({
  label,
  grams,
  kcalSharePct,
  color,
  unit = 'g',
}: {
  label: string
  grams: number
  kcalSharePct: number
  color: string
  unit?: string
}) {
  const pct = Math.min(100, Math.max(0, Math.round(kcalSharePct)))
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="h-[72px] w-[72px]">
        <CircularProgressbar
          value={pct}
          text={`${grams}${unit === 'g' ? 'g' : ''}`}
          strokeWidth={10}
          styles={buildStyles({
            pathColor: color,
            trailColor: 'rgba(128,128,128,0.12)',
            textColor: 'var(--foreground)',
            textSize: '22px',
          })}
        />
      </div>
      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground text-center leading-tight">
        {label}
      </span>
      <span className="text-[10px] font-bold tabular-nums text-muted-foreground">{pct}% kcal</span>
    </div>
  )
}

function HeatmapCell({
  day,
  reduceMotion,
}: {
  day: {
    dateKey: string
    label: string
    compliancePct: number | null
    mealsDone: number
    mealsTotal: number
    hasLog: boolean
  }
  reduceMotion: boolean | null
}) {
  const bg = !day.hasLog
    ? 'bg-muted/60 border-border/40'
    : day.compliancePct == null
      ? 'bg-muted/60 border-border/40'
      : day.compliancePct >= 80
        ? 'bg-emerald-500/35 border-emerald-500/50'
        : day.compliancePct >= 60
          ? 'bg-amber-500/35 border-amber-500/45'
          : 'bg-rose-500/30 border-rose-500/45'

  const title = day.hasLog
    ? `${day.dateKey}: ${day.mealsDone}/${day.mealsTotal} comidas · ${day.compliancePct ?? 0}%`
    : `${day.dateKey}: sin registro`

  return (
    <motion.div
      title={title}
      className={cn(
        'aspect-square rounded-md border text-[0] min-h-[26px]',
        bg,
        'cursor-default'
      )}
      whileHover={reduceMotion ? undefined : { scale: 1.08 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
    />
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
  adherence30d,
  todayMacros,
  hasTodayNutritionLog = false,
  nutritionMonthlyAvgPct,
  nutritionStreakDays = 0,
  nutritionWeeklyAvgPct = 0,
  nutritionPrevWeeklyAvgPct = 0,
  clientFavoriteFoods = [],
  chartGridColor,
  chartAxisColor,
  tooltipBgColor,
  tooltipBorderColor,
  tooltipTextColor,
}: NutritionTabB5Props) {
  const reduceMotion = useReducedMotion()
  const [openMealId, setOpenMealId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [historyDate, setHistoryDate] = useState(santiagoTodayIso)
  const [historyData, setHistoryData] = useState<Awaited<ReturnType<typeof getClientNutritionForDate>>>(null)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [activityDates, setActivityDates] = useState<Set<string>>(new Set())
  const [habitsForDate, setHabitsForDate] = useState<{ water_ml: number | null; steps: number | null; sleep_hours: number | null; notes: string | null } | null>(null)

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
        consumed: row?.consumed_calories ?? 0,
        target: row?.target_calories || kcal || 0,
      }
    })
  }, [nutritionTimeline, santiagoTodayIso, kcal])

  const logRowsDesc = useMemo(() => {
    return [...(nutritionTimeline || [])].sort(
      (a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime()
    )
  }, [nutritionTimeline])

  const planMealsForStrip = (plan?.nutrition_meals as { id: string; day_of_week?: number | null }[] | undefined) ?? []
  const useAdherenceStrip =
    Array.isArray(adherence30d) && adherence30d.length > 0 && planMealsForStrip.length > 0

  const weekDelta = nutritionWeeklyAvgPct - nutritionPrevWeeklyAvgPct
  const WeekIcon = weekDelta > 1 ? TrendingUp : weekDelta < -1 ? TrendingDown : Minus

  return (
    <div className="space-y-6">
      {clientFavoriteFoods.length > 0 && (
        <GlassCard className="border-border/40 p-4 dark:border-white/10">
          <div className="mb-2 flex items-center gap-2">
            <Heart className="h-4 w-4 shrink-0 fill-rose-400 text-rose-400" />
            <h3 className="text-xs font-black uppercase tracking-widest text-foreground/90">
              Alimentos favoritos del alumno
            </h3>
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Marcados desde la app del alumno; se aplican a todos sus planes con esos alimentos del catálogo.
          </p>
          <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
            {clientFavoriteFoods.map((f) => (
              <Badge key={f.id} variant="secondary" className="max-w-full truncate font-medium">
                {f.name}
              </Badge>
            ))}
          </div>
        </GlassCard>
      )}
      {plan && (
        <GlassCard className="relative overflow-hidden border-dashed border-border/50 p-6 dark:border-white/10">
          <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Apple className="h-4 w-4 text-primary shrink-0" />
                <h3 className="text-xs font-black uppercase tracking-widest text-primary truncate">
                  Plan activo · {String(plan.name ?? '')}
                </h3>
                <div className="flex items-center gap-1">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[8px] font-black uppercase',
                      isCustom
                        ? 'bg-amber-500/10 text-amber-600 border-amber-500/25'
                        : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25'
                    )}
                  >
                    {isCustom ? 'CUSTOM' : 'SYNCED'}
                  </Badge>
                  <InfoTooltip
                    content={
                      isCustom
                        ? 'Este plan fue editado directamente para este alumno. Los cambios en las plantillas no lo afectan.'
                        : 'Este plan está vinculado a una plantilla. Si editas la plantilla y propagas, este plan se actualiza automáticamente. El historial de adherencia se conserva.'
                    }
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/coach/nutrition-plans/client/${clientId}`}
                  className={buttonVariants({ size: 'sm', className: 'h-9 text-[10px] font-black uppercase gap-1' })}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar plan
                </Link>
                {coachSlug ? (
                  <a
                    href={`/c/${coachSlug}/nutrition`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({
                      variant: 'outline',
                      size: 'sm',
                      className: 'h-9 text-[10px] font-black uppercase gap-1',
                    })}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Ver como alumno
                  </a>
                ) : null}
                {activeNutritionPlan && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-[10px] font-black uppercase gap-1"
                    onClick={handleOpenDuplicate}
                  >
                    Copiar a otro alumno
                  </Button>
                )}
              </div>

              {/* Duplicate plan dialog */}
              <Dialog open={dupOpen} onOpenChange={setDupOpen}>
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle className="text-base font-black uppercase">Copiar plan a otro alumno</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <p className="text-sm text-muted-foreground">
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
                      className="w-full h-10 font-bold"
                      disabled={!dupTargetId || dupLoading}
                      onClick={handleDuplicate}
                    >
                      {dupLoading ? 'Copiando…' : 'Confirmar copia'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              {kcal > 0 && (
                <p className="text-2xl font-black tabular-nums text-foreground">
                  {kcal} <span className="text-sm font-bold text-muted-foreground">kcal / día</span>
                </p>
              )}
              {(plan.instructions as string)?.trim() && (
                <p className="text-sm font-medium leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  {plan.instructions as string}
                </p>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <MacroShareRing
                  label="Proteína"
                  grams={Math.round(prot)}
                  kcalSharePct={(pCal / macroKcalTotal) * 100}
                  color={MACRO_COLORS.prot}
                />
                <MacroShareRing
                  label="Carbos"
                  grams={Math.round(carb)}
                  kcalSharePct={(cCal / macroKcalTotal) * 100}
                  color={MACRO_COLORS.carb}
                />
                <MacroShareRing
                  label="Grasas"
                  grams={Math.round(fat)}
                  kcalSharePct={(fCal / macroKcalTotal) * 100}
                  color={MACRO_COLORS.fat}
                />
                <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border/40 bg-secondary/20 px-2 py-3 dark:border-white/10">
                  <Flame className="h-5 w-5 text-primary opacity-80" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground text-center">
                    Distribución
                  </span>
                  <span className="text-[10px] font-bold text-center text-muted-foreground leading-tight">
                    Meta (kcal macros)
                  </span>
                </div>
              </div>
            </div>
            {pieData.length > 0 && (
              <div className="mx-auto w-full max-w-[220px] lg:mx-0 lg:w-[240px]">
                <div className="mb-2 flex items-center justify-center gap-1 lg:justify-start">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                    Macros meta (kcal)
                  </p>
                  <InfoTooltip content="Distribución porcentual de las calorías del plan. Referencia: 30% proteína / 40% carbos / 30% grasas para hipertrofia." iconClassName="w-3 h-3" />
                </div>
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
            )}
          </div>
        </GlassCard>
      )}

      {plan && kcal > 0 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <GlassCard className="border-dashed border-border/50 p-5 dark:border-white/10">
            <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-primary">Hoy (Santiago)</h3>
            {!hasTodayNutritionLog ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No ha registrado comidas hoy (sin log diario).
              </p>
            ) : (
              <MacroRingSummary
                isReadOnly
                calories={{ consumed: tm.calories, target: kcal }}
                protein={{ consumed: tm.protein, target: prot }}
                carbs={{ consumed: tm.carbs, target: carb }}
                fats={{ consumed: tm.fats, target: fat }}
              />
            )}
          </GlassCard>

          <GlassCard className="border-dashed border-border/50 p-5 dark:border-white/10">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
              <Utensils className="h-4 w-4" /> Adherencia · 30 días
              <InfoTooltip content="Cada cuadrado es un día. Verde = el alumno completó al menos una comida ese día. Gris = sin registro. No indica el 100% de las comidas, solo que logueó." />
            </h3>
            {useAdherenceStrip ? (
              <div className="space-y-4">
                <AdherenceStrip
                  data={adherence30d!}
                  planMeals={planMealsForStrip.map((m) => ({
                    id: m.id,
                    day_of_week: m.day_of_week ?? null,
                  }))}
                />
                <div className="flex flex-wrap gap-4 text-sm">
                  {nutritionMonthlyAvgPct != null && (
                    <div>
                      <div className="flex items-center gap-1">
                        <p className="text-[9px] font-black uppercase text-muted-foreground">Promedio mensual</p>
                        <InfoTooltip content="Promedio de comidas completadas vs totales del plan en los últimos 30 días. Considera solo los días con registro." iconClassName="w-3 h-3" />
                      </div>
                      <p className="text-2xl font-black tabular-nums">{nutritionMonthlyAvgPct}%</p>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-1">
                      <p className="text-[9px] font-black uppercase text-muted-foreground">Racha (≥80%)</p>
                      <InfoTooltip content="Días consecutivos hacia atrás donde el alumno completó ≥80% de las comidas del día." iconClassName="w-3 h-3" />
                    </div>
                    <p className="text-2xl font-black tabular-nums">{nutritionStreakDays} días</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <WeekIcon className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-1">
                        <p className="text-[9px] font-black uppercase text-muted-foreground">Semana vs anterior</p>
                        <InfoTooltip content="Adherencia promedio de esta semana comparada con la semana anterior. Flecha arriba = mejora." iconClassName="w-3 h-3" />
                      </div>
                      <p className="font-bold tabular-nums">
                        {nutritionWeeklyAvgPct}% vs {nutritionPrevWeeklyAvgPct}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="mb-3 text-[10px] font-medium text-muted-foreground">
                  Color según % de comidas del plan completadas ese día.
                </p>
                <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
                  {heatmapDays.map((day) => (
                    <HeatmapCell key={day.dateKey} day={day} reduceMotion={reduceMotion} />
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-muted/60 border border-border/40" /> Sin datos
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-rose-500/30 border border-rose-500/45" /> &lt;60%
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/35 border border-amber-500/45" /> 60–80%
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/35 border border-emerald-500/50" /> &gt;80%
                  </span>
                </div>
              </>
            )}
          </GlassCard>
        </div>
      )}

      {habitsForDate && (habitsForDate.water_ml != null || habitsForDate.steps != null || habitsForDate.sleep_hours != null) && (
        <GlassCard className="border-dashed border-sky-500/20 bg-sky-500/[0.02] p-4 dark:border-sky-500/15">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-sky-600 dark:text-sky-400">
            <Droplets className="h-3.5 w-3.5" />
            Hábitos del día
            <InfoTooltip content="Agua, pasos y sueño registrados por el alumno desde su app." iconClassName="w-3 h-3" />
          </h3>
          <div className="flex flex-wrap gap-4 text-sm">
            {habitsForDate.water_ml != null && (
              <div>
                <p className="text-[9px] font-black uppercase text-muted-foreground">Agua</p>
                <p className="font-black tabular-nums text-sky-600 dark:text-sky-400">
                  {habitsForDate.water_ml >= 1000
                    ? `${(habitsForDate.water_ml / 1000).toFixed(1).replace('.0', '')} L`
                    : `${habitsForDate.water_ml} ml`}
                </p>
              </div>
            )}
            {habitsForDate.steps != null && (
              <div>
                <p className="text-[9px] font-black uppercase text-muted-foreground">Pasos</p>
                <p className={cn(
                  'font-black tabular-nums',
                  habitsForDate.steps >= 8000 ? 'text-emerald-500' : habitsForDate.steps >= 5000 ? 'text-amber-500' : 'text-muted-foreground'
                )}>
                  {habitsForDate.steps.toLocaleString('es-CL')}
                </p>
              </div>
            )}
            {habitsForDate.sleep_hours != null && (
              <div>
                <p className="text-[9px] font-black uppercase text-muted-foreground">Sueño</p>
                <p className={cn(
                  'font-black tabular-nums',
                  habitsForDate.sleep_hours >= 7 ? 'text-emerald-500' : habitsForDate.sleep_hours >= 6 ? 'text-amber-500' : 'text-rose-500'
                )}>
                  {habitsForDate.sleep_hours}h
                </p>
              </div>
            )}
            {habitsForDate.notes?.trim() && (
              <div className="w-full">
                <p className="text-[9px] font-black uppercase text-muted-foreground">Nota del alumno</p>
                <p className="text-xs text-muted-foreground mt-0.5 italic">{habitsForDate.notes}</p>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {plan && (
        <GlassCard className="border-dashed border-border/50 p-5 dark:border-white/10">
          <h3 className="mb-1 flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-primary">
            Últimos 7 días · kcal consumidas vs meta del log
            <InfoTooltip content="Barras azules = calorías consumidas (suma de comidas completadas × porción). Línea naranja = meta calórica diaria del plan." />
          </h3>
          <p className="mb-4 text-[10px] font-medium text-muted-foreground">
            Consumo estimado según comidas del plan marcadas como hechas.
          </p>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart7d} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                <XAxis
                  dataKey="shortDate"
                  tick={{ fill: chartAxisColor, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: chartAxisColor, fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0]?.payload as (typeof chart7d)[0]
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
                        <p>Consumidas: {row.consumed} kcal</p>
                        <p>Meta log: {row.target || '—'} kcal</p>
                      </div>
                    )
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 700 }} />
                <Bar dataKey="consumed" name="Consumidas" fill="rgba(16, 185, 129, 0.45)" radius={[3, 3, 0, 0]} maxBarSize={32} />
                <Line
                  type="monotone"
                  dataKey="target"
                  name="Meta log"
                  stroke={MACRO_COLORS.cal}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <GlassCard className="border-dashed border-border/50 p-5 dark:border-white/10">
          <h3 className="mb-1 text-xs font-black uppercase tracking-widest text-primary">
            Objetivo kcal vs adherencia
          </h3>
          <p className="mb-4 text-[10px] font-medium text-muted-foreground">
            Barras: objetivo calórico del día en el log. Línea: % de comidas marcadas.
          </p>
          {chartRows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Sin logs recientes.</p>
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
                  <ReferenceArea yAxisId="right" y1={80} y2={100} fill="#10b981" fillOpacity={0.08} />
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
                            <p className="opacity-80 truncate max-w-[200px]">{row.plan_name}</p>
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
                    fill="rgba(0, 122, 255, 0.28)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={28}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="compliancePct"
                    name="% comidas"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 2, fill: '#10b981' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </GlassCard>

        {hasTodayNutritionLog && pieConsumed.length > 0 && (
          <GlassCard className="border-dashed border-border/50 p-5 dark:border-white/10">
            <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-primary">
              Consumido hoy (kcal por macro)
            </h3>
            <div className="h-[240px] w-full max-w-[300px] mx-auto">
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
          </GlassCard>
        )}
      </div>

      {mealDetails && mealDetails.length > 0 && (
        <GlassCard className="border-dashed border-border/50 p-6 dark:border-white/10">
          <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-primary">
            Plan completo · comidas
          </h3>
          <div className="space-y-2">
            {(mealDetails as Record<string, unknown>[]).map((meal) => {
              const id = String(meal.id)
              const open = openMealId === id
              const items = (meal.food_items as unknown[]) || []
              let p = 0,
                c = 0,
                f = 0
              for (const fi of items) {
                const row = fi as { foods?: Record<string, number>; quantity?: number }
                const food = row.foods
                if (!food) continue
                const q = Number(row.quantity) || 1
                p += (food.protein_g ?? 0) * q
                c += (food.carbs_g ?? 0) * q
                f += (food.fats_g ?? 0) * q
              }
              const hasMacros = p + c + f > 0
              return (
                <div
                  key={id}
                  className="overflow-hidden rounded-xl border border-border/40 bg-secondary/15 dark:border-white/10"
                >
                  <button
                    type="button"
                    onClick={() => setOpenMealId(open ? null : id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-tight text-foreground">
                        {String(meal.name)}
                      </p>
                      {String(meal.description ?? '').trim() ? (
                        <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
                          {String(meal.description)}
                        </p>
                      ) : null}
                      {hasMacros && (
                        <p className="mt-1 text-[10px] font-bold text-muted-foreground">
                          P {Math.round(p)}g · C {Math.round(c)}g · G {Math.round(f)}g
                        </p>
                      )}
                    </div>
                    {open ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.22 }}
                        className="overflow-hidden border-t border-border/30 dark:border-white/10"
                      >
                        <ul className="space-y-2 px-4 py-3">
                          {items.length === 0 ? (
                            <li className="text-[10px] italic text-muted-foreground">Sin alimentos enlazados</li>
                          ) : (
                            items.map((fi: unknown) => {
                              const row = fi as {
                                id?: string
                                foods?: { name?: string; calories?: number }
                                quantity?: number
                                unit?: string
                              }
                              const f = row.foods
                              const label = f?.name ?? 'Alimento'
                              return (
                                <li
                                  key={row.id ?? label}
                                  className="flex flex-wrap justify-between gap-2 border-b border-border/20 pb-2 text-[10px] last:border-0 dark:border-white/5"
                                >
                                  <span className="font-bold text-foreground">{label}</span>
                                  <span className="font-medium text-muted-foreground">
                                    {row.quantity != null
                                      ? `${row.quantity}${row.unit ? ` ${row.unit}` : ''}`
                                      : ''}
                                    {f?.calories != null ? ` · ${Math.round(f.calories)} kcal` : ''}
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
          </div>
        </GlassCard>
      )}

      {(() => {
        const latest = [...nutritionTimeline].sort(
          (a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime()
        )[0]
        if (!latest) return null
        return (
          <GlassCard className="border-dashed border-border/50 p-6 dark:border-white/10">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
              <Calendar className="h-4 w-4" /> Último día registrado
            </h3>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {latest.log_date} · {latest.compliancePct}% · {latest.mealsDone}/{latest.mealsTotal} comidas
              {latest.consumed_calories != null && latest.consumed_calories > 0 && (
                <> · {latest.consumed_calories} kcal consumidas (estim.)</>
              )}
            </p>
            {latest.mealLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin comidas en el log.</p>
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
                          'flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm',
                          row.is_completed
                            ? 'border-emerald-500/20 bg-emerald-500/10'
                            : 'border-border/50 bg-secondary/50 dark:border-white/10 dark:bg-white/5'
                        )}
                      >
                        <span className="truncate font-bold">
                          {row.nutrition_meals?.name || `Comida ${i + 1}`}
                        </span>
                        {row.is_completed ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        ) : (
                          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
          </GlassCard>
        )
      })()}

      <GlassCard className="border-dashed border-border/50 p-6 dark:border-white/10">
        <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-primary">Historial de logs (30)</h3>
        {logRowsDesc.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin registros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[10px] font-bold uppercase tracking-widest">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground dark:border-white/10">
                  <th className="pb-2 pr-3">Fecha</th>
                  <th className="pb-2 pr-3">Plan</th>
                  <th className="pb-2 pr-3">Obj. kcal</th>
                  <th className="pb-2 pr-3">Cons. kcal</th>
                  <th className="pb-2 pr-3">Adher.</th>
                  <th className="pb-2">Comidas</th>
                </tr>
              </thead>
              <tbody>
                {logRowsDesc.slice(0, 30).map((row, i) => (
                  <tr
                    key={`${row.log_date}-${row.plan_name ?? 'p'}-${i}`}
                    className={cn(
                      'border-b border-border/30 dark:border-white/5',
                      row.compliancePct < 60 && 'border-l-2 border-l-rose-500 bg-rose-500/5'
                    )}
                  >
                    <td className="py-2.5 pr-3 font-mono text-foreground normal-case">{row.log_date}</td>
                    <td className="max-w-[140px] truncate py-2.5 pr-3 normal-case font-semibold text-muted-foreground">
                      {row.plan_name || '—'}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">{row.target_calories || '—'}</td>
                    <td className="py-2.5 pr-3 tabular-nums normal-case">
                      {row.consumed_calories != null && row.consumed_calories > 0 ? row.consumed_calories : '—'}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={cn(
                          row.compliancePct >= 80 && 'text-emerald-500',
                          row.compliancePct >= 60 && row.compliancePct < 80 && 'text-amber-500',
                          row.compliancePct < 60 && 'text-rose-500'
                        )}
                      >
                        {row.compliancePct}%
                      </span>
                    </td>
                    <td className="py-2.5 tabular-nums normal-case">
                      {row.mealsDone}/{row.mealsTotal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* ── Historial por fecha ── */}
      <GlassCard className="p-4 space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5" /> Ver día específico
        </h3>
        <DayNavigator
          selectedDate={historyDate}
          onDateChange={handleHistoryDateChange}
          adherenceDates={activityDates}
          isLoading={isPending}
        />
        {historyDate !== santiagoTodayIso && (
          <div className="pt-1">
            {isPending && (
              <p className="text-sm text-muted-foreground text-center py-6 animate-pulse">Cargando…</p>
            )}
            {!isPending && historyLoaded && !historyData && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Sin registros de nutrición para este día.
              </p>
            )}
            {!isPending && historyData && (
              <NutritionDayReadOnly log={historyData} />
            )}
          </div>
        )}
      </GlassCard>
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

  return (
    <div className="space-y-4">
      {/* Resumen macros del día */}
      <div className="grid grid-cols-4 gap-2 text-center rounded-xl bg-muted/30 p-3">
        {[
          { label: 'Kcal', value: Math.round(totalCal), color: 'text-primary' },
          { label: 'P', value: `${Math.round(totalP)}g`, color: 'text-blue-500' },
          { label: 'C', value: `${Math.round(totalC)}g`, color: 'text-amber-500' },
          { label: 'G', value: `${Math.round(totalF)}g`, color: 'text-rose-400' },
        ].map((m) => (
          <div key={m.label}>
            <p className={cn('text-base font-black', m.color)}>{m.value}</p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>
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
                'rounded-xl border p-3 space-y-1.5',
                ml.is_completed
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-border/40 bg-muted/10 opacity-60'
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest">{meal.name}</p>
                <span className={cn('text-[10px] font-bold', ml.is_completed ? 'text-emerald-500' : 'text-muted-foreground')}>
                  {ml.is_completed ? 'Completada' : 'No completada'}
                </span>
              </div>
              {(meal.food_items ?? []).length > 0 && (
                <ul className="space-y-0.5">
                  {(meal.food_items as any[]).map((fi: any) => (
                    <li key={fi.id} className="text-[11px] text-muted-foreground">
                      {fi.foods?.name ?? '—'} — {fi.quantity} {fi.unit}
                    </li>
                  ))}
                </ul>
              )}
              {mealSwaps.length > 0 && (
                <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 px-2.5 py-2 space-y-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-sky-600">Swaps aplicados</p>
                  {mealSwaps.map((s) => (
                    <p key={s.id ?? `${s.meal_id}-${s.original_food_id}-${s.swapped_food_id}`} className="text-[10px] text-sky-700 dark:text-sky-300">
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
