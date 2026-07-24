'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Info, Dumbbell, Check, Pencil, X } from 'lucide-react'
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
    RUT_TYPE_META,
} from '../WorkoutExecutionClient'
import { resolveExecMedia } from './exec-media'
import { ExecMediaCard } from './ExecMediaCard'
import { WheelHint } from './WheelHint'

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
 * Ejecutor V3 (E3.5 + QA1) — presentación de la SUPERSERIE como paso del stepper. Traducción del mockup
 * `concepto-a-v3-tipos` (pantalla Superserie) con el rediseño del CEO (2026-07-22): el miembro ACTIVO se
 * muestra IGUAL que un ejercicio solo (media grande 150px + chips glass + prescripción + fila "Anterior"
 * + captura HERO `heroV3`, sólo la serie de la ronda actual), y los NO activos quedan colapsados a una
 * tarjeta compacta (mini-media 60px + badge de letra + estado hecho/pendiente). Al completar la serie del
 * miembro activo cuando queda otro en la MISMA ronda, la nueva tarjeta activa se EXPANDE (animación de
 * altura, curva estándar) y sale un aviso efímero "¡Sigue sin detenerte!" (auto-dismiss ~1,4 s, no
 * interactivo). El aviso NO aparece al cerrar la ronda (ahí manda el descanso).
 *
 * El ORDEN intercalado (A1 → B1 → A2 → B2…) y el cierre de ronda se derivan del engine `superset-rounds`
 * (buildRoundOrder / firstIncompleteInRounds / isRoundComplete) — no se duplica lógica. El descanso de
 * grupo lo dispara el MISMO `supersetRest` del LogSetForm al cerrar la ronda; este componente sólo
 * re-estiliza contenedores bajo `[data-exec-v3]`, sin tocar guardado/cola. `handleActiveLogged` sólo
 * envuelve `onLogged` para disparar el aviso (payload byte-idéntico).
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

    // Aviso "¡Sigue sin detenerte!" (overlay efímero) + prefill "= última vez" del miembro activo. Ambos
    // son estado LOCAL de UI: no rozan el motor de guardado/cola.
    const [cue, setCue] = useState<{ name: string; nonce: number } | null>(null)
    const [fill, setFill] = useState<{ weight: number | null; reps: number | null; nonce: number } | null>(null)
    const cueNonceRef = useRef(0)
    // Edición de un miembro YA HECHO de la ronda (QA2 #3): tap en su tarjeta colapsada abre un sheet oscuro
    // "Editar {nombre}" que monta las filas clásicas del motor (LogSetForm) para ese bloque — mismo patrón
    // que el lápiz del ejercicio solo. Estado LOCAL de UI: no roza el guardado/cola.
    const [editBlockId, setEditBlockId] = useState<string | null>(null)
    const reducedMotion = useReducedMotion()

    useEffect(() => {
        if (!cue) return
        // 1650ms > animación CSS de 1600ms (la barra ya salió de pantalla cuando se desmonta).
        const t = setTimeout(() => setCue(null), 1650)
        return () => clearTimeout(t)
    }, [cue])

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

    // Orden/estado de ronda — SOLO consumo del engine (sin duplicar el intercalado ni el cierre). Se
    // deriva ANTES del guard <2 (sin efectos) para que los hooks queden siempre sobre el early-return.
    const roundBlocks: RoundMemberBlock[] = members.map((m) => ({ id: m.id, sets: m.sets }))
    const roundLogs: RoundLogLike[] = sessionLogs.map((l) => ({ block_id: l.block_id, set_number: l.set_number }))
    const order = buildRoundOrder(roundBlocks)
    const activePos = firstIncompleteInRounds(roundBlocks, roundLogs)
    const groupComplete = activePos == null
    const currentRound = activePos?.set ?? maxSets
    const activeBlockId = activePos?.blockId ?? null

    // Miembro que sigue DENTRO de la ronda (para el aviso "¡Sigue sin detenerte!"): la posición
    // inmediatamente posterior en el orden intercalado, sólo si cae en la MISMA ronda.
    const activeIdx = order.findIndex((p) => p.blockId === activeBlockId && p.set === currentRound)
    const nextPos = activeIdx >= 0 ? order[activeIdx + 1] : undefined
    const nextInRound = nextPos && nextPos.set === currentRound ? nextPos : null

    // El prefill "= última vez" es POR miembro activo: al cambiar de miembro se descarta para no arrastrar
    // el autollenado al siguiente ejercicio.
    useEffect(() => {
        setFill(null)
    }, [activeBlockId])

    if (memberVMs.length < 2) return null

    // Estado de un miembro relativo a la ronda actual.
    const memberState = (block: BlockType): 'active' | 'next' | 'done' => {
        if (groupComplete || block.sets < currentRound) return 'done'
        const logged = sessionLogs.some((l) => l.block_id === block.id && l.set_number === currentRound)
        if (logged) return 'done'
        return block.id === activeBlockId ? 'active' : 'next'
    }

    const firstName = memberVMs[0]?.exercise.name

    // Miembro que se está editando (sheet QA2 #3) + sus series YA registradas (filas clásicas del motor).
    const editVM = editBlockId ? memberVMs.find((v) => v.block.id === editBlockId) : null
    const editLogs = editVM
        ? sessionLogs
              .filter((l) => l.block_id === editVM.block.id && l.set_number >= 1 && l.set_number <= editVM.block.sets)
              .sort((a, b) => a.set_number - b.set_number)
        : []

    // Envoltura de `onLogged`: dispara el aviso "¡Sigue sin detenerte!" SOLO cuando lo que se confirma
    // es LA serie de la ronda actual del miembro activo (QA3: editar una serie pasada — lápiz o tarjeta
    // hecha — reusa el mismo motor y NO debe avisar). Payload intacto → motor sin tocar.
    const handleActiveLogged = (payload: OptimisticLogPayload) => {
        const esSerieActiva = payload.blockId === activeBlockId && payload.setNumber === currentRound
        if (esSerieActiva && nextInRound) {
            const nextVM = memberVMs.find((v) => v.block.id === nextInRound.blockId)
            if (nextVM) setCue({ name: nextVM.exercise.name, nonce: ++cueNonceRef.current })
        }
        onLogged(payload)
    }

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

            {/* Miembros apilados: el ACTIVO como ejercicio solo; los demás colapsados con estado. */}
            <div className="space-y-2.5">
                {memberVMs.map((m) => {
                    const state = memberState(m.block)
                    const sub = substitutionByBlock[m.block.id]
                    const isNext = nextInRound?.blockId === m.block.id
                    const hasTech = !!(m.exercise.gif_url || m.exercise.video_url)

                    // MIEMBRO ACTIVO — presentación de ejercicio solo (media 150px + rx + Anterior + hero).
                    if (state === 'active') {
                        return (
                            <div
                                key={m.block.id}
                                ref={(el) => registerRowRef(m.block.id, currentRound, el)}
                                className="exec-v3-excard is-active"
                            >
                                <div className="exec-v3-ss-activetop">
                                    <span className="exec-v3-exletter" aria-hidden>{m.letter}</span>
                                    <span className="exec-v3-exstate is-now">Ahora</span>
                                </div>
                                <h3 className="exec-v3-exname">{m.exercise.name}</h3>
                                <div className="exec-v3-ss-activechips">
                                    <span className="exec-v3-chip">
                                        {RUT_TYPE_META[m.effType].label} · {m.exercise.muscle_group}
                                    </span>
                                </div>

                                {/* Cuerpo expandible: entra con animación de altura (curva estándar). */}
                                <div className="exec-v3-ss-body">
                                    <div className="exec-v3-ss-body-in space-y-3">
                                        <ExecMediaCard
                                            exercise={m.exercise}
                                            note={m.block.notes?.trim() || null}
                                            openTechnique={openTechnique}
                                        />

                                        <div className="exec-v3-rx tabular-nums">{m.rxLabel}</div>

                                        {m.bestPrev && (m.bestPrev.weight_kg != null || m.bestPrev.reps_done != null) && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setFill({
                                                        weight: m.bestPrev!.weight_kg,
                                                        reps: m.bestPrev!.reps_done,
                                                        nonce: Date.now(),
                                                    })
                                                }
                                                className="exec-v3-prev"
                                                aria-label={
                                                    m.bestPrev.weight_kg
                                                        ? `Autollenar la serie activa con ${m.bestPrev.weight_kg} kg por ${m.bestPrev.reps_done ?? '-'} reps`
                                                        : undefined
                                                }
                                            >
                                                <span className="exec-v3-prev-l">Anterior</span>
                                                <span className="exec-v3-prev-r tabular-nums">
                                                    {m.bestPrev.weight_kg ? `${m.bestPrev.weight_kg} kg` : '-'} × {m.bestPrev.reps_done || '-'}
                                                </span>
                                                <span className="exec-v3-prev-tap">1 tap ↻</span>
                                            </button>
                                        )}

                                        <WheelHint />

                                        <div className="exec-v3-setlist">
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
                                                prefill={fill ?? undefined}
                                                typedObjective={m.effType !== 'strength' ? formatTypedObjective(m.block, m.effType) : undefined}
                                                substitution={sub ? { exerciseId: sub.id, exerciseName: sub.name, reason: SUBSTITUTION_REASON } : null}
                                                supersetRest={{
                                                    groupRestSeconds,
                                                    closesRound: () => isRoundComplete(roundBlocks, currentRound, roundLogs, m.block.id),
                                                }}
                                                v3
                                                heroV3
                                                onLogged={handleActiveLogged}
                                                onResult={onResult}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    }

                    // MIEMBROS NO ACTIVOS — tarjeta compacta (mini-media 60px + estado). Los HECHOS abren
                    // el sheet de edición al tocarlos (QA2 #3); los pendientes no son interactivos.
                    const media = resolveExecMedia(m.exercise)
                    const editable = state === 'done'
                    return (
                        <div
                            key={m.block.id}
                            ref={(el) => registerRowRef(m.block.id, currentRound, el)}
                            className={cn(
                                'exec-v3-excard',
                                state === 'next' && 'is-next',
                                state === 'done' && 'is-done',
                                editable && 'exec-v3-excard-edit',
                            )}
                            role={editable ? 'button' : undefined}
                            tabIndex={editable ? 0 : undefined}
                            onClick={editable ? () => setEditBlockId(m.block.id) : undefined}
                            onKeyDown={
                                editable
                                    ? (e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                              e.preventDefault()
                                              setEditBlockId(m.block.id)
                                          }
                                      }
                                    : undefined
                            }
                            aria-label={editable ? `Editar ${m.exercise.name}` : undefined}
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
                                    {state === 'next' && isNext && <span className="exec-v3-exstate is-after">Sigue</span>}
                                    {state === 'done' && (
                                        <>
                                            <span className="exec-v3-exedit" aria-hidden>
                                                <Pencil className="h-3.5 w-3.5" strokeWidth={2.4} />
                                            </span>
                                            <span className="exec-v3-exdone" aria-label="Hecho">
                                                <Check className="h-4 w-4" aria-hidden strokeWidth={3} />
                                            </span>
                                        </>
                                    )}
                                    {hasTech && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                openTechnique(m.exercise)
                                            }}
                                            className="exec-v3-extech"
                                            aria-label={`Ver técnica de ${m.exercise.name}`}
                                        >
                                            <Info className="h-3.5 w-3.5" aria-hidden />
                                        </button>
                                    )}
                                </span>
                            </div>
                        </div>
                    )
                })}
            </div>

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

            {/* Aviso efímero "¡Sigue sin detenerte!" (QA3, diseño CEO): SIN scrim de pantalla completa —
                una barra negra horizontal a media pantalla que entra desde la DERECHA, muestra las letras
                (marca + glow, sin contorno) y sale entera hacia la IZQUIERDA. No interactivo. El `key`
                por nonce reinicia la animación si se encadena otro aviso. */}
            {cue && (
                <div key={cue.nonce} className="exec-v3-ss-cue" role="status" aria-live="polite">
                    <div className="exec-v3-ss-cuebar">
                        <span className="exec-v3-ss-cue-t">¡Sigue sin detenerte!</span>
                        <span className="exec-v3-ss-cue-n">{cue.name}</span>
                    </div>
                </div>
            )}

            {/* Sheet oscuro "Editar {nombre}" (QA2 #3): monta las filas CLÁSICAS del motor (LogSetForm) del
                miembro ya hecho para corregir sus series registradas — mismo motor de edición del lápiz del
                ejercicio solo, sólo envuelto en el sheet V3. `onLogged` plano (NO dispara el aviso). */}
            <AnimatePresence>
                {editVM && (
                    <>
                        <motion.button
                            type="button"
                            aria-label="Cerrar edición"
                            onClick={() => setEditBlockId(null)}
                            className="exec-v3-sheet-scrim"
                            initial={reducedMotion ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={reducedMotion ? undefined : { opacity: 0 }}
                        />
                        <motion.div
                            className="exec-v3-settings"
                            role="dialog"
                            aria-modal="true"
                            aria-label={`Editar ${editVM.exercise.name}`}
                            initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
                            animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
                            exit={reducedMotion ? { opacity: 0 } : { y: '100%' }}
                            transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 38 }}
                        >
                            <div className="pt-1">
                                <span className="exec-v3-handle" aria-hidden />
                            </div>
                            <div className="exec-v3-settings-hd">
                                <span className="exec-v3-settings-t">Editar {editVM.exercise.name}</span>
                                <button
                                    type="button"
                                    onClick={() => setEditBlockId(null)}
                                    aria-label="Cerrar"
                                    className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-dark-muted transition-colors hover:bg-white/[0.06] hover:text-on-dark"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="exec-v3-setlist space-y-1.5 overflow-y-auto pb-[calc(8px+env(safe-area-inset-bottom,0px))]">
                                {editLogs.length > 0 ? (
                                    editLogs.map((log) => (
                                        <LogSetForm
                                            key={`${editVM.block.id}-edit-${log.set_number}`}
                                            blockId={editVM.block.id}
                                            setNumber={log.set_number}
                                            restTimeStr={editVM.block.rest_time}
                                            warmupRestTimeStr={editVM.block.warmup_rest_time}
                                            totalSets={editVM.block.sets}
                                            nextUpLabel={editVM.exercise.name}
                                            existingLog={log}
                                            suggestedWeightKg={editVM.suggestedWeightKg}
                                            prThresholdKg={exerciseMaxes[editVM.exercise.id] ?? null}
                                            targetReps={editVM.block.reps}
                                            lastSet={
                                                editVM.bestPrev
                                                    ? { weightKg: editVM.bestPrev.weight_kg, reps: editVM.bestPrev.reps_done }
                                                    : null
                                            }
                                            autoTimerEnabled={autoTimerEnabled}
                                            mode={editVM.effType}
                                            typedObjective={
                                                editVM.effType !== 'strength'
                                                    ? formatTypedObjective(editVM.block, editVM.effType)
                                                    : undefined
                                            }
                                            substitution={
                                                substitutionByBlock[editVM.block.id]
                                                    ? {
                                                          exerciseId: substitutionByBlock[editVM.block.id]!.id,
                                                          exerciseName: substitutionByBlock[editVM.block.id]!.name,
                                                          reason: SUBSTITUTION_REASON,
                                                      }
                                                    : null
                                            }
                                            v3
                                            heroV3
                                            onLogged={onLogged}
                                            onResult={onResult}
                                        />
                                    ))
                                ) : (
                                    <p className="py-3 text-center text-sm text-on-dark-muted">
                                        Todavía no registras ninguna serie de este ejercicio.
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    )
}
