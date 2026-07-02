'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
    ChevronRight,
    Dumbbell,
    Timer,
    Gauge,
    Clock,
    PlayCircle,
    Target,
    Weight,
    ClipboardX,
    Plus,
    PencilLine,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
    Sheet,
    SheetContent,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet'
import { mondayBasedDayOfWeek, parseProgramPhases } from './profileProgramUtils'
import {
    filterPlansForStructureView,
    uniqueMuscleGroupsFromBlocks,
} from './profileProgramStructureUtils'
import { resolveEffectiveWeekVariant } from '@/lib/workout/programWeekVariant'
import { cn } from '@/lib/utils'

// L–D microciclo (1 = Lunes … 7 = Domingo).
const DAY_LABELS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Ficha tokens (transcripción inline del diseño). Semánticos → siguen el tema (claro/oscuro).
// Excepción: el header "PROGRAMA ACTIVO" es la única card intencionalmente inversa (dark en
// ambos temas), así que usa tokens inverse literales inline en vez de estas consts.
const CANVAS = 'var(--surface-app)'
const CARD = 'var(--surface-card)'
const CARD_BORDER = 'var(--border-subtle)'
const SUNKEN = 'var(--surface-sunken)'
const TXT = 'var(--text-strong)'
const TXT_MUTED = 'var(--text-muted)'

// Paleta de fase (fallback cuando program_phases no trae color) + dot muscular.
const PHASE_PALETTE = [
    'var(--sport-500)',
    'var(--ember-500)',
    'var(--aqua-500)',
    'var(--success-500)',
    'var(--warning-500)',
]

function muscleDotColor(group: string | null | undefined): string {
    if (!group) return 'var(--sport-500)'
    let h = 0
    for (let i = 0; i < group.length; i++) h = (h * 31 + group.charCodeAt(i)) >>> 0
    return PHASE_PALETTE[h % PHASE_PALETTE.length]!
}

type ProgramTabB7Props = {
    clientId: string
    activeProgram: any | null | undefined
    // Cargado por el padre; el sheet del diseño nuevo no muestra historial → no se consume aquí.
    workoutHistory?: any[]
    planCurrentWeek: number
    planTotalWeeks: number
    planDaysRemaining: number
}

function useSheetSide(): 'bottom' | 'right' {
    const [side, setSide] = useState<'bottom' | 'right'>('right')
    useEffect(() => {
        const q = window.matchMedia('(max-width: 767px)')
        const fn = () => setSide(q.matches ? 'bottom' : 'right')
        fn()
        q.addEventListener('change', fn)
        return () => q.removeEventListener('change', fn)
    }, [])
    return side
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <h3
            className="font-display"
            style={{
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: TXT,
                margin: '0 0 10px',
            }}
        >
            {children}
        </h3>
    )
}

function DarkChip({ children }: { children: React.ReactNode }) {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 20,
                padding: '0 8px',
                borderRadius: 999,
                border: `1px solid var(--border-inverse)`,
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-on-dark-muted)',
            }}
        >
            {children}
        </span>
    )
}

