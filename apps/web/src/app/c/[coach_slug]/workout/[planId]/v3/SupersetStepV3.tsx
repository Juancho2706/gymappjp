'use client'

import Image from 'next/image'
import { Info, Dumbbell } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    buildRoundOrder,
    firstIncompleteInRounds,
    isRoundComplete,
    formatTypedObjective,
    type RoundMemberBlock,
    type RoundLogLike,
    type OptimisticLogPayload,
} from '@eva/workout-engine'
import { computeEffectiveTarget } from '@/lib/workout/progression'
import { effectiveExerciseType } from '@/lib/workout-exercise-type'
import type { ExerciseType as WorkoutKind } from '@/domain/workout/types'
import { LogSetForm, type SetSyncResult } from '../LogSetForm'
import {
    type BlockType,
    type ExerciseType,
    type WorkoutSessionLog,
    type SupersetInfo,
    type SessionSubstitution,
} from '../WorkoutExecutionClient'
import { resolveExecMedia } from './exec-media'

/** Mejor sesión previa por ejercicio (fila "Anterior" + autollenado del keypad). */
type PrevSet = { weight_kg: number | null; reps_done: number | null; date: string }

interface SupersetStepV3Props {
    info: SupersetInfo
    sessionLogs: WorkoutSessionLog[]
    currentWeek: number | null
    weeksToRepeat?: number
    previousHistory: Record<string, PrevSet[]>
    lastSessionByBlock: Record<string, { date: string; sets: Array<{ weight_kg: number | null; reps_done: number | null }> }>
    exerciseMaxes: Record<string, number>
    autoTimerEnabled: boolean
    /** Sustitución activa por bloque (mismo shape del padre; se pasa tal cual al LogSetForm). */
    substitutionByBlock: Record<string, SessionSubstitution | undefined>
    onLogged: (payload: OptimisticLogPayload) => void
    onResult: (blockId: string, setNumber: number, result: SetSyncResult) => void
    openTechnique: (exercise: ExerciseType | null) => void
    registerRowRef: (blockId: string, setNumber: number, el: HTMLDivElement | null) => void
    getExercise: (block: BlockType) => ExerciseType | null
}

const SUBSTITUTION_REASON = 'Máquina ocupada'

/**
 * Ejecutor V3 (E3.5) — presentación de la SUPERSERIE como paso del stepper. Traducción del mockup
 * `concepto-a-v3-tipos` (pantalla Superserie): título "Superserie {letra}" + chip "Ronda N de M" con
 * dots de ronda; los miembros apilados con el ACTIVO destacado (borde de marca + "Ahora") y su
 * `LogSetForm` REUSADO como fila de captura, y los demás colapsados a una tarjeta atenuada con su
 * estado. Pill "Sin descanso — sigue con {siguiente}" cuando queda miembro en la ronda, y nota
 * "Descanso {n}s al cerrar la ronda".
 *
 * El ORDEN intercalado (A1 → B1 → A2 → B2…) y el cierre de ronda se derivan del engine
 * `superset-rounds` (buildRoundOrder / firstIncompleteInRounds / isRoundComplete) — no se duplica
 * lógica. El descanso de grupo lo dispara el MISMO `supersetRest` del LogSetForm al cerrar la ronda;
 * este componente sólo re-estiliza contenedores bajo `[data-exec-v3]`, sin tocar guardado/cola.
 */
