'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Share2, Check, ArrowRight, HeartPulse, Move, GitCommit } from 'lucide-react'
import { getSantiagoIsoYmdForUtcInstant } from '@/lib/date-utils'
import { compactDistance } from '@/lib/workout-exercise-type'
import { MuscleMapSvg } from '../MuscleMapSvg'
import {
    formatSessionDuration,
    type SummaryBlock,
    type SummaryLogLike,
    type CardioItem,
    type MobilityItem,
} from '../session-summary'
import { PRShareCardModal } from '../PRShareCardModal'
import type { WorkoutPRCardData } from '@/lib/workout-pr-card-canvas'
import type confetti from 'canvas-confetti'
import { useSessionSummary } from './use-session-summary'
import { Ticker } from './Ticker'
import { WeeklyStreakDots } from './WeeklyStreakDots'
import type { WeeklyStreak } from './weekly-streak'

/**
 * Ejecutor V3 (E4.3) — pantalla FINAL. Evolución del `WorkoutSummaryOverlay` (V2) dentro del contrato
 * visual nuevo (mockup `concepto-a-v2` · "Final"): coreografía en DOS fases —
 *   Fase 1 (clima): título celebratorio + confetti sutil (fade en reduced-motion).
 *   Fase 2 (stats): las stats entran en stagger con TICKERS que cuentan (valor directo en
 *     reduced-motion), el PR brilla en dorado con medalla, el mapa muscular frente/espalda con su
 *     leyenda, la racha semanal en puntos, la share-card existente accesible ("Compartir logro") y
 *     "Volver al inicio" SIEMPRE visible tras la fase 1 (todo skippable).
 *
 * Reutiliza la derivación de datos compartida (`useSessionSummary`) y la share-card de récord
 * (`PRShareCardModal`, canvas). Se monta DENTRO del root `[data-exec-v3]` → hereda `--exec-brand`.
 * V2 (`WorkoutSummaryOverlay`) queda intacto: esta es una superficie nueva, no un reemplazo.
 */

// Oro de RÉCORD PERSONAL: token propio del PR (#f5c451), NO la marca del coach. Coherente con el
// PR-en-vivo (`--exec-pr`) y con RN (`exec.pr`). No re-teñir por white-label.
const GOLD = 'var(--exec-pr)'