export function ProgramTabB7({
    clientId,
    activeProgram,
    planCurrentWeek,
    planTotalWeeks,
    planDaysRemaining,
}: ProgramTabB7Props) {
    const sheetSide = useSheetSide()
    const [sheetOpen, setSheetOpen] = useState(false)
    const [sheetBlock, setSheetBlock] = useState<any | null>(null)

    const todayDow = mondayBasedDayOfWeek(new Date())
    const [openDow, setOpenDow] = useState<number | null>(todayDow)

    const structure = (activeProgram?.program_structure_type as 'weekly' | 'cycle' | null) || 'weekly'
    const isWeekly = structure === 'weekly'

    const abMode = !!activeProgram?.ab_mode
    // Variante EFECTIVA (cae a la que tenga planes si la del ciclo está vacía).
    const activeVariant = useMemo(
        () =>
            resolveEffectiveWeekVariant(
                activeProgram,
                (activeProgram?.workout_plans as { week_variant?: string | null }[] | undefined) ?? [],
                planCurrentWeek > 0 ? planCurrentWeek : null,
                new Date()
            ),
        [activeProgram, planCurrentWeek]
    )

    const plansView = useMemo(
        () =>
            filterPlansForStructureView(activeProgram?.workout_plans, structure, {
                abMode,
                activeVariant,
            }),
        [activeProgram?.workout_plans, structure, abMode, activeVariant]
    )

    const planByDow = useMemo(() => {
        const m = new Map<number, any>()
        for (const p of plansView) {
            const d = Number(p.day_of_week)
            if (!m.has(d)) m.set(d, p)
        }
        return m
    }, [plansView])

    const phases = useMemo(
        () => parseProgramPhases(activeProgram?.program_phases),
        [activeProgram?.program_phases]
    )

    const weeksRepeat = Math.max(1, Number(activeProgram?.weeks_to_repeat) || 1)
    const hasSchedule = !!(activeProgram?.start_date && activeProgram?.end_date)
    const weekProgressPct =
        hasSchedule && planTotalWeeks > 0
            ? Math.min(100, Math.round((planCurrentWeek / planTotalWeeks) * 100))
            : 0

    // Semanas a graficar en "Estructura del ciclo": el total programado; si no hay fechas, cae a las
    // semanas del ciclo (weeks_to_repeat). Solo se renderiza si hay más de 1.
    const structureWeeks = planTotalWeeks > 1 ? planTotalWeeks : weeksRepeat > 1 ? weeksRepeat : 0
    const totalPhaseWeeks = phases.reduce((a, p) => a + Math.max(1, p.weeks), 0)

    const phaseForWeek = (wk: number) => {
        if (!phases.length) return { name: '', color: 'var(--sport-500)' as string }
        let acc = 0
        for (let i = 0; i < phases.length; i++) {
            acc += Math.max(1, phases[i]!.weeks)
            if (wk <= acc) return { name: phases[i]!.name, color: phases[i]!.color || PHASE_PALETTE[i % PHASE_PALETTE.length]! }
        }
        const last = phases.length - 1
        return { name: phases[last]!.name, color: phases[last]!.color || PHASE_PALETTE[last % PHASE_PALETTE.length]! }
    }

    const openBlock = (block: any) => {
        setSheetBlock(block)
        setSheetOpen(true)
    }

    // ---------- Empty state ----------
    if (!activeProgram) {
        return (
            <div style={{ background: CANVAS, borderRadius: 'var(--radius-card)' }} className="p-4 md:p-6">
                <div
                    style={{ background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: 'var(--radius-card)' }}
                    className="flex flex-col items-center px-6 py-10 text-center"
                >
                    <div
                        style={{ background: SUNKEN, color: TXT_MUTED }}
                        className="mb-3 flex h-14 w-14 items-center justify-center rounded-full"
                    >
                        <ClipboardX className="h-6 w-6" />
                    </div>
                    <p className="font-display text-base font-extrabold" style={{ color: TXT }}>
                        Sin programa asignado
                    </p>
                    <p className="mt-1 text-sm font-medium" style={{ color: TXT_MUTED }}>
                        Este alumno no tiene un plan de entrenamiento activo.
                    </p>
                    <Link
                        href={`/coach/builder/${clientId}`}
                        className={cn(buttonVariants({ variant: 'sport', size: 'lg' }), 'mt-4 w-full')}
                    >
                        <Plus className="h-5 w-5" />
                        Crear o asignar programa
                    </Link>
                </div>
            </div>
        )
    }

    // ---------- Day card (microciclo) ----------
    const renderDayCard = (plan: any | undefined, opts: { dow: number; label: string }) => {
        const { dow, label } = opts
        const blocks = [...(plan?.workout_blocks || [])].sort(
            (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
        )
        const groups = uniqueMuscleGroupsFromBlocks(blocks)
        const isToday = isWeekly && dow >= 1 && dow <= 7 && dow === todayDow
        const isOpen = openDow === dow
        const hasWork = !!plan && blocks.length > 0

        if (!hasWork) {
            return (
                <div
                    key={`rest-${dow}`}
                    style={{
                        background: CARD,
                        border: `1px solid ${isToday ? 'var(--sport-400)' : CARD_BORDER}`,
                        borderRadius: 'var(--radius-md)',
                        opacity: 0.72,
                    }}
                    className="flex items-center gap-3 p-3.5"
                >
                    <div
                        style={{ background: SUNKEN, color: TXT_MUTED, borderRadius: 'var(--radius-sm)' }}
                        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center text-xs font-extrabold"
                    >
                        {label}
                    </div>
                    <span className="text-sm" style={{ color: TXT_MUTED }}>
                        Descanso
                    </span>
                    {isToday && (
                        <Badge tone="sport" variant="solid" size="sm" className="ml-auto">
                            Hoy
                        </Badge>
                    )}
                </div>
            )
        }

        return (
            <div
                key={plan.id ?? `day-${dow}`}
                style={{
                    background: CARD,
                    border: `1px solid ${isToday ? 'var(--sport-400)' : CARD_BORDER}`,
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    boxShadow: isToday ? '0 0 0 1px var(--sport-400)' : 'none',
                }}
            >
                <button
                    type="button"
                    onClick={() => setOpenDow(isOpen ? null : dow)}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
                >
                    <div
                        style={{ background: 'var(--sport-100)', color: 'var(--sport-700)', borderRadius: 'var(--radius-sm)' }}
                        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center text-xs font-extrabold"
                    >
                        {label}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-bold" style={{ color: TXT }}>
                                {plan.title || 'Entrenamiento'}
                            </span>
                            {isToday && (
                                <Badge tone="sport" variant="solid" size="sm">
                                    Hoy
                                </Badge>
                            )}
                        </div>
                        <div className="truncate text-xs" style={{ color: TXT_MUTED }}>
                            {blocks.length} ej.
                            {groups.length > 0 ? ` · ${groups.slice(0, 3).join(', ')}${groups.length > 3 ? '…' : ''}` : ''}
                        </div>
                    </div>
                    <ChevronRight
                        className="h-[18px] w-[18px] shrink-0 transition-transform duration-150"
                        style={{ color: 'var(--ink-300)', transform: isOpen ? 'rotate(90deg)' : 'none' }}
                    />
                </button>
                {isOpen && (
                    <div style={{ borderTop: `1px solid ${CARD_BORDER}` }}>
                        {blocks.map((block: any, i: number) => {
                            const name = block.exercises?.name || 'Ejercicio'
                            const setsReps =
                                block.sets != null || block.reps != null
                                    ? `${block.sets ?? '—'}${block.reps != null ? '×' + block.reps : ''}`
                                    : ''
                            return (
                                <button
                                    key={block.id ?? i}
                                    type="button"
                                    onClick={() => openBlock(block)}
                                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
                                    style={{ borderTop: i > 0 ? `1px solid ${CARD_BORDER}` : 'none' }}
                                >
                                    <span
                                        className="h-2 w-2 shrink-0 rounded-full"
                                        style={{ background: muscleDotColor(block.exercises?.muscle_group) }}
                                    />
                                    <span className="min-w-0 flex-1 truncate text-sm" style={{ color: TXT }}>
                                        {name}
                                    </span>
                                    {setsReps && (
                                        <span className="font-mono text-xs tabular-nums" style={{ color: TXT_MUTED }}>
                                            {setsReps}
                                        </span>
                                    )}
                                    <ChevronRight className="h-[15px] w-[15px] shrink-0" style={{ color: 'var(--ink-300)' }} />
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>
        )
    }

    const ex = sheetBlock?.exercises
    type PrescriptionRow = { lbl: string; val: string; icon: React.ReactNode }
    const prescriptionRows: PrescriptionRow[] = sheetBlock
        ? ([
              sheetBlock.sets != null || sheetBlock.reps != null
                  ? {
                        lbl: 'Series × reps',
                        val: `${sheetBlock.sets ?? '—'} × ${sheetBlock.reps ?? '—'}`,
                        icon: <Dumbbell className="h-[17px] w-[17px]" />,
                    }
                  : null,
              sheetBlock.target_weight_kg != null
                  ? { lbl: 'Obj. peso', val: `${sheetBlock.target_weight_kg} kg`, icon: <Weight className="h-[17px] w-[17px]" /> }
                  : null,
              sheetBlock.rest_time
                  ? { lbl: 'Descanso', val: String(sheetBlock.rest_time), icon: <Timer className="h-[17px] w-[17px]" /> }
                  : null,
              sheetBlock.rir != null && sheetBlock.rir !== ''
                  ? { lbl: 'RIR', val: String(sheetBlock.rir), icon: <Gauge className="h-[17px] w-[17px]" /> }
                  : null,
              sheetBlock.tempo
                  ? { lbl: 'Tempo', val: String(sheetBlock.tempo), icon: <Clock className="h-[17px] w-[17px]" /> }
                  : null,
          ] as (PrescriptionRow | null)[]).filter((r): r is PrescriptionRow => r !== null)
        : []

    return (
        <div style={{ background: CANVAS, borderRadius: 'var(--radius-card)' }} className="space-y-3.5 p-4 md:p-6">
            {/* ============ HEADER (inverse) ============ */}
            <div
                style={{ background: 'var(--surface-inverse)', border: `1px solid var(--border-inverse)`, borderRadius: 'var(--radius-card)' }}
                className="p-5"
            >
                <div className="mb-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-xs" style={{ color: 'var(--text-on-dark-muted)' }}>
                            PROGRAMA ACTIVO
                        </div>
                        <div className="font-display text-lg font-extrabold" style={{ color: 'var(--text-on-dark)' }}>
                            {activeProgram.name}
                        </div>
                    </div>
                    {hasSchedule ? (
                        <Badge tone={planDaysRemaining <= 3 ? 'warning' : 'sport'} variant="solid" size="sm" className="shrink-0">
                            {planDaysRemaining <= 0 ? 'Vencido' : `${planDaysRemaining} días`}
                        </Badge>
                    ) : (
                        <span className="shrink-0">
                            <DarkChip>En curso</DarkChip>
                        </span>
                    )}
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                    <DarkChip>{isWeekly ? 'Semanal' : 'Cíclico'}</DarkChip>
                    {abMode && (
                        <Badge tone="sport" variant="solid" size="sm" title="Semanas impares → A, pares → B">
                            Variante {activeVariant} · esta semana
                        </Badge>
                    )}
                    <DarkChip>{weeksRepeat} sem. ciclo</DarkChip>
                    {activeProgram.cycle_length ? <DarkChip>{activeProgram.cycle_length} días / ciclo</DarkChip> : null}
                </div>

                {/* barra de fases */}
                {phases.length > 0 && (
                    <>
                        <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', marginBottom: 6 }}>
                            {phases.map((p, i) => (
                                <div
                                    key={`${p.name}-${i}`}
                                    title={`${p.name} · ${p.weeks} sem.`}
                                    style={{
                                        flex: Math.max(1, p.weeks),
                                        background: p.color || PHASE_PALETTE[i % PHASE_PALETTE.length],
                                        borderRight: i < phases.length - 1 ? `2px solid var(--surface-inverse)` : 'none',
                                    }}
                                />
                            ))}
                        </div>
                        <div className="mb-3 flex flex-wrap gap-3">
                            {phases.map((p, i) => (
                                <span
                                    key={`lg-${p.name}-${i}`}
                                    className="inline-flex items-center gap-1.5 text-[11px]"
                                    style={{ color: 'var(--text-on-dark-muted)' }}
                                >
                                    <span
                                        className="h-2 w-2 rounded-sm"
                                        style={{ background: p.color || PHASE_PALETTE[i % PHASE_PALETTE.length] }}
                                    />
                                    {p.name} · {p.weeks}s
                                </span>
                            ))}
                        </div>
                    </>
                )}

                {/* progreso */}
                {hasSchedule ? (
                    <>
                        <div className="mb-1.5 flex items-center justify-between text-xs" style={{ color: 'var(--text-on-dark-muted)' }}>
                            <span>
                                Semana {planCurrentWeek} de {planTotalWeeks}
                            </span>
                            <span className="font-mono tabular-nums">{weekProgressPct}%</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: 'var(--border-inverse)', overflow: 'hidden' }}>
                            <div style={{ width: `${weekProgressPct}%`, height: '100%', background: 'var(--sport-500)', borderRadius: 999 }} />
                        </div>
                    </>
                ) : (
                    <p className="text-[11px] font-medium" style={{ color: 'var(--text-on-dark-muted)' }}>
                        Sin fechas inicio/fin en el programa · progreso por semanas no disponible
                    </p>
                )}
            </div>

            {/* ============ ESTRUCTURA DEL CICLO ============ */}
            {structureWeeks > 1 && (
                <div>
                    <SectionTitle>Estructura del ciclo · {structureWeeks} semanas</SectionTitle>
                    <div
                        style={{ background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: 'var(--radius-card)' }}
                        className="p-4"
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${structureWeeks}, 1fr)`, gap: 4 }}>
                            {Array.from({ length: structureWeeks }, (_, i) => {
                                const wk = i + 1
                                const ph = phaseForWeek(wk)
                                const vr = wk % 2 === 1 ? 'A' : 'B'
                                const cur = hasSchedule && wk === planCurrentWeek
                                return (
                                    <div key={wk} className="flex flex-col items-center gap-1">
                                        <div
                                            style={{
                                                width: '100%',
                                                height: 26,
                                                borderRadius: 'var(--radius-xs)',
                                                background: ph.color,
                                                opacity: cur ? 1 : 0.42,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 10,
                                                fontWeight: 800,
                                                color: '#fff',
                                                border: cur ? `2px solid ${TXT}` : 'none',
                                                boxSizing: 'border-box',
                                            }}
                                            title={ph.name ? `${ph.name}${abMode ? ` · ${vr}` : ''}` : undefined}
                                        >
                                            {abMode ? vr : ''}
                                        </div>
                                        <span
                                            className="font-mono text-[9px] tabular-nums"
                                            style={{ color: cur ? TXT : TXT_MUTED, fontWeight: cur ? 800 : 400 }}
                                        >
                                            {wk}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-3">
                            {phases.map((p, i) => (
                                <span
                                    key={`sl-${p.name}-${i}`}
                                    className="inline-flex items-center gap-1.5 text-[10.5px]"
                                    style={{ color: TXT_MUTED }}
                                >
                                    <span
                                        className="h-2.5 w-2.5 rounded-sm"
                                        style={{ background: p.color || PHASE_PALETTE[i % PHASE_PALETTE.length] }}
                                    />
                                    {p.name}
                                </span>
                            ))}
                            {abMode && (
                                <span className="ml-auto text-[10.5px]" style={{ color: TXT_MUTED }}>
                                    A/B = variante semanal alternada
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ============ MICROCICLO (L–D) ============ */}
            <div>
                <SectionTitle>{isWeekly ? 'Microciclo (L–D)' : 'Días del programa'}</SectionTitle>
                {isWeekly ? (
                    <div className="flex flex-col gap-2">
                        {[1, 2, 3, 4, 5, 6, 7].map((dow) =>
                            renderDayCard(planByDow.get(dow), { dow, label: DAY_LABELS[dow] ?? `D${dow}` })
                        )}
                    </div>
                ) : plansView.length === 0 ? (
                    <div
                        style={{ background: CARD, border: `1px solid ${CARD_BORDER}`, borderRadius: 'var(--radius-md)' }}
                        className="p-4 text-sm"
                    >
                        <span style={{ color: TXT_MUTED }}>
                            No hay días con ejercicios en este programa (revisá variantes de semana en el builder).
                        </span>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {plansView.map((plan: any) => {
                            const dow = Number(plan.day_of_week)
                            return renderDayCard(plan, { dow, label: dow >= 1 && dow <= 7 ? (DAY_LABELS[dow] ?? `D${dow}`) : String(dow) })
                        })}
                    </div>
                )}
            </div>

            {/* ============ EDITAR EN BUILDER ============ */}
            <Link
                href={`/coach/builder/${clientId}`}
                className={cn(buttonVariants({ variant: 'sport', size: 'lg' }), 'w-full')}
            >
                <PencilLine className="h-5 w-5" />
                Editar en builder
            </Link>

            {/* ============ EXERCISE DETAIL SHEET ============ */}
            <Sheet
                open={sheetOpen}
                onOpenChange={(o) => {
                    setSheetOpen(o)
                    if (!o) setSheetBlock(null)
                }}
            >
                <SheetContent
                    side={sheetSide}
                    showCloseButton={false}
                    className={cn(
                        sheetSide === 'bottom' ? 'max-h-[88vh] rounded-t-[20px]' : 'sm:max-w-md',
                        'w-full overflow-y-auto p-0'
                    )}
                    style={{ background: CARD, color: TXT, borderColor: CARD_BORDER }}
                >
                    <div className="flex flex-col px-5 pb-6 pt-2">
                        {sheetSide === 'bottom' && (
                            <div className="mx-auto mb-4 mt-1.5 h-1 w-9 rounded-full" style={{ background: 'var(--ink-300)' }} />
                        )}

                        <SheetTitle className="mb-2 normal-case tracking-normal" style={{ color: TXT }}>
                            <span className="font-display text-xl font-extrabold">{ex?.name || 'Ejercicio'}</span>
                        </SheetTitle>

                        <SheetDescription className="mb-3.5 flex flex-wrap gap-1.5" style={{ color: TXT_MUTED }}>
                            {ex?.muscle_group ? (
                                <span
                                    className="inline-flex items-center gap-1"
                                    style={{
                                        height: 20,
                                        padding: '0 8px',
                                        borderRadius: 999,
                                        border: `1px solid ${CARD_BORDER}`,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: TXT_MUTED,
                                    }}
                                >
                                    <Target className="h-3 w-3" />
                                    {ex.muscle_group}
                                </span>
                            ) : (
                                <span className="text-xs">Ejercicio del programa</span>
                            )}
                        </SheetDescription>

                        {/* GIF demostración (real si existe) */}
                        {ex?.gif_url ? (
                            <div
                                className="relative mb-3.5 w-full overflow-hidden"
                                style={{ height: 150, borderRadius: 'var(--radius-md)', background: SUNKEN, border: `1px solid ${CARD_BORDER}` }}
                            >
                                <Image src={ex.gif_url} alt="" fill className="object-contain" unoptimized />
                            </div>
                        ) : (
                            <div
                                className="mb-3.5 flex flex-col items-center justify-center gap-1.5"
                                style={{
                                    height: 150,
                                    borderRadius: 'var(--radius-md)',
                                    background: SUNKEN,
                                    border: `1px dashed ${CARD_BORDER}`,
                                    color: TXT_MUTED,
                                }}
                            >
                                <PlayCircle className="h-[30px] w-[30px]" />
                                <span className="text-xs">GIF demostración</span>
                            </div>
                        )}

                        {/* tabla de prescripción */}
                        {prescriptionRows.length > 0 && (
                            <div
                                className="mb-3.5 flex flex-col"
                                style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: `1px solid ${CARD_BORDER}` }}
                            >
                                {prescriptionRows.map((r, i) => (
                                    <div
                                        key={r.lbl}
                                        className="flex items-center gap-2.5 px-3.5"
                                        style={{ padding: '11px 14px', borderTop: i > 0 ? `1px solid ${CARD_BORDER}` : 'none' }}
                                    >
                                        <span style={{ color: 'var(--sport-500)' }}>{r.icon}</span>
                                        <span className="flex-1 text-sm" style={{ color: TXT_MUTED }}>
                                            {r.lbl}
                                        </span>
                                        <span className="font-mono text-[15px] tabular-nums" style={{ color: TXT }}>
                                            {r.val}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* notas del coach (solo si hay nota real) */}
                        {sheetBlock?.notes ? (
                            <div style={{ background: SUNKEN, borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
                                <div
                                    className="font-display"
                                    style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', color: TXT_MUTED, marginBottom: 4 }}
                                >
                                    NOTAS DEL COACH
                                </div>
                                <div className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>
                                    {sheetBlock.notes}
                                </div>
                            </div>
                        ) : null}

                        <Button
                            type="button"
                            variant="secondary"
                            className="mt-4 w-full"
                            onClick={() => setSheetOpen(false)}
                        >
                            Cerrar
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