export function SupersetStepV3({
    info,
    sessionLogs,
    currentWeek,
    weeksToRepeat,
    previousHistory,
    lastSessionByBlock,
    exerciseMaxes,
    autoTimerEnabled,
    substitutionByBlock,
    onLogged,
    onResult,
    openTechnique,
    registerRowRef,
    getExercise,
}: SupersetStepV3Props) {
    const { members, letterByBlock, groupLetter, groupRestSeconds, maxSets } = info

    // VM por miembro (misma derivación de progresión/última-sesión que la card de lista, sin bifurcar
    // el motor). La sobrecarga sólo aplica a strength; el resto usa el objetivo tipado.
    const memberVMs = members
        .map((block) => {
            const exercise = getExercise(block)
            if (!exercise) return null
            const effType = effectiveExerciseType(block, exercise) as WorkoutKind
            const lastSession = (() => {
                const ls = lastSessionByBlock[block.id]
                if (!ls || ls.sets.length === 0) return null
                const weightKg = ls.sets.reduce<number | null>(
                    (m, s) => (s.weight_kg != null && (m == null || s.weight_kg > m) ? s.weight_kg : m),
                    null,
                )
                return { weightKg, repsDone: ls.sets.map((s) => s.reps_done) }
            })()
            const eff = effType === 'strength'
                ? computeEffectiveTarget(block, { currentWeek, weeksToRepeat, lastSession })
                : null
            const suggestedWeightKg = eff?.weightKg ?? block.target_weight_kg
            const prevList = previousHistory[exercise.id] ?? []
            const bestPrev = prevList.length
                ? prevList.reduce((mx, s) => ((s.weight_kg ?? 0) > (mx.weight_kg ?? 0) ? s : mx), prevList[0])
                : null
            const rxLabel = effType === 'strength'
                ? `${block.reps} reps${suggestedWeightKg != null ? ` · ${suggestedWeightKg} kg` : ''}`
                : formatTypedObjective(block, effType)
            return {
                block,
                exercise,
                effType,
                suggestedWeightKg,
                bestPrev,
                rxLabel,
                letter: letterByBlock.get(block.id) ?? '?',
            }
        })
        .filter((m): m is NonNullable<typeof m> => m != null)

    if (memberVMs.length < 2) return null

    // Orden/estado de ronda — SOLO consumo del engine (sin duplicar el intercalado ni el cierre).
    const roundBlocks: RoundMemberBlock[] = members.map((m) => ({ id: m.id, sets: m.sets }))
    const roundLogs: RoundLogLike[] = sessionLogs.map((l) => ({ block_id: l.block_id, set_number: l.set_number }))
    const order = buildRoundOrder(roundBlocks)
    const activePos = firstIncompleteInRounds(roundBlocks, roundLogs)
    const groupComplete = activePos == null
    const currentRound = activePos?.set ?? maxSets
    const activeBlockId = activePos?.blockId ?? null

    // Miembro que sigue DENTRO de la ronda (para el pill "Sin descanso — sigue con {letra}"): la
    // posición inmediatamente posterior en el orden intercalado, sólo si cae en la MISMA ronda.
    const activeIdx = order.findIndex((p) => p.blockId === activeBlockId && p.set === currentRound)
    const nextPos = activeIdx >= 0 ? order[activeIdx + 1] : undefined
    const nextInRound = nextPos && nextPos.set === currentRound ? nextPos : null
    const nextLetter = nextInRound ? letterByBlock.get(nextInRound.blockId) ?? null : null

    // Estado de un miembro relativo a la ronda actual.
    const memberState = (block: BlockType): 'active' | 'next' | 'done' => {
        if (groupComplete || block.sets < currentRound) return 'done'
        const logged = sessionLogs.some((l) => l.block_id === block.id && l.set_number === currentRound)
        if (logged) return 'done'
        return block.id === activeBlockId ? 'active' : 'next'
    }

    const firstName = memberVMs[0]?.exercise.name

    return (
        <div className="exec-v3-step exec-v3-ss space-y-3">
            {/* Título "Superserie {letra}" + chip de ronda con dots. */}
            <div className="exec-v3-ss-titrow">
                <h2 className="exec-v3-ss-tit">Superserie {groupLetter}</h2>
                <span className="exec-v3-roundchip">
                    Ronda {Math.min(currentRound, maxSets)} de {maxSets}
                    <span className="exec-v3-rounddots" aria-hidden>
                        {Array.from({ length: maxSets }).map((_, i) => {
                            const r = i + 1
                            const state = r < currentRound || groupComplete ? 'done' : r === currentRound ? 'now' : ''
                            return <span key={r} className={cn('exec-v3-rd', state === 'done' && 'is-done', state === 'now' && 'is-now')} />
                        })}
                    </span>
                </span>
            </div>

            {/* Miembros apilados: el ACTIVO con su LogSetForm; los demás colapsados con estado. */}
            <div className="space-y-2.5">
                {memberVMs.map((m) => {
                    const state = memberState(m.block)
                    const media = resolveExecMedia(m.exercise)
                    const sub = substitutionByBlock[m.block.id]
                    const isNext = nextInRound?.blockId === m.block.id
                    return (
                        <div
                            key={m.block.id}
                            ref={(el) => registerRowRef(m.block.id, currentRound, el)}
                            className={cn(
                                'exec-v3-excard',
                                state === 'active' && 'is-active',
                                state === 'next' && 'is-next',
                                state === 'done' && 'is-done',
                            )}
                        >
                            <div className="exec-v3-exhead">
                                <span className="exec-v3-exmini">
                                    {media.kind === 'image' && (
                                        <Image src={media.src} alt="" fill unoptimized className="object-contain" />
                                    )}
                                    {media.kind === 'video' && (
                                        <video src={media.src} muted loop playsInline autoPlay className="h-full w-full object-contain" />
                                    )}
                                    {(media.kind === 'none' || media.kind === 'youtube') && (
                                        <span className="exec-v3-exmini-empty" aria-hidden>
                                            <Dumbbell className="h-5 w-5" />
                                        </span>
                                    )}
                                </span>
                                <span className="exec-v3-exletter" aria-hidden>{m.letter}</span>
                                <span className="exec-v3-exinfo">
                                    <span className="exec-v3-exnm">{m.exercise.name}</span>
                                    <span className="exec-v3-exrx tabular-nums">{m.rxLabel}</span>
                                </span>
                                <span className="exec-v3-exhead-end">
                                    {state === 'active' && <span className="exec-v3-exstate is-now">Ahora</span>}
                                    {state === 'next' && isNext && <span className="exec-v3-exstate is-after">Sigue</span>}
                                    {state === 'done' && <span className="exec-v3-exstate is-done">Hecho</span>}
                                    {(m.exercise.gif_url || m.exercise.video_url) && (
                                        <button
                                            type="button"
                                            onClick={() => openTechnique(m.exercise)}
                                            className="exec-v3-extech"
                                            aria-label={`Ver técnica de ${m.exercise.name}`}
                                        >
                                            <Info className="h-3.5 w-3.5" aria-hidden />
                                        </button>
                                    )}
                                </span>
                            </div>

                            {/* Fila de captura del miembro ACTIVO — LogSetForm REUSADO (motor intacto). */}
                            {state === 'active' && (
                                <div className="exec-v3-setlist mt-2.5">
                                    <LogSetForm
                                        key={`${m.block.id}-${currentRound}`}
                                        blockId={m.block.id}
                                        setNumber={currentRound}
                                        restTimeStr={m.block.rest_time}
                                        warmupRestTimeStr={m.block.warmup_rest_time}
                                        totalSets={m.block.sets}
                                        nextUpLabel={firstName}
                                        existingLog={sessionLogs.find((l) => l.block_id === m.block.id && l.set_number === currentRound)}
                                        suggestedWeightKg={m.suggestedWeightKg}
                                        prThresholdKg={exerciseMaxes[m.exercise.id] ?? null}
                                        targetReps={m.block.reps}
                                        lastSet={m.bestPrev ? { weightKg: m.bestPrev.weight_kg, reps: m.bestPrev.reps_done } : null}
                                        autoTimerEnabled={autoTimerEnabled}
                                        mode={m.effType}
                                        isActive
                                        typedObjective={m.effType !== 'strength' ? formatTypedObjective(m.block, m.effType) : undefined}
                                        substitution={sub ? { exerciseId: sub.id, exerciseName: sub.name, reason: SUBSTITUTION_REASON } : null}
                                        supersetRest={{
                                            groupRestSeconds,
                                            closesRound: () => isRoundComplete(roundBlocks, currentRound, roundLogs, m.block.id),
                                        }}
                                        v3
                                        onLogged={onLogged}
                                        onResult={onResult}
                                    />
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Pill "Sin descanso — sigue con {letra}" (sólo si queda miembro en la ronda). */}
            {!groupComplete && nextLetter && (
                <div className="exec-v3-ss-link">
                    Sin descanso — sigue con {nextLetter}
                    <span className="exec-v3-ss-arrow" aria-hidden />
                </div>
            )}

            {/* Nota: el descanso completo llega al cerrar la ronda (no entre miembros). */}
            {!groupComplete && groupRestSeconds > 0 && (
                <div className="exec-v3-ss-restnote">
                    <span className="exec-v3-ss-clk" aria-hidden />
                    Descanso <b className="tabular-nums">{groupRestSeconds}s</b> al cerrar la ronda
                </div>
            )}

            {groupComplete && (
                <div className="exec-v3-ss-done">Superserie completa · {maxSets} ronda{maxSets === 1 ? '' : 's'}</div>
            )}
        </div>
    )
}
