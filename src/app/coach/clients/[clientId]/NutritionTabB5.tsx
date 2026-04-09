'use client'

import { useMemo, useState } from 'react'
import { eachDayOfInterval, format, subDays } from 'date-fns'
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
import { cn } from '@/lib/utils'
import { Utensils, ChevronDown, ChevronUp, Apple, Flame, Calendar, CheckCircle2, Clock } from 'lucide-react'

export type NutritionTimelineRow = {
    date: string
    log_date: string
    plan_name: string
    target_calories: number
    target_protein: number
    target_carbs: number
    target_fats: number
    mealsTotal: number
    mealsDone: number
    compliancePct: number
    mealLogs: any[]
}

type NutritionTabB5Props = {
    activeNutritionPlan: any | null | undefined
    nutritionTimeline: NutritionTimelineRow[]
    mealDetails: any[] | null | undefined
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
    const bg =
        !day.hasLog
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
    activeNutritionPlan,
    nutritionTimeline,
    mealDetails,
    chartGridColor,
    chartAxisColor,
    tooltipBgColor,
    tooltipBorderColor,
    tooltipTextColor,
}: NutritionTabB5Props) {
    const reduceMotion = useReducedMotion()
    const [openMealId, setOpenMealId] = useState<string | null>(null)

    const plan = activeNutritionPlan
    const kcal = plan?.daily_calories ?? plan?.target_calories ?? 0
    const prot = plan?.protein_g ?? plan?.target_protein ?? 0
    const carb = plan?.carbs_g ?? plan?.target_carbs ?? 0
    const fat = plan?.fats_g ?? plan?.target_fats ?? 0

    const pCal = prot * 4
    const cCal = carb * 4
    const fCal = fat * 9
    const macroKcalTotal = pCal + cCal + fCal || 1

    const pieData = [
        { name: 'Proteína', value: pCal, color: MACRO_COLORS.prot },
        { name: 'Carbos', value: cCal, color: MACRO_COLORS.carb },
        { name: 'Grasas', value: fCal, color: MACRO_COLORS.fat },
    ].filter((d) => d.value > 0)

    const heatmapDays = useMemo(() => {
        const end = new Date()
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
    }, [nutritionTimeline])

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

    const logRowsDesc = useMemo(() => {
        return [...(nutritionTimeline || [])].sort(
            (a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime()
        )
    }, [nutritionTimeline])

    return (
        <div className="space-y-6">
            {plan && (
                <GlassCard className="relative overflow-hidden border-dashed border-border/50 p-6 dark:border-white/10">
                    <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
                    <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start">
                        <div className="min-w-0 flex-1 space-y-4">
                            <div className="flex items-center gap-2">
                                <Apple className="h-4 w-4 text-primary" />
                                <h3 className="text-xs font-black uppercase tracking-widest text-primary">
                                    Plan activo · {plan.name}
                                </h3>
                            </div>
                            {kcal > 0 && (
                                <p className="text-2xl font-black tabular-nums text-foreground">
                                    {kcal}{' '}
                                    <span className="text-sm font-bold text-muted-foreground">kcal / día</span>
                                </p>
                            )}
                            {plan.instructions?.trim() && (
                                <p className="text-sm font-medium leading-relaxed text-muted-foreground whitespace-pre-wrap">
                                    {plan.instructions}
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
                                        Por kcal de macros
                                    </span>
                                </div>
                            </div>
                        </div>
                        {pieData.length > 0 && (
                            <div className="mx-auto w-full max-w-[220px] lg:mx-0 lg:w-[240px]">
                                <p className="mb-2 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground lg:text-left">
                                    Macros (kcal)
                                </p>
                                <div className="h-[200px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={pieData}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={48}
                                                outerRadius={72}
                                                paddingAngle={2}
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

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <GlassCard className="border-dashed border-border/50 p-5 dark:border-white/10">
                    <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                        <Utensils className="h-4 w-4" /> Adherencia · 30 días
                    </h3>
                    <p className="mb-3 text-[10px] font-medium text-muted-foreground">
                        Color según % de comidas completadas del día.
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
                </GlassCard>

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
                                    <ReferenceArea
                                        yAxisId="right"
                                        y1={80}
                                        y2={100}
                                        fill="#10b981"
                                        fillOpacity={0.08}
                                    />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null
                                            const row = payload[0]?.payload as NutritionTimelineRow & {
                                                shortDate: string
                                            }
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
                                                        Adherencia: {row.compliancePct}% ({row.mealsDone}/
                                                        {row.mealsTotal})
                                                    </p>
                                                    {row.plan_name && (
                                                        <p className="opacity-80 truncate max-w-[200px]">
                                                            {row.plan_name}
                                                        </p>
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
            </div>

            {mealDetails && mealDetails.length > 0 && (
                <GlassCard className="border-dashed border-border/50 p-6 dark:border-white/10">
                    <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-primary">
                        Desglose por comida
                    </h3>
                    <div className="space-y-2">
                        {mealDetails.map((meal: any) => {
                            const id = String(meal.id)
                            const open = openMealId === id
                            const items = meal.food_items || []
                            let p = 0,
                                c = 0,
                                f = 0
                            for (const fi of items) {
                                const food = fi.foods
                                if (!food) continue
                                const q = Number(fi.quantity) || 1
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
                                                {meal.name}
                                            </p>
                                            {meal.description?.trim() ? (
                                                <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
                                                    {meal.description}
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
                                                        <li className="text-[10px] italic text-muted-foreground">
                                                            Sin alimentos enlazados
                                                        </li>
                                                    ) : (
                                                        items.map((fi: any) => {
                                                            const f = fi.foods
                                                            const label = f?.name ?? 'Alimento'
                                                            return (
                                                                <li
                                                                    key={fi.id ?? label}
                                                                    className="flex flex-wrap justify-between gap-2 border-b border-border/20 pb-2 text-[10px] last:border-0 dark:border-white/5"
                                                                >
                                                                    <span className="font-bold text-foreground">
                                                                        {label}
                                                                    </span>
                                                                    <span className="font-medium text-muted-foreground">
                                                                        {fi.quantity != null
                                                                            ? `${fi.quantity}${fi.unit ? ` ${fi.unit}` : ''}`
                                                                            : ''}
                                                                        {f?.calories != null
                                                                            ? ` · ${Math.round(f.calories)} kcal`
                                                                            : ''}
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
                            {latest.log_date} · {latest.compliancePct}% · {latest.mealsDone}/{latest.mealsTotal}{' '}
                            comidas
                        </p>
                        {latest.mealLogs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Sin comidas en el log.</p>
                        ) : (
                            <div className="space-y-2">
                                {[...latest.mealLogs]
                                    .sort(
                                        (a: any, b: any) =>
                                            (a.nutrition_meals?.order_index ?? 0) -
                                            (b.nutrition_meals?.order_index ?? 0)
                                    )
                                    .map((ml: any, i: number) => (
                                        <div
                                            key={i}
                                            className={cn(
                                                'flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm',
                                                ml.is_completed
                                                    ? 'border-emerald-500/20 bg-emerald-500/10'
                                                    : 'border-border/50 bg-secondary/50 dark:border-white/10 dark:bg-white/5'
                                            )}
                                        >
                                            <span className="truncate font-bold">
                                                {ml.nutrition_meals?.name || `Comida ${i + 1}`}
                                            </span>
                                            {ml.is_completed ? (
                                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                                            ) : (
                                                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            )}
                                        </div>
                                    ))}
                            </div>
                        )}
                    </GlassCard>
                )
            })()}

            <GlassCard className="border-dashed border-border/50 p-6 dark:border-white/10">
                <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-primary">
                    Historial de logs (30)
                </h3>
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
                                    <th className="pb-2 pr-3">Adher.</th>
                                    <th className="pb-2">Comidas</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logRowsDesc.slice(0, 30).map((row) => (
                                    <tr
                                        key={row.log_date}
                                        className={cn(
                                            'border-b border-border/30 dark:border-white/5',
                                            row.compliancePct < 60 && 'border-l-2 border-l-rose-500 bg-rose-500/5'
                                        )}
                                    >
                                        <td className="py-2.5 pr-3 font-mono text-foreground normal-case">
                                            {row.log_date}
                                        </td>
                                        <td className="max-w-[140px] truncate py-2.5 pr-3 normal-case font-semibold text-muted-foreground">
                                            {row.plan_name || '—'}
                                        </td>
                                        <td className="py-2.5 pr-3 tabular-nums">
                                            {row.target_calories || '—'}
                                        </td>
                                        <td className="py-2.5 pr-3">
                                            <span
                                                className={cn(
                                                    row.compliancePct >= 80 && 'text-emerald-500',
                                                    row.compliancePct >= 60 &&
                                                        row.compliancePct < 80 &&
                                                        'text-amber-500',
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
        </div>
    )
}