/** "12 jun" — fecha corta es-CL, día calendario Santiago (para "superaste tus X kg del …"). */
function fmtShortDate(iso: string): string {
    const ymd = getSantiagoIsoYmdForUtcInstant(iso)
    return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

// canvas-confetti: import dinámico (code-split) con tipos reales del módulo.
const fireConfetti = (opts: confetti.Options) => import('canvas-confetti').then((m) => m.default(opts))

/**
 * Log de serie AL FINAL, ensanchado con la `metadata` jsonb del hold por-lado (`{left_sec, right_sec}`).
 * `SummaryLogLike` (motor) la estripa; el host ya la manda intacta en `sessionLogs` (mismo objeto que
 * `logs`), así que sólo la EXPONEMOS al tipo — aditivo (opcional) ⇒ V2 byte-idéntico, sin prop nueva ni
 * cambio en el montaje. La usa la tarjeta "Lo que hiciste" para partir "45s izq · 43s der" en movilidad
 * per_side. El motor queda intocable.
 */
type FinalLogLike = SummaryLogLike & {
    metadata?: { left_sec?: number | null; right_sec?: number | null } | null
}

/** Tipo de la fila NO-fuerza de "Lo que hiciste" (cardio/movilidad/roller). */
type DidType = 'cardio' | 'mobility' | 'roller'
interface DidRow {
    key: string
    type: DidType
    name: string
    /** Dato logueado ya formateado (es-CL) — la columna derecha tabular. */
    data: string
}

/** Minutos compactos para cardio: "12min" (≥60s) o "45s" (sub-minuto, honesto en vez de "0min"). */
function fmtDidDuration(sec: number): string {
    return sec >= 60 ? `${Math.round(sec / 60)}min` : `${Math.round(sec)}s`
}

/** Distancia es-CL: "2,5 km" (≥1000 m, coma decimal, 1 decimal) o "800 m" (<1000 m). */
function fmtDidDistance(m: number): string {
    if (m >= 1000) return `${(Math.round((m / 1000) * 10) / 10).toString().replace('.', ',')} km`
    return `${Math.round(m)} m`
}

/** Cardio → "Xmin · Y,Z km" con "· N bpm" si hubo FC media; sólo lo registrado (fallback: rondas). */
function cardioDidData(c: CardioItem): string {
    const parts: string[] = []
    if (c.durationSec != null && c.durationSec > 0) parts.push(fmtDidDuration(c.durationSec))
    if (c.distanceM != null && c.distanceM > 0) parts.push(fmtDidDistance(c.distanceM))
    if (c.avgHr != null && c.avgHr > 0) parts.push(`${c.avgHr} bpm`)
    if (parts.length === 0) parts.push(`${c.rounds} ${c.rounds === 1 ? 'ronda' : 'rondas'}`)
    return parts.join(' · ')
}

/**
 * Movilidad → holds. Si el bloque es per_side (algún log trae `metadata.left_sec/right_sec`), parte por
 * lado: "45s izq · 43s der" con la SUMA del hold por lado a lo largo de las series (decisión: "lo más
 * honesto" = tiempo total sostenido por lado; en el caso 1-serie coincide con el valor único). Si no es
 * per_side: "N×Ms" cuando el hold es uniforme, o "N series · Ts" (total) cuando varía; "N series" si no
 * se registró hold.
 */
function mobilityDidData(blockLogs: FinalLogLike[]): string {
    const perSide = blockLogs.some((l) => l.metadata && (l.metadata.left_sec != null || l.metadata.right_sec != null))
    if (perSide) {
        let left = 0
        let right = 0
        let hasL = false
        let hasR = false
        for (const l of blockLogs) {
            if (l.metadata?.left_sec != null) { left += l.metadata.left_sec; hasL = true }
            if (l.metadata?.right_sec != null) { right += l.metadata.right_sec; hasR = true }
        }
        const segs: string[] = []
        if (hasL) segs.push(`${left}s izq`)
        if (hasR) segs.push(`${right}s der`)
        if (segs.length > 0) return segs.join(' · ')
    }
    const sets = blockLogs.length
    const holds = blockLogs.map((l) => l.actual_hold_sec).filter((h): h is number => h != null && h > 0)
    if (holds.length === 0) return `${sets} ${sets === 1 ? 'serie' : 'series'}`
    const uniform = holds.length === sets && holds.every((h) => h === holds[0])
    if (uniform) return `${sets}×${holds[0]}s`
    return `${sets} ${sets === 1 ? 'serie' : 'series'} · ${holds.reduce((a, h) => a + h, 0)}s`
}

/** Roller → "N pasadas" (suma de `reps_done`); fallback a series si no se contaron pasadas. */
function rollerDidData(blockLogs: FinalLogLike[]): string {
    const passes = blockLogs.reduce((a, l) => a + (l.reps_done ?? 0), 0)
    if (passes > 0) return `${passes} ${passes === 1 ? 'pasada' : 'pasadas'}`
    const sets = blockLogs.length
    return `${sets} ${sets === 1 ? 'serie' : 'series'}`
}

/**
 * Filas de "Lo que hiciste" en ORDEN DEL PLAN: recorre cardio + movilidad/roller (fuerza excluida: su
 * camino es el mapa pintado) y ordena por índice del bloque. Ejercicios sin registro no entran (el motor
 * ya sólo devuelve bloques con logs). Vacío ⇒ el host cae al mapa gris de fallback.
 */
function buildDidRows(
    cardio: CardioItem[],
    mobility: MobilityItem[],
    blocks: SummaryBlock[],
    logs: FinalLogLike[],
): DidRow[] {
    const order = new Map(blocks.map((b, i) => [b.id, i]))
    const rows: DidRow[] = []
    for (const c of cardio) rows.push({ key: c.blockId, type: 'cardio', name: c.name, data: cardioDidData(c) })
    for (const m of mobility) {
        const blockLogs = logs.filter((l) => l.block_id === m.blockId)
        rows.push({
            key: m.blockId,
            type: m.kind,
            name: m.name,
            data: m.kind === 'roller' ? rollerDidData(blockLogs) : mobilityDidData(blockLogs),
        })
    }
    return rows.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
}

/** Icono por tipo (16px, gris neutro #8f8f9c) — mismos glifos que el resumen V2 (cardio/movilidad/roller). */
function DidIcon({ type }: { type: DidType }) {
    const cls = 'h-4 w-4 shrink-0'
    const style = { color: '#8f8f9c' }
    if (type === 'cardio') return <HeartPulse className={cls} style={style} aria-hidden />
    if (type === 'roller') return <GitCommit className={cls} style={style} aria-hidden />
    return <Move className={cls} style={style} aria-hidden />
}

export interface SessionCompleteV3Props {
    planTitle: string
    /** Etiqueta corta del día para el título ("Día 3"). Aditiva: si no viaja, cae a `planTitle`
     *  (comportamiento V2 idéntico). Cablearla desde el host queda diferido (WorkoutExecutionClient
     *  es motor de resiliencia, fuera de esta wave). */
    completionLabel?: string | null
    /** Subtítulo contextual ya resuelto ("Semana 2 · Fase Fuerza"). null ⇒ se omite. */
    contextLine?: string | null
    /** Logs de la sesión. El host manda `sessionLogs` con la `metadata` per_side intacta (ver `FinalLogLike`). */
    logs: FinalLogLike[]
    blocks: SummaryBlock[]
    exerciseMaxes: Record<string, number>
    exerciseMaxDates?: Record<string, string>
    /** Duración de la sesión en segundos (cronómetro congelado al finalizar). */
    durationSec?: number
    /** Series planificadas totales → "24 / 24". null ⇒ sólo las completadas. */
    plannedSets?: number | null
    /** Racha semanal ya calculada (E4.4). null ⇒ la pieza no se muestra (dato honesto ausente). */
    streak?: WeeklyStreak | null
    programName?: string | null
    nextHint?: string | null
    substitutedBlockIds?: string[]
    onDone: () => void
}

export function SessionCompleteV3({
    planTitle,
    completionLabel = null,
    contextLine = null,
    logs,
    blocks,
    exerciseMaxes,
    exerciseMaxDates = {},
    durationSec,
    plannedSets = null,
    streak = null,
    programName = null,
    nextHint = null,
    substitutedBlockIds = [],
    onDone,
}: SessionCompleteV3Props) {
    const reducedMotion = useReducedMotion()
    const {
        detectedPRs,
        hasMuscleMap,
        session,
        completedSets,
        totalVolume,
        heroSecondary,
    } = useSessionSummary({ logs, blocks, exerciseMaxes, exerciseMaxDates, substitutedBlockIds })

    // "Lo que hiciste" (QA4): en días SIN mapa pintado, listamos los ejercicios NO-fuerza registrados
    // (cardio/movilidad/roller) en orden del plan con su dato logueado — en vez del mapa gris a secas.
    const didRows = useMemo(
        () => buildDidRows(session.cardio, session.mobility, blocks, logs),
        [session.cardio, session.mobility, blocks, logs],
    )

    // Coreografía en dos fases. Reduced-motion arranca directo en `stats` (sin clima animado).
    const [phase, setPhase] = useState<'climate' | 'stats'>(reducedMotion ? 'stats' : 'climate')
    const [shared, setShared] = useState(false)
    const [prCard, setPrCard] = useState<WorkoutPRCardData | null>(null)

    // Fase 1: confetti sutil al montar + salto programado a la fase 2. La transición se agenda SIEMPRE
    // (aunque el confetti falle) para no dejar la pantalla atascada en el clima.
    useEffect(() => {
        if (reducedMotion) return
        const CONFETTI_Z = 10000
        if (detectedPRs.length > 0) {
            fireConfetti({ particleCount: 120, spread: 80, origin: { y: 0.35 }, zIndex: CONFETTI_Z })
            setTimeout(() => fireConfetti({ particleCount: 60, spread: 60, origin: { x: 0.25, y: 0.4 }, zIndex: CONFETTI_Z }), 260)
            setTimeout(() => fireConfetti({ particleCount: 60, spread: 60, origin: { x: 0.75, y: 0.4 }, zIndex: CONFETTI_Z }), 420)
        } else {
            fireConfetti({ particleCount: 80, spread: 70, origin: { y: 0.35 }, zIndex: CONFETTI_Z })
        }
        const t = setTimeout(() => setPhase('stats'), 850)
        return () => clearTimeout(t)
    }, [reducedMotion, detectedPRs.length])

    const handleShare = useCallback(async () => {
        const totalReps = logs.reduce((acc, l) => acc + (l.reps_done || 0), 0)
        const prText = detectedPRs.length > 0 ? ` 🏆 ${detectedPRs.length} récord${detectedPRs.length > 1 ? 's' : ''}!` : ''
        const text = `¡Completé "${planTitle}"! 💪 ${completedSets} series · ${totalReps} reps · ${Math.round(totalVolume)} kg${prText}`
        if (navigator.share) {
            const shareTitle =
                document.querySelector('[data-brand-name]')?.getAttribute('data-brand-name')?.trim() || 'EVA'
            await navigator.share({ title: shareTitle, text }).catch(() => null)
        } else {
            await navigator.clipboard.writeText(text).catch(() => null)
            setShared(true)
            setTimeout(() => setShared(false), 2000)
        }
    }, [planTitle, completedSets, totalVolume, detectedPRs, logs])

    const statsVisible = phase === 'stats'
    const stagger = (i: number) => (reducedMotion ? { duration: 0 } : { delay: 0.06 * i, duration: 0.34, ease: [0.16, 1, 0.3, 1] as const })

    // Stat secundario adaptativo (volumen kg cuenta con ticker; distancia/series sin fuerza = directo).
    const showVolumeStat = totalVolume > 0
    const showDistanceStat = !showVolumeStat && session.totalCardioDistanceM > 0
    const seriesLabel = plannedSets != null && plannedSets > 0 ? `${completedSets} / ${plannedSets}` : String(completedSets)

    return (
        <div
            className="exec-v3-final fixed inset-0 z-[9999] overflow-y-auto text-on-dark pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-[calc(env(safe-area-inset-top,0px)+28px)]"
            // FONDO PROPIO OPACO (QA4): la pantalla final es un OVERLAY montado sobre el ejecutor vivo
            // (el paso de sesión sigue detrás → en QA1 el `bg-transparent` lo dejaba traslucir y todo se
            // mezclaba). Pinta el gradiente radial cálido del contrato (`.a2-screen` de concepto-a-v2:
            // #1c1c24 → #16161d → #121218), opaco al 100%, para tapar por completo lo que hay debajo.
            // `z-[9999]` va sobre header/pager/barra Finalizar (z-40..z-70). El confetti (zIndex 10000)
            // sigue quedando por encima.
            style={{ background: 'radial-gradient(120% 80% at 50% -8%, #1c1c24 0%, #16161d 42%, #121218 100%)' }}
        >
            <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center px-5 text-center">
                {/* ── Fase 1: clima celebratorio ── */}
                <motion.h1
                    initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={reducedMotion ? { duration: 0 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-1 font-display text-[28px] font-black leading-[1.05] tracking-[-0.02em] text-on-dark"
                >
                    ¡{completionLabel ?? planTitle} completo!
                </motion.h1>
                {contextLine && (
                    <motion.p
                        initial={reducedMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={reducedMotion ? { duration: 0 } : { delay: 0.12, duration: 0.3 }}
                        className="mt-1.5 text-[13px] font-bold text-[#a8a8b3]"
                    >
                        {contextLine}
                    </motion.p>
                )}

                {/* ── Fase 2: stats en stagger con tickers ── */}
                <motion.div
                    initial={false}
                    animate={{ opacity: statsVisible ? 1 : 0 }}
                    transition={{ duration: reducedMotion ? 0 : 0.2 }}
                    className="mt-5 w-full"
                    style={{ pointerEvents: statsVisible ? 'auto' : 'none' }}
                >
                    <div className="grid grid-cols-2 gap-2.5">
                        <StatTile label="Duración" delay={stagger(0)} show={statsVisible} reducedMotion={reducedMotion}>
                            <Ticker
                                className="font-display font-black tracking-[-0.03em] text-[24px] leading-none text-on-dark"
                                value={durationSec ?? 0}
                                active={statsVisible}
                                reducedMotion={reducedMotion}
                                format={(n) => formatSessionDuration(n)}
                            />
                        </StatTile>

                        {showVolumeStat && (
                            <StatTile label="Volumen" delay={stagger(1)} show={statsVisible} reducedMotion={reducedMotion}>
                                <Ticker
                                    className="font-display font-black tracking-[-0.03em] text-[24px] leading-none text-on-dark"
                                    value={Math.round(totalVolume)}
                                    active={statsVisible}
                                    reducedMotion={reducedMotion}
                                    format={(n) => `${Math.round(n)} kg`}
                                />
                            </StatTile>
                        )}
                        {showDistanceStat && (
                            <StatTile label="Distancia" delay={stagger(1)} show={statsVisible} reducedMotion={reducedMotion}>
                                <span className="font-display font-black tracking-[-0.03em] text-[24px] leading-none text-on-dark">
                                    {compactDistance(session.totalCardioDistanceM, 'm')}
                                </span>
                            </StatTile>
                        )}
                        {!showVolumeStat && !showDistanceStat && (
                            <StatTile label={heroSecondary.label} delay={stagger(1)} show={statsVisible} reducedMotion={reducedMotion}>
                                <span className="font-display font-black tracking-[-0.03em] text-[24px] leading-none text-on-dark">
                                    {heroSecondary.value}
                                    {heroSecondary.unit ? <span className="ml-0.5 text-[13px] text-on-dark-muted">{heroSecondary.unit}</span> : null}
                                </span>
                            </StatTile>
                        )}

                        <StatTile label="Series" delay={stagger(2)} show={statsVisible} reducedMotion={reducedMotion}>
                            <span className="font-display font-black tracking-[-0.03em] text-[24px] leading-none tabular-nums text-on-dark">{seriesLabel}</span>
                        </StatTile>
                    </div>

                    {/* PR dorado con medalla — separado, "ganado". Tappable → share-card de récord. */}
                    {detectedPRs.map((pr, i) => (
                        <motion.button
                            key={pr.exerciseName}
                            type="button"
                            onClick={() =>
                                setPrCard({
                                    exerciseName: pr.exerciseName,
                                    newWeightKg: pr.newWeightKg,
                                    prevWeightKg: pr.prevWeightKg,
                                    pct: pr.pct,
                                    estimated1RM: pr.estimated1RM,
                                })
                            }
                            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                            animate={statsVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                            transition={stagger(3 + i)}
                            className="mt-2.5 flex w-full items-center gap-3 rounded-[16px] border-[1.5px] p-3 text-left transition-transform active:scale-[0.99]"
                            style={{
                                borderColor: `color-mix(in srgb, ${GOLD} 45%, transparent)`,
                                background: `linear-gradient(135deg, color-mix(in srgb, ${GOLD} 20%, #16161d), #17171f)`,
                            }}
                        >
                            <span
                                className="h-9 w-9 shrink-0 rounded-full"
                                aria-hidden
                                style={{
                                    background: `radial-gradient(circle at 40% 35%, #ffe9a8, ${GOLD} 60%, #c99326)`,
                                    boxShadow: `0 0 0 3px color-mix(in srgb, ${GOLD} 22%, transparent)`,
                                }}
                            />
                            <div className="min-w-0 flex-1">
                                <p className="font-display font-black tracking-[-0.03em] text-[20px] leading-none" style={{ color: GOLD }}>
                                    {pr.newWeightKg} kg
                                </p>
                                <p className="mt-1 truncate text-[11px] font-bold" style={{ color: `color-mix(in srgb, ${GOLD} 75%, #fff)` }}>
                                    PR · {pr.exerciseName}
                                    {pr.pct > 0 ? ` · +${pr.pct}%` : ''}
                                </p>
                                {pr.prevAchievedAt ? (
                                    <p className="mt-0.5 text-[10px] text-on-dark-muted">
                                        Superaste tus {pr.prevWeightKg} kg del {fmtShortDate(pr.prevAchievedAt)}
                                    </p>
                                ) : null}
                            </div>
                            <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold" style={{ color: `color-mix(in srgb, ${GOLD} 80%, #fff)` }}>
                                <Share2 className="h-3 w-3" /> Compartir
                            </span>
                        </motion.button>
                    ))}

                    {/* Mapa muscular / "Lo que hiciste" (QA4). Tres caminos:
                        1) CON fuerza (hasMuscleMap) → mapa PINTADO frente/espalda con leyenda. INTACTO.
                        2) SIN fuerza pero con ejercicios tipados (cardio/movilidad/roller) → "Lo que hiciste":
                           una fila por ejercicio registrado, en orden del plan, con su dato logueado (el CEO
                           pidió mostrar los datos ahí en vez del mapa gris a secas).
                        3) SIN ningún log tipado (sesión "vacía") → mapa gris de fallback, como antes. */}
                    <motion.div
                        initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                        animate={statsVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                        transition={stagger(3 + detectedPRs.length)}
                        className="mt-3 rounded-[16px] border-[1.5px] border-[#24242e] bg-[#15151c] px-3 pb-2 pt-3"
                    >
                        {hasMuscleMap ? (
                            <>
                                <p className="mb-1 text-left text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#7f7f8c]">
                                    Trabajado hoy
                                </p>
                                <div>
                                    <MuscleMapSvg
                                        groups={session.muscleWork}
                                        reducedMotion={reducedMotion}
                                        legendVariant="tiers"
                                        showLegend
                                    />
                                </div>
                            </>
                        ) : didRows.length > 0 ? (
                            <>
                                <p className="mb-1.5 text-left text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#7f7f8c]">
                                    Lo que hiciste
                                </p>
                                <div>
                                    {didRows.map((row) => (
                                        <div key={row.key} className="flex items-center gap-2.5 py-1.5 text-left">
                                            <DidIcon type={row.type} />
                                            <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-[#d4d4dc]">
                                                {row.name}
                                            </span>
                                            <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-white">
                                                {row.data}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="mb-1 text-left text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#7f7f8c]">
                                    Sin trabajo de fuerza hoy
                                </p>
                                <div style={{ opacity: 0.55 }}>
                                    <MuscleMapSvg
                                        groups={session.muscleWork}
                                        reducedMotion={reducedMotion}
                                        legendVariant="tiers"
                                        showLegend={false}
                                    />
                                </div>
                            </>
                        )}
                    </motion.div>

                    {/* Racha semanal (E4.4) — sólo si el dato viajó (honesto: sin dato, sin pieza). */}
                    {streak && streak.planned > 0 && (
                        <motion.div
                            initial={reducedMotion ? false : { opacity: 0 }}
                            animate={statsVisible ? { opacity: 1 } : { opacity: 0 }}
                            transition={stagger(4 + detectedPRs.length)}
                            className="mt-4"
                        >
                            <WeeklyStreakDots streak={streak} />
                        </motion.div>
                    )}

                    {/* Nudge "lo que viene" (paridad con V2), si hay programa activo. */}
                    {programName && (
                        <motion.div
                            initial={reducedMotion ? false : { opacity: 0 }}
                            animate={statsVisible ? { opacity: 1 } : { opacity: 0 }}
                            transition={stagger(5 + detectedPRs.length)}
                            className="mt-4 flex items-center gap-3 rounded-card border border-[color:color-mix(in_srgb,var(--exec-brand)_25%,transparent)] bg-[color:color-mix(in_srgb,var(--exec-brand)_8%,transparent)] px-4 py-3 text-left"
                        >
                            <div
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                                style={{ background: 'var(--exec-brand)' }}
                            >
                                <ArrowRight className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-[color:var(--exec-brand)]">Lo que viene</p>
                                <p className="truncate text-sm font-bold text-on-dark">Sigue tu progreso en {programName}</p>
                                {nextHint && <p className="truncate text-xs text-on-dark-muted">{nextHint}</p>}
                            </div>
                        </motion.div>
                    )}
                </motion.div>

                {/* CTAs — "Volver al inicio" SIEMPRE visible tras la fase 1 (skippable). */}
                <div className="mt-auto w-full pt-6" style={{ opacity: statsVisible ? 1 : 0, pointerEvents: statsVisible ? 'auto' : 'none', transition: 'opacity .2s' }}>
                    <button type="button" onClick={handleShare} className="exec-v3-juicy flex h-[60px] w-full items-center justify-center gap-2 text-[17px]">
                        {shared ? (
                            <><Check className="h-5 w-5" /> Copiado</>
                        ) : (
                            <><Share2 className="h-5 w-5" /> Compartir logro</>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onDone}
                        className="mt-2.5 flex h-[52px] w-full items-center justify-center rounded-[15px] border-2 border-[#2f2f3a] bg-[#1c1c24] text-[15px] font-extrabold text-[#e8e8ee] transition-colors hover:bg-[#22222c]"
                    >
                        Volver al inicio
                    </button>
                </div>
            </div>

            {prCard && <PRShareCardModal pr={prCard} onClose={() => setPrCard(null)} />}
        </div>
    )
}

/** Tile de stat (card oscura EVA DS) con entrada en stagger. El número (ticker o directo) va como children. */
function StatTile({
    label,
    children,
    delay,
    show,
    reducedMotion,
}: {
    label: string
    children: React.ReactNode
    delay: object
    show: boolean
    reducedMotion: boolean | null
}) {
    return (
        <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={delay}
            className="rounded-[16px] border-[1.5px] border-[#2a2a34] bg-[#1a1a22] px-3 py-3 text-left"
        >
            {children}
            <p className="mt-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#7f7f8c]">{label}</p>
        </motion.div>
    )
}
