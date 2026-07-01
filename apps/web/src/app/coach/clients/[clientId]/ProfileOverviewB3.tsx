'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
    Flame,
    Star,
    Dumbbell,
    PieChart,
    Scale,
    CalendarRange,
    Activity,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    Pencil,
    Camera,
    HeartPulse,
    PersonStanding,
    PencilLine,
    Droplet,
    Footprints,
    Moon,
    ChevronDown,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { ProgressRing } from '@/components/ui/progress-ring'
import { AppOnlyBadge } from '@/components/AppOnlyBadge'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { MetricInfo, type MetricTerm } from '@/components/ui/metric-info'
import { cn } from '@/lib/utils'
import { updateClientBiometrics } from './_actions/client-detail.actions'
import {
    buildProfileActivityCalendarData,
    longestActivityStreakFromCalendar,
    countWorkoutDaysInRange,
} from './profileOverviewUtils'
import { ProfileProgramSummaryCard } from './ProfileProgramSummaryCard'
import { ProfileCheckInSnapshot } from './ProfileCheckInSnapshot'
import type { DailyHabitRow, DailyHabitsSummary } from './profileDataHelpers'
import { subDays } from 'date-fns'

type ComplianceShape = {
    workoutsThisWeek?: number
    workoutsPrevWeek?: number
    workoutsTarget?: number
    nutritionWeeklyAvgPct?: number
    nutritionPrevWeeklyAvgPct?: number
    checkInCompliancePercent?: number
    checkInCompliancePercentWeekAgo?: number
    currentStreak?: number
    planCurrentWeek?: number
    planTotalWeeks?: number
    planDaysRemaining?: number
    nutritionCompliancePercent?: number
}

type CheckInRow = {
    id?: string
    created_at: string
    weight?: number | null
    energy_level?: number | null
    notes?: string | null
    reviewed_at?: string | null
    front_photo_url?: string | null
    side_photo_url?: string | null
    back_photo_url?: string | null
}

type ProfileOverviewB3Props = {
    workoutHistory: any[]
    checkIns: CheckInRow[]
    compliance: ComplianceShape
    clientId: string
    /** Programa activo del alumno — alimenta la card "Programa". */
    activeProgram: any | null | undefined
    isNutritionAtRisk?: boolean
    /** Último check-in (ya ordenado en el dashboard) para la card de snapshot. */
    lastCheckIn?: CheckInRow | null
    /** Check-ins con fotos (máx. 3) para "Evolución visual". */
    checkInsWithPhotos?: CheckInRow[]
    /** Peso actual + variación semanal (calculados en el dashboard). */
    currentWeight?: number
    weeklyWeightVariation?: number
    /** Biometría inicial (intake) — precarga el editor de biometría. */
    initialHeightCm?: number | null
    initialWeightKg?: number | null
    /** Sexo del intake — precarga el selector del editor. Default `null`. */
    initialSex?: 'male' | 'female' | 'other' | null
    /** Entitlements de módulos de pago (espejo del gate server-side). */
    moduleFlags?: { cardio: boolean; movement: boolean; bodycomp: boolean }
    /** Deep-link a la Zona A (Progreso) del hogar único de nutrición. No recomputa
     *  el % — solo navega; el valor mostrado es el mismo de `compliance`. */
    onViewNutrition?: () => void
    /** Navega a la pestaña Progreso (historial de check-ins). */
    onViewProgress?: () => void
    /** Navega a la pestaña Programa (card de programa clickeable). */
    onOpenProgram?: () => void
    /** Resumen de hábitos diarios (agua/pasos/sueño/ayuno) — hoy + prom. 7d. */
    dailyHabitsSummary?: DailyHabitsSummary
    /** Filas crudas de hábitos (ventana 7d, DESC) — alimenta el detalle expandible. */
    dailyHabits?: DailyHabitRow[]
}

const ringSize = 84

