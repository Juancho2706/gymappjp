'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Share2, Check, ArrowRight } from 'lucide-react'
import { getSantiagoIsoYmdForUtcInstant } from '@/lib/date-utils'
import { compactDistance } from '@/lib/workout-exercise-type'
import { MuscleMapSvg } from '../MuscleMapSvg'
import { formatSessionDuration, type SummaryBlock, type SummaryLogLike } from '../session-summary'
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

export interface SessionCompleteV3Props {
    planTitle: string
    /** Etiqueta corta del día para el título ("Día 3"). Aditiva: si no viaja, cae a `planTitle`
     *  (comportamiento V2 idéntico). Cablearla desde el host queda diferido (WorkoutExecutionClient
     *  es motor de resiliencia, fuera de esta wave). */
    completionLabel?: string | null
    /** Subtítulo contextual ya resuelto ("Semana 2 · Fase Fuerza"). null ⇒ se omite. */
    contextLine?: string | null
    logs: SummaryLogLike[]
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
        <div className="exec-v3-final fixed inset-0 z-[9999] overflow-y-auto bg-transparent text-on-dark pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-[calc(env(safe-area-inset-top,0px)+28px)]">
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

                    {/* Mapa muscular frente/espalda con leyenda (evolución reencuadrada de MuscleMapSvg). */}
                    {hasMuscleMap && (
                        <motion.div
                            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                            animate={statsVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                            transition={stagger(3 + detectedPRs.length)}
                            className="mt-3 rounded-[16px] border-[1.5px] border-[#24242e] bg-[#15151c] px-3 pb-2 pt-3"
                        >
                            <p className="mb-1 text-left text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#7f7f8c]">
                                Trabajado hoy
                            </p>
                            <MuscleMapSvg groups={session.muscleWork} reducedMotion={reducedMotion} legendVariant="tiers" />
                        </motion.div>
                    )}

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