function SectionTitle({
    children,
    icon: Icon,
}: {
    children: React.ReactNode
    icon?: typeof Activity
}) {
    return (
        <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-sport-600">
            {Icon ? <Icon className="h-4 w-4" /> : null}
            {children}
        </h3>
    )
}

export function ProfileOverviewB3({
    workoutHistory,
    checkIns,
    compliance,
    clientId,
    activeProgram,
    isNutritionAtRisk = false,
    lastCheckIn,
    checkInsWithPhotos = [],
    currentWeight = 0,
    weeklyWeightVariation = 0,
    initialHeightCm,
    initialWeightKg,
    initialSex = null,
    moduleFlags,
    onViewNutrition,
    onViewProgress,
    onOpenProgram,
    dailyHabitsSummary,
    dailyHabits,
}: ProfileOverviewB3Props) {
    const calendarData = useMemo(
        () => buildProfileActivityCalendarData(workoutHistory, checkIns, 371),
        [workoutHistory, checkIns]
    )

    const longestStreak = useMemo(
        () => longestActivityStreakFromCalendar(calendarData),
        [calendarData]
    )

    const target = Math.max(1, compliance.workoutsTarget ?? 1)
    const wThis = compliance.workoutsThisWeek ?? 0
    const wPrev = compliance.workoutsPrevWeek ?? 0
    const workoutPct = Math.min(100, Math.round((wThis / target) * 100))
    const prevWorkoutPct = Math.min(100, Math.round((wPrev / target) * 100))
    // Delta vs período anterior — null si no hay valor previo REAL (no se fabrica).
    const workoutDelta =
        compliance.workoutsPrevWeek != null ? workoutPct - prevWorkoutPct : null

    const nutAvg = compliance.nutritionWeeklyAvgPct ?? 0
    const nutPrev = compliance.nutritionPrevWeeklyAvgPct ?? 0
    const nutDelta =
        compliance.nutritionPrevWeeklyAvgPct != null ? nutAvg - nutPrev : null

    const checkPct = compliance.checkInCompliancePercent ?? 0
    const checkPctWeekAgo = compliance.checkInCompliancePercentWeekAgo ?? 0
    const checkDelta =
        compliance.checkInCompliancePercentWeekAgo != null ? checkPct - checkPctWeekAgo : null

    const planCur = compliance.planCurrentWeek ?? 1
    const planTot = Math.max(1, compliance.planTotalWeeks ?? 4)

    const now = new Date()
    const monthStart = subDays(now, 30)
    const sessions30d = countWorkoutDaysInRange(workoutHistory, monthStart, now)

    const sortedCi = useMemo(
        () =>
            [...(checkIns || [])].sort(
                (a, b) =>
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            ),
        [checkIns]
    )
    const weightDelta30d = useMemo(() => {
        if (sortedCi.length < 2) return null
        const latest = sortedCi[0]?.weight
        const baseline = sortedCi.find(
            (c) => new Date(c.created_at).getTime() <= monthStart.getTime()
        )?.weight
        if (latest == null || baseline == null) return null
        return Number((latest - baseline).toFixed(1))
    }, [sortedCi, monthStart])

    const primaryHex = 'var(--sport-500)'
    const emeraldHex = 'var(--success-500)'
    const redHex = 'var(--danger-500)'
    const amberHex = 'var(--warning-500)'

    const nutColor = nutAvg >= 70 ? emeraldHex : nutAvg >= 50 ? amberHex : redHex

    const kpiItems: {
        icon: typeof Star
        label: string
        value: string
        hint: string
        tone: 'ember' | 'sport' | 'success'
        /** Término del glosario para el ícono de explicabilidad (opcional). */
        infoTerm?: MetricTerm
    }[] = [
        {
            icon: Flame,
            label: 'Mejor racha',
            value: `${longestStreak} día${longestStreak === 1 ? '' : 's'}`,
            hint: 'histórico',
            tone: 'ember',
        },
        {
            icon: Dumbbell,
            label: 'Sesiones',
            value: `${sessions30d}`,
            hint: 'últimos 30 días',
            tone: 'sport',
        },
        {
            icon: PieChart,
            label: 'Adherencia entreno',
            value: `${workoutPct}%`,
            hint:
                workoutDelta == null
                    ? 'esta semana'
                    : workoutDelta >= 0
                      ? `+${workoutDelta}% vs sem. ant.`
                      : `${workoutDelta}% vs sem. ant.`,
            tone: 'sport',
            infoTerm: 'adherencia',
        },
        {
            icon: Scale,
            label: 'Δ Peso (30d)',
            value: weightDelta30d == null ? '—' : `${weightDelta30d > 0 ? '+' : ''}${weightDelta30d} kg`,
            hint: 'check-ins',
            tone: weightDelta30d != null && weightDelta30d > 0 ? 'ember' : 'success',
        },
        {
            icon: CalendarRange,
            label: 'Sem. programa',
            value: `${planCur} / ${planTot}`,
            hint: 'ciclo activo',
            tone: 'sport',
        },
    ]

    const kpiToneClass: Record<'ember' | 'sport' | 'success', string> = {
        ember: 'bg-[var(--ember-100)] text-[var(--ember-700)]',
        sport: 'bg-sport-100 text-sport-600',
        success: 'bg-[var(--success-100)] text-[var(--success-600)]',
    }

    // Módulos de pago — gateados por entitlement (espejo del gate server-side).
    const moduleCards = [
        moduleFlags?.cardio
            ? { key: 'cardio', label: 'Cardio', href: `/coach/cardio/${clientId}`, Icon: HeartPulse }
            : null,
        moduleFlags?.movement
            ? { key: 'movement', label: 'Movimiento', href: `/coach/movement/${clientId}`, Icon: PersonStanding }
            : null,
        moduleFlags?.bodycomp
            ? { key: 'bodycomp', label: 'Composición', href: `/coach/clients/${clientId}/bodycomp`, Icon: Scale }
            : null,
    ].filter(
        (m): m is { key: string; label: string; href: string; Icon: typeof HeartPulse } =>
            m !== null
    )

    return (
        <div className="space-y-6">
            {/* Desktop-ancho (standalone): 2 columnas por container-query @5xl/ficha (≥1024px
                del contenedor, NO del viewport). En el panel angosto del master-detail el mismo
                contenedor mide < 1024px → grid-cols-1 (una sola columna). */}
            <div className="grid grid-cols-1 gap-6 @5xl/ficha:grid-cols-2 @5xl/ficha:items-start">
                {/* ===== COL IZQ — actividad / entreno ===== */}
                <div className="space-y-6">
            {/* ===== Cumplimiento semanal ===== */}
            <Card padding="md">
                <SectionTitle>Cumplimiento semanal</SectionTitle>
                <div className="grid grid-cols-3 gap-2">
                    <ComplianceRing
                        label="Entreno"
                        percentage={workoutPct}
                        delta={workoutDelta}
                        pathColor={primaryHex}
                    />
                    <ComplianceRing
                        label="Nutrición"
                        percentage={Math.min(100, nutAvg)}
                        delta={nutDelta}
                        pathColor={nutColor}
                        onClick={onViewNutrition}
                    />
                    <ComplianceRing
                        label="Check-in"
                        percentage={checkPct}
                        delta={checkDelta}
                        pathColor={checkPct >= 70 ? emeraldHex : checkPct >= 40 ? amberHex : redHex}
                    />
                </div>
            </Card>

            {/* ===== 5 KPIs ===== */}
            <div className="grid grid-cols-2 gap-3">
                {kpiItems.map((item, i) => (
                    <motion.div
                        key={item.label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.25 }}
                    >
                        <Card padding="md" className="h-full flex-row items-center gap-3">
                            <div
                                className={cn(
                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                                    kpiToneClass[item.tone]
                                )}
                            >
                                <item.icon className="h-[18px] w-[18px]" />
                            </div>
                            <div className="min-w-0">
                                <p className="font-display text-lg font-black leading-tight text-strong">
                                    {item.value}
                                </p>
                                <p className="mt-0.5 flex items-center gap-1 text-[10.5px] font-medium text-muted">
                                    <span>
                                        {item.label} · {item.hint}
                                    </span>
                                    {item.infoTerm ? (
                                        <MetricInfo term={item.infoTerm} />
                                    ) : null}
                                </p>
                            </div>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* ===== Programa ===== */}
            <div>
                <SectionTitle>Programa</SectionTitle>
                <ProfileProgramSummaryCard
                    activeProgram={activeProgram}
                    compliance={compliance}
                    isNutritionAtRisk={isNutritionAtRisk}
                    clientId={clientId}
                    onViewNutrition={onViewNutrition}
                    onOpenProgram={onOpenProgram}
                />
            </div>

            {/* ===== Métricas clave ===== */}
            <div>
                <SectionTitle icon={Activity}>Métricas clave</SectionTitle>
                <Card padding="md">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex gap-6">
                            <div>
                                <p className="font-display text-[22px] font-black leading-none text-strong">
                                    {currentWeight}
                                    <span className="text-xs font-bold text-muted"> kg</span>
                                </p>
                                <p className="mt-1.5 text-[11px] text-muted">Peso actual</p>
                            </div>
                            <div>
                                <p
                                    className={cn(
                                        'flex items-center gap-1 font-display text-[22px] font-black leading-none',
                                        weeklyWeightVariation <= 0
                                            ? 'text-[var(--success-600)]'
                                            : 'text-[var(--ember-700)]'
                                    )}
                                >
                                    {weeklyWeightVariation > 0 ? '+' : ''}
                                    {weeklyWeightVariation.toFixed(1)}
                                    <span className="text-xs font-bold"> kg</span>
                                    {weeklyWeightVariation > 0 ? (
                                        <ArrowUpRight className="h-4 w-4 text-[var(--ember-600)]" />
                                    ) : weeklyWeightVariation < 0 ? (
                                        <ArrowDownRight className="h-4 w-4 text-[var(--success-500)]" />
                                    ) : (
                                        <Minus className="h-4 w-4 text-muted" />
                                    )}
                                </p>
                                <p className="mt-1.5 text-[11px] text-muted">Variación semanal</p>
                            </div>
                        </div>
                        <BiometricsEditDialog
                            clientId={clientId}
                            initialHeightCm={initialHeightCm ?? null}
                            initialWeightKg={initialWeightKg ?? null}
                            initialSex={initialSex}
                        />
                    </div>
                </Card>
            </div>
                </div>
                {/* ===== COL DER — seguimiento / media ===== */}
                <div className="space-y-6">
            {/* ===== Hábitos diarios (mini-widget · cosecha Fase 0) ===== */}
            <HabitsMiniWidget summary={dailyHabitsSummary} rows={dailyHabits} />

            {/* ===== Último check-in ===== */}
            <ProfileCheckInSnapshot
                checkIn={lastCheckIn}
                clientId={clientId}
                onViewHistory={onViewProgress ?? (() => {})}
            />

            {/* ===== Evolución visual ===== */}
            <Card padding="md">
                <SectionTitle icon={Camera}>Evolución visual</SectionTitle>
                <div className="mb-4">
                    <AppOnlyBadge>
                        Mirá las fotos con zoom y deslizá entre ellas en la app de EVA
                    </AppOnlyBadge>
                </div>
                {checkInsWithPhotos.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                        {checkInsWithPhotos.map((c, i) => {
                            const photo = c.front_photo_url || c.side_photo_url || c.back_photo_url
                            if (!photo) return null
                            return (
                                <div
                                    key={c.id ?? i}
                                    className="group relative aspect-[3/4] overflow-hidden rounded-sm bg-surface-sunken"
                                >
                                    <Image
                                        src={photo}
                                        alt="Progreso"
                                        fill
                                        sizes="(max-width: 768px) 33vw, 200px"
                                        unoptimized
                                        className="object-cover transition-transform duration-500 group-hover:scale-110"
                                    />
                                    <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 via-transparent to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white">
                                            {new Date(c.created_at).toLocaleDateString('es-ES', {
                                                day: '2-digit',
                                                month: 'short',
                                            })}
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="rounded-sm bg-surface-sunken py-8 text-center">
                        <Camera className="mx-auto mb-2 h-8 w-8 text-[var(--ink-300)]" />
                        <p className="text-sm font-medium text-muted">
                            Sin fotos recientes de check-in.
                        </p>
                    </div>
                )}
            </Card>

            {/* ===== Módulos (deep-links de pago · gateados por entitlement) ===== */}
            {moduleCards.length > 0 && (
                <div>
                    <SectionTitle>Módulos</SectionTitle>
                    <div className="flex gap-2">
                        {moduleCards.map((m) => (
                            <Link
                                key={m.key}
                                href={m.href}
                                className="flex flex-1 flex-col items-center gap-1.5 rounded-md border border-subtle bg-surface-card px-1 py-3 transition-colors hover:bg-surface-sunken"
                            >
                                <m.Icon className="h-5 w-5 text-sport-600" />
                                <span className="text-[11.5px] font-bold text-body">{m.label}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
                </div>
            </div>

            {/* ===== Editar plan (full-width, fuera del grid de 2 columnas) ===== */}
            <Link
                href={`/coach/builder/${clientId}`}
                className={cn(buttonVariants({ variant: 'sport', size: 'lg' }), 'w-full')}
            >
                <PencilLine className="h-5 w-5" />
                Editar plan
            </Link>
        </div>
    )
}

type SexValue = 'male' | 'female' | 'other' | null

const SEX_OPTIONS: { value: SexValue; label: string }[] = [
    { value: 'male', label: 'Masculino' },
    { value: 'female', label: 'Femenino' },
    { value: 'other', label: 'Otro' },
    { value: null, label: 'Sin especificar' },
]

/**
 * Editor de biometría inicial (altura / peso / sexo) del alumno.
 * Persiste vía la server action `updateClientBiometrics` (write-path `client_intake`,
 * corre como coach `authenticated`). Al guardar con éxito: cierra el modal +
 * `router.refresh()` para que el IMC/TDEE reaparezca con el dato nuevo.
 * Theme-aware (tokens semánticos), accesible (labels + radiogroup).
 */
function BiometricsEditDialog({
    clientId,
    initialHeightCm,
    initialWeightKg,
    initialSex,
}: {
    clientId: string
    initialHeightCm: number | null
    initialWeightKg: number | null
    initialSex: SexValue
}) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const [height, setHeight] = useState<string>(
        initialHeightCm != null ? String(initialHeightCm) : ''
    )
    const [weight, setWeight] = useState<string>(
        initialWeightKg != null ? String(initialWeightKg) : ''
    )
    const [sex, setSex] = useState<SexValue>(initialSex)

    // Re-sincroniza el form con las props cada vez que se abre (evita quedarse con
    // valores viejos si el dato del intake cambió por otra vía).
    function handleOpenChange(next: boolean) {
        if (next) {
            setHeight(initialHeightCm != null ? String(initialHeightCm) : '')
            setWeight(initialWeightKg != null ? String(initialWeightKg) : '')
            setSex(initialSex)
            setError(null)
        }
        setOpen(next)
    }

    function parseNum(raw: string): number | null {
        const trimmed = raw.trim()
        if (trimmed === '') return null
        const n = Number(trimmed)
        return Number.isFinite(n) ? n : null
    }

    function handleSave() {
        setError(null)
        const input = {
            heightCm: parseNum(height),
            weightKg: parseNum(weight),
            sex,
        }
        startTransition(async () => {
            const res = await updateClientBiometrics(clientId, input)
            if (res.ok) {
                setOpen(false)
                router.refresh()
            } else {
                setError(res.error || 'No se pudo guardar la biometría.')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger
                render={
                    <Button
                        variant="secondary"
                        size="icon-sm"
                        aria-label="Editar biometría inicial"
                    >
                        <Pencil className="h-4 w-4" />
                    </Button>
                }
            />
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="font-display text-xl font-black uppercase tracking-tighter">
                        Editar biometría inicial
                    </DialogTitle>
                </DialogHeader>

                <p className="flex flex-wrap items-center gap-1 text-[11px] font-medium leading-relaxed text-muted">
                    <span>Necesario para calcular IMC</span>
                    <MetricInfo term="imc" />
                    <span>y gasto energético (TDEE)</span>
                    <MetricInfo term="tdee" />
                </p>

                <div className="grid gap-4 py-2">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label
                            htmlFor="bio-height"
                            className="text-right text-xs font-bold uppercase tracking-widest"
                        >
                            Altura
                        </Label>
                        <Input
                            id="bio-height"
                            type="number"
                            inputMode="numeric"
                            min={50}
                            max={260}
                            value={height}
                            onChange={(e) => setHeight(e.target.value)}
                            className="col-span-3"
                            placeholder="cm"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label
                            htmlFor="bio-weight"
                            className="text-right text-xs font-bold uppercase tracking-widest"
                        >
                            Peso inicial
                        </Label>
                        <Input
                            id="bio-weight"
                            type="number"
                            inputMode="decimal"
                            min={20}
                            max={400}
                            step="0.1"
                            value={weight}
                            onChange={(e) => setWeight(e.target.value)}
                            className="col-span-3"
                            placeholder="kg"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-start gap-4">
                        <span
                            id="bio-sex-label"
                            className="pt-1.5 text-right text-xs font-bold uppercase tracking-widest"
                        >
                            Sexo
                        </span>
                        <div
                            role="radiogroup"
                            aria-labelledby="bio-sex-label"
                            className="col-span-3 grid grid-cols-2 gap-1.5"
                        >
                            {SEX_OPTIONS.map((opt) => {
                                const selected = sex === opt.value
                                return (
                                    <button
                                        key={opt.label}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        onClick={() => setSex(opt.value)}
                                        className={cn(
                                            'rounded-control border px-2 py-1.5 text-[11px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                                            selected
                                                ? 'border-sport-500 bg-sport-100 text-sport-600'
                                                : 'border-subtle bg-surface-sunken text-body hover:bg-surface-card'
                                        )}
                                    >
                                        {opt.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {error && (
                    <p
                        role="alert"
                        className="text-[11px] font-bold text-[var(--danger-600)]"
                    >
                        {error}
                    </p>
                )}

                <div className="flex justify-end gap-3">
                    <DialogClose
                        render={
                            <Button
                                variant="secondary"
                                disabled={isPending}
                                className="text-[10px] font-black uppercase tracking-widest"
                            >
                                Cancelar
                            </Button>
                        }
                    />
                    <Button
                        variant="sport"
                        onClick={handleSave}
                        disabled={isPending}
                        className="text-[10px] font-black uppercase tracking-widest"
                    >
                        {isPending ? 'Guardando…' : 'Guardar'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

function ComplianceRing({
    label,
    percentage,
    delta,
    pathColor,
    onClick,
}: {
    label: string
    percentage: number
    /** Delta en pts vs período anterior; `null` ⇒ sin dato previo (se omite el label). */
    delta: number | null
    pathColor: string
    onClick?: () => void
}) {
    const Wrapper = onClick ? 'button' : 'div'
    return (
        <Wrapper
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={cn(
                'flex w-full flex-col items-center gap-1.5',
                onClick &&
                    'rounded-card p-1 transition-colors hover:bg-surface-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]'
            )}
        >
            <ProgressRing value={percentage} size={ringSize} stroke={8} color={pathColor} />
            <div className="space-y-0.5 text-center">
                <p className="text-[12.5px] font-bold text-strong">{label}</p>
                {delta != null ? (
                    <p
                        className={cn(
                            'text-[10.5px] font-bold',
                            delta > 0
                                ? 'text-[var(--success-600)]'
                                : delta < 0
                                  ? 'text-[var(--danger-600)]'
                                  : 'text-subtle'
                        )}
                    >
                        {delta === 0
                            ? '— vs sem. ant.'
                            : `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta)} pts`}
                    </p>
                ) : null}
            </div>
        </Wrapper>
    )
}

// ── Formateadores de hábitos (unidades explícitas · null-safe) ──
function fmtWaterL(ml: number | null | undefined): string | null {
    if (ml == null) return null
    const l = ml / 1000
    return `${Number.isInteger(l) ? l : l.toFixed(1)} L`
}
function fmtSteps(steps: number | null | undefined): string | null {
    if (steps == null) return null
    return `${Math.round(steps).toLocaleString('es-CL')}`
}
function fmtHours(h: number | null | undefined): string | null {
    if (h == null) return null
    return `${Number.isInteger(h) ? h : h.toFixed(1)} h`
}
/** Parseo local de `log_date` (YYYY-MM-DD) para evitar corrimiento de día por TZ. */
function fmtHabitDate(logDate: string): string {
    const [y, m, d] = logDate.split('-').map(Number)
    if (!y || !m || !d) return logDate
    return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
    })
}

/**
 * Mini-widget de hábitos diarios en el Resumen del coach.
 * Fila compacta con los valores de HOY (agua/pasos/sueño) — solo los que tienen
 * dato — y detalle expandible de la ventana de 7 días (incluye ayuno + suplementos).
 * Progressive disclosure: la densidad vive dentro del <details>, no en la fila.
 * Theme-aware (tokens semánticos), degrada con gracia sin registro.
 */
function HabitsMiniWidget({
    summary,
    rows,
}: {
    summary?: DailyHabitsSummary
    rows?: DailyHabitRow[]
}) {
    const [open, setOpen] = useState(false)

    // Sin datos en la ventana → omitir el widget (no ensuciar el overview).
    if (!summary || summary.daysLogged === 0) return null

    const { today, avg, daysLogged } = summary
    const hasToday = today != null

    const cells: {
        icon: typeof Droplet
        label: string
        todayValue: string | null
        avgValue: string | null
    }[] = [
        {
            icon: Droplet,
            label: 'Agua',
            todayValue: fmtWaterL(today?.water_ml),
            avgValue: fmtWaterL(avg.water_ml),
        },
        {
            icon: Footprints,
            label: 'Pasos',
            todayValue: fmtSteps(today?.steps),
            avgValue: fmtSteps(avg.steps),
        },
        {
            icon: Moon,
            label: 'Sueño',
            todayValue: fmtHours(today?.sleep_hours),
            avgValue: fmtHours(avg.sleep_hours),
        },
    ]

    const anyTodayValue = cells.some((c) => c.todayValue != null)
    const detailRows = (rows ?? []).slice(0, 7)
    const canExpand = detailRows.length > 0

    return (
        <Card padding="md">
            <div className="mb-3 flex items-center justify-between gap-2">
                <SectionTitle icon={Droplet}>Hábitos diarios</SectionTitle>
                <span className="text-[10px] font-medium uppercase tracking-widest text-subtle">
                    {hasToday && anyTodayValue ? 'Hoy' : 'prom. 7d'}
                </span>
            </div>

            {/* Fila compacta — solo hábitos con dato hoy (o promedios como fallback). */}
            <div className="grid grid-cols-3 gap-2">
                {cells.map((c) => {
                    const showToday = hasToday && c.todayValue != null
                    const main = showToday ? c.todayValue : c.avgValue
                    return (
                        <div
                            key={c.label}
                            className="flex flex-col items-center gap-1 rounded-control border border-subtle bg-surface-sunken px-1 py-2.5 text-center"
                        >
                            <c.icon className="h-4 w-4 text-sport-600" />
                            <p className="font-display text-base font-black leading-none text-strong tabular-nums">
                                {main ?? '—'}
                            </p>
                            <p className="text-[9px] font-medium uppercase tracking-widest text-muted">
                                {c.label}
                                {!showToday && main != null ? ' · prom.' : ''}
                            </p>
                        </div>
                    )
                })}
            </div>

            {/* Hint cuando no hay registro de HOY → el coach ve promedios, no ceros. */}
            {(!hasToday || !anyTodayValue) && (
                <p className="mt-2 text-[10.5px] font-medium text-muted">
                    Sin registro hoy · mostrando promedio de {daysLogged} día
                    {daysLogged === 1 ? '' : 's'} con datos (7d)
                </p>
            )}

            {/* Suplementos declarados hoy (si los hay) */}
            {hasToday && today?.supplements && today.supplements.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-subtle">
                        Suplementos
                    </span>
                    {today.supplements.map((s, i) => (
                        <span
                            key={`${s}-${i}`}
                            className="rounded-[var(--radius-xs)] bg-surface-sunken px-2 py-0.5 text-[10px] font-medium text-muted"
                        >
                            {s}
                        </span>
                    ))}
                </div>
            )}

            {/* Detalle 7 días — progressive disclosure */}
            {canExpand && (
                <>
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={open}
                        className="mt-3 flex w-full items-center justify-center gap-1 rounded-control py-1.5 text-[10px] font-black uppercase tracking-widest text-sport-600 transition-colors hover:bg-surface-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    >
                        {open ? 'Ocultar' : 'Ver 7 días'}
                        <ChevronDown
                            className={cn(
                                'h-3.5 w-3.5 transition-transform',
                                open && 'rotate-180'
                            )}
                        />
                    </button>

                    {open && (
                        <div className="mt-2 overflow-hidden rounded-control border border-subtle">
                            <table className="w-full text-[11px]">
                                <thead>
                                    <tr className="bg-surface-sunken text-[9px] uppercase tracking-widest text-subtle">
                                        <th className="px-2 py-1.5 text-left font-bold">Día</th>
                                        <th className="px-2 py-1.5 text-right font-bold">Agua</th>
                                        <th className="px-2 py-1.5 text-right font-bold">Pasos</th>
                                        <th className="px-2 py-1.5 text-right font-bold">Sueño</th>
                                        <th className="px-2 py-1.5 text-right font-bold">Ayuno</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detailRows.map((r) => (
                                        <tr
                                            key={r.log_date}
                                            className="border-t border-subtle text-body"
                                        >
                                            <td className="px-2 py-1.5 text-left font-medium text-muted">
                                                {fmtHabitDate(r.log_date)}
                                            </td>
                                            <td className="px-2 py-1.5 text-right tabular-nums text-strong">
                                                {fmtWaterL(r.water_ml) ?? '—'}
                                            </td>
                                            <td className="px-2 py-1.5 text-right tabular-nums text-strong">
                                                {fmtSteps(r.steps) ?? '—'}
                                            </td>
                                            <td className="px-2 py-1.5 text-right tabular-nums text-strong">
                                                {fmtHours(r.sleep_hours) ?? '—'}
                                            </td>
                                            <td className="px-2 py-1.5 text-right tabular-nums text-strong">
                                                {fmtHours(r.fasting_hours) ?? '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* Explicabilidad inline */}
            <p className="mt-3 text-[9.5px] leading-relaxed text-subtle">
                prom. 7d = promedio de los días CON registro. Ayuno = horas de ayuno
                declaradas por el alumno.
            </p>
        </Card>
    )
}
