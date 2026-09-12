'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { Info, Dumbbell, Check, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePostHog } from 'posthog-js/react'
import {
    captureGapsFor,
    formatStrengthTimeSetLine,
    isStrengthTimeBlock,
    type HoldCaptureGap,
    type HoldSource,
    buildRoundOrder,
    firstIncompleteInRounds,
    isRoundComplete,
    formatTypedObjective,
    sessionLogKey,
    type RoundMemberBlock,
    type RoundLogLike,
    type OptimisticLogPayload,
    type RepeatSeedEntry,
    SIDE_LABEL,
} from '@eva/workout-engine'
import {
    decideHoldCapturePrompt,
    holdCaptureValuesFromCommit,
    type HoldCaptureFocus,
} from './hold-capture-prompt'
import { computeEffectiveTarget } from '@/lib/workout/progression'
import { effectiveExerciseType } from '@/lib/workout-exercise-type'
import type { ExerciseType as WorkoutKind } from '@/domain/workout/types'
import { LogSetForm, type HoldPrefill, type SetSyncResult } from '../LogSetForm'
import {
    type BlockType,
    type ExerciseType,
    type WorkoutSessionLog,
    type SupersetInfo,
    type SessionSubstitution,
    type PendingRoundRest,
    RUT_TYPE_META,
} from '../WorkoutExecutionClient'
import { resolveExecMedia } from './exec-media'
import { ExecMediaCard } from './ExecMediaCard'
import { HoldModuleV3, type HoldModuleStatus } from './HoldModuleV3'
import { RestOfferV3 } from './RestOfferV3'
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
    /**
     * Semilla de "repetir el día" indexada por `(block_id, set_number)` (engine `buildRepeatSeedMap`).
     * En la superserie la serie del miembro activo es la RONDA en curso → la entrada se resuelve por
     * (bloque, ronda). Sólo pre-llena; no marca nada como registrado. Ausente ⇒ sesión normal.
     */
    seedByKey?: Map<string, RepeatSeedEntry>
    /**
     * ¿La sesión entera es un "repetir el día"? Propiedad de la SESIÓN, no de la fila (una serie que ese
     * día no se hizo no tiene semilla y sigue siendo parte del día repetido). Endurece el umbral de PR:
     * igualar el máximo no celebra, sólo superarlo. Ausente ⇒ sesión normal.
     */
    isRepeatSession?: boolean
    autoTimerEnabled: boolean
    /** Sustitución activa por bloque (mismo shape del padre; se pasa tal cual al LogSetForm). */
    substitutionByBlock: Record<string, SessionSubstitution | undefined>
    onLogged: (payload: OptimisticLogPayload) => void
    onResult: (blockId: string, setNumber: number, result: SetSyncResult) => void
    openTechnique: (exercise: ExerciseType | null) => void
    registerRowRef: (blockId: string, setNumber: number, el: HTMLDivElement | null) => void
    getExercise: (block: BlockType) => ExerciseType | null
    /**
     * Descanso de GRUPO diferido (**D2/R28**, `specs/cuenta-atras-en-pantalla`, W4.7). Lo arma el
     * ORQUESTADOR en el commit cuando la ronda cierra con la preferencia «Pasar solo al descanso»
     * APAGADA: acá nadie llamó a `startRest`, así que este paso pinta el CTA
     * **«Ronda lista · Descansar N s»** (W4.11, `[UI · Fable]`). `null` ⇒ no hay ronda esperando
     * (pref ON, la ronda no cerró, o el descanso ya arrancó).
     */
    pendingRoundRest?: PendingRoundRest | null
    /**
     * Handler del CTA de arriba: llama al **mismo** `startRest` del provider —
     * `startRest(String(seconds), { label })`, con «Ronda N de M · siguiente» dentro de `label`
     * porque en web no existe `countKind` (R28)— y limpia el estado pendiente.
     */
    onStartPendingRoundRest?: () => void
    /**
     * «Siguiente ronda» del mismo par (reporte del alumno 2026-09-11): descarta el descanso de grupo
     * sin arrancarlo. Existe porque saltarse el descanso lo decide el ALUMNO y porque el avance al
     * siguiente paso queda DIFERIDO hasta que este CTA se resuelve: sin salida, un grupo ya completo
     * se quedaba esperando un toque que no tenía botón.
     */
    onDismissPendingRoundRest?: () => void
}

const SUBSTITUTION_REASON = 'Máquina ocupada'

/**
 * Bandas marquee de la superserie (pedido CEO, web + RN): recordatorio PERSISTENTE arriba y abajo del
 * miembro activo mientras la superserie sigue viva (el aviso efímero `exec-v3-ss-cuebar` es otra cosa).
 * La frase va repetida para que la cinta llene el ancho y el loop `translateX(0 → -50%)` no deje huecos:
 * las dos copias del track son idénticas, así que el corte es invisible.
 */
const MARQUEE_PHRASE = 'CONTINÚA SIN DESCANSO'
const MARQUEE_RUN = `${Array.from({ length: 4 }, () => MARQUEE_PHRASE).join(' • ')} • `

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
    seedByKey,
    isRepeatSession,
    autoTimerEnabled,
    substitutionByBlock,
    onLogged,
    onResult,
    openTechnique,
    registerRowRef,
    getExercise,
    pendingRoundRest = null,
    onStartPendingRoundRest,
    onDismissPendingRoundRest,
}: SupersetStepV3Props) {
    const { members, letterByBlock, groupLetter, groupRestSeconds, maxSets } = info

    // Aviso "¡Sigue sin detenerte!" (overlay efímero) + prefill "= última vez" del miembro activo. Ambos
    // son estado LOCAL de UI: no rozan el motor de guardado/cola.
    const [cue, setCue] = useState<{ name: string; nonce: number; long?: boolean } | null>(null)
    // Puente módulo de hold ↔ fila del miembro activo (W4.11): lo medido va a `holdPrefill` de la fila
    // (por nonce, uncontrolled); el estado del reloj oculta la fila con `hidden` + `inert` mientras
    // corre (R26: NUNCA se desmonta — el `<form>` es el destino del auto-envío); la fuente del último
    // envío alarga el CueBar cuando salió sin gesto (R23).
    const [holdPrefill, setHoldPrefill] = useState<HoldPrefill | null>(null)
    const [holdStatus, setHoldStatus] = useState<HoldModuleStatus>('idle')
    const lastHoldSourceRef = useRef<HoldSource | null>(null)
    const [fill, setFill] = useState<{ weight: number | null; reps: number | null; nonce: number } | null>(null)
    const cueNonceRef = useRef(0)
    // Edición de un miembro YA HECHO de la ronda (QA2 #3): tap en su tarjeta colapsada abre un sheet oscuro
    // "Editar {nombre}" que monta las filas clásicas del motor (LogSetForm) para ese bloque — mismo patrón
    // que el lápiz del ejercicio solo. Estado LOCAL de UI: no roza el guardado/cola.
    const [editBlockId, setEditBlockId] = useState<string | null>(null)
    /**
     * Sheet de HUECOS dentro de la de edición (specs/reps-tras-el-reloj, R10/W3.2): el reloj de un
     * miembro de fuerza por tiempo llegó a 0 y falta anotar reps (o el peso). Se REUSA `editBlockId`
     * —la sheet ya existe— y esto sólo describe la serie que hay que abrir, en qué caja va el foco y
     * qué copy mostrar. `null` con `editBlockId` puesto ⇒ edición de siempre (tap en la tarjeta hecha).
     */
    const [editPrompt, setEditPrompt] = useState<{
        blockId: string
        setNumber: number
        focus: HoldCaptureFocus
        missing: HoldCaptureGap[]
        /** `'timer'` ⇒ copy de huecos (SPEC §6). `'manual'` ⇒ la cabecera de edición de siempre. */
        trigger: 'timer' | 'manual'
        nonce: number
    } | null>(null)
    /**
     * R3 se ARMA en `onMeasured` (único punto con `submit`/`expiredWhileAway`) y se RESUELVE en
     * `handleActiveLogged`, con los valores que de verdad se guardaron. Ref: entre las dos llamadas no
     * hay render de por medio.
     */
    const promptArmRef = useRef<{
        blockId: string
        setNumber: number
        kind: 'mobility' | 'strength_time'
        expiredWhileAway: boolean
    } | null>(null)
    /** Peso al abrir la sheet — alimenta `weight_changed` de `hold_capture_resolved` (SPEC §7). */
    const promptWeightRef = useRef<number | null>(null)
    const sheetRef = useRef<HTMLDivElement>(null)
    /**
     * Nonce monótono de apertura de la sheet (mismo patrón que `cueNonceRef`). No es `Date.now()`:
     * es impuro y estas funciones se arman en el cuerpo del componente.
     */
    const promptNonceRef = useRef(0)
    const ph = usePostHog()
    const reducedMotion = useReducedMotion()

    useEffect(() => {
        if (!cue) return
        // 1650ms > animación CSS de 1600ms (la barra ya salió de pantalla cuando se desmonta). R23: cuando
        // el origen es el RELOJ el aviso sale sin gesto del alumno ⇒ se sostiene más (2400 ms).
        const t = setTimeout(() => setCue(null), cue.long ? 2400 : 1650)
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
        // El puente del módulo es por miembro activo Y por ronda (la ronda 2 arranca en 0).
        setHoldPrefill(null)
        setHoldStatus('idle')
        lastHoldSourceRef.current = null
    }, [activeBlockId, currentRound])

    /**
     * Foco programático en la caja que falta (R10). Riesgo 6: `formIdentityKey` re-monta el `<form>`
     * cuando la reconciliación del optimismo cambia la identidad de la serie ⇒ se reintenta una vez, y
     * sólo si el foco no quedó ya dentro de la sheet (para no robárselo al alumno).
     */
    const promptNonce = editPrompt?.nonce
    const promptFocus = editPrompt?.focus
    useEffect(() => {
        if (promptNonce == null) return
        const selector = promptFocus === 'weight' ? 'input[name="weight_kg"]' : 'input[name="reps_done"]'
        const apply = () => {
            const root = sheetRef.current
            if (!root || root.contains(document.activeElement)) return
            root.querySelector<HTMLInputElement>(selector)?.focus()
        }
        const raf = requestAnimationFrame(apply)
        const retry = setTimeout(apply, 180)
        return () => {
            cancelAnimationFrame(raf)
            clearTimeout(retry)
        }
    }, [promptNonce, promptFocus])

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
    // R10: la sheet abierta POR EL PROMPT de huecos (vs. el tap de siempre en la tarjeta hecha).
    const activePrompt = editVM && editPrompt?.blockId === editVM.block.id ? editPrompt : null
    // Sólo el prompt del RELOJ trae el copy de huecos; desde «Editar» la sheet conserva su cabecera
    // de siempre y su primario «Guardar» (SPEC §6, último párrafo).
    const promptCopy = activePrompt?.trigger === 'timer' ? activePrompt : null
    const promptHoldSec = activePrompt
        ? (sessionLogs.find(
              (l) => l.block_id === activePrompt.blockId && l.set_number === activePrompt.setNumber,
          )?.actual_hold_sec ?? null)
        : null
    // Predicado ÚNICO del motor, igual que en la captura: sin esto la fila de edición perdería la
    // caja de segundos y el UPDATE dejaría `actual_hold_sec` en NULL.
    const editIsStrengthTime = !!editVM && editVM.effType === 'strength' && isStrengthTimeBlock(editVM.block, editVM.exercise)

    // Envoltura de `onLogged`: dispara el aviso "¡Sigue sin detenerte!" SOLO cuando lo que se confirma
    // es LA serie de la ronda actual del miembro activo (QA3: editar una serie pasada — lápiz o tarjeta
    // hecha — reusa el mismo motor y NO debe avisar). Payload intacto → motor sin tocar.
    const handleActiveLogged = (payload: OptimisticLogPayload) => {
        const esSerieActiva = payload.blockId === activeBlockId && payload.setNumber === currentRound
        if (esSerieActiva && nextInRound) {
            const nextVM = memberVMs.find((v) => v.block.id === nextInRound.blockId)
            if (nextVM) setCue({ name: nextVM.exercise.name, nonce: ++cueNonceRef.current, long: lastHoldSourceRef.current === 'timer' })
        }
        lastHoldSourceRef.current = null
        onLogged(payload)
        // R3/R10: la sheet se abre DESPUÉS del optimismo del padre — así `editLogs` ya trae la serie
        // recién cerrada. El avance de miembro (V4) ocurre por detrás; el alumno cierra y sigue.
        const armed = promptArmRef.current
        promptArmRef.current = null
        if (!armed || armed.blockId !== payload.blockId || armed.setNumber !== payload.setNumber) return
        const decision = decideHoldCapturePrompt({
            submit: true,
            kind: armed.kind,
            expiredWhileAway: armed.expiredWhileAway,
            values: holdCaptureValuesFromCommit(payload),
        })
        if (!decision.open) return
        promptWeightRef.current = payload.weightKg ?? null
        setEditBlockId(armed.blockId)
        setEditPrompt({
            blockId: armed.blockId,
            setNumber: payload.setNumber,
            focus: decision.focus,
            missing: decision.missing,
            trigger: 'timer',
            nonce: ++promptNonceRef.current,
        })
        ph?.capture('hold_capture_prompted', {
            block_id: armed.blockId,
            exercise_type: 'strength',
            context: 'superset',
            missing: decision.missing,
            trigger: 'timer',
            platform: 'web',
        })
    }
    /**
     * Cierra la sheet por cualquiera de las dos vías. `hold_capture_resolved` sale UNA vez por
     * apertura y sólo cuando hubo apertura contada (`editPrompt`): el tap en un miembro que no es de
     * fuerza por tiempo abre la sheet de edición de siempre y no entra a esta analítica.
     */
    const closeEditSheet = (outcome: 'saved' | 'dismissed', payload?: OptimisticLogPayload) => {
        if (editPrompt) {
            ph?.capture('hold_capture_resolved', {
                block_id: editPrompt.blockId,
                context: 'superset',
                outcome,
                reps_filled: (payload?.repsDone ?? 0) > 0,
                weight_changed: outcome === 'saved' && (payload?.weightKg ?? null) !== promptWeightRef.current,
            })
        }
        setEditPrompt(null)
        setEditBlockId(null)
    }
    /**
     * «Editar» (R7) — tap en la tarjeta de un miembro HECHO. Cuando ese miembro es de fuerza por
     * tiempo, la sheet abre DIRECTO sobre su última serie con foco en REPS (R7: «Editar» = foco reps,
     * sin el copy de huecos) y la apertura se cuenta con `trigger: 'manual'` (riesgo 9: así no se
     * confunde con la apertura automática del reloj). Para el resto de los miembros es la sheet de
     * siempre, byte-idéntica.
     */
    const openEditSheet = (blockId: string) => {
        setEditBlockId(blockId)
        const vm = memberVMs.find((v) => v.block.id === blockId)
        if (!vm || vm.effType !== 'strength' || !isStrengthTimeBlock(vm.block, vm.exercise)) {
            setEditPrompt(null)
            return
        }
        const log = sessionLogs
            .filter((l) => l.block_id === blockId && l.set_number <= vm.block.sets)
            .sort((a, b) => b.set_number - a.set_number)[0]
        if (!log) {
            setEditPrompt(null)
            return
        }
        const missing = captureGapsFor(
            holdCaptureValuesFromCommit({ weightKg: log.weight_kg, repsDone: log.reps_done }),
            'strength_time',
        )
        promptWeightRef.current = log.weight_kg
        setEditPrompt({
            blockId,
            setNumber: log.set_number,
            focus: 'reps',
            missing,
            trigger: 'manual',
            nonce: ++promptNonceRef.current,
        })
        ph?.capture('hold_capture_prompted', {
            block_id: blockId,
            exercise_type: 'strength',
            context: 'superset',
            missing,
            trigger: 'manual',
            platform: 'web',
        })
    }
    /**
     * Guardado desde la sheet: `onLogged` PLANO (no dispara el aviso «¡Sigue sin detenerte!»). La
     * sheet se cierra SÓLO cuando lo guardado es la serie que el prompt vino a completar; corregir
     * otras series del mismo miembro deja la sheet abierta, byte-idéntico al comportamiento previo.
     */
    const handleEditLogged = (payload: OptimisticLogPayload) => {
        if (editPrompt && editPrompt.blockId === payload.blockId && editPrompt.setNumber === payload.setNumber) {
            closeEditSheet('saved', payload)
        }
        onLogged(payload)
    }
    const nextMemberName = nextInRound ? memberVMs.find((v) => v.block.id === nextInRound.blockId)?.exercise.name ?? null : null

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
                        // Mismo gate que la nota de descanso: las bandas mueren al cerrar la superserie.
                        const showMarquee = !groupComplete
                        return (
                            // `data-testid` sólo en la tarjeta ACTIVA (W6.10): el spec de Playwright
                            // apuntaba por clase (`.exec-v3-excard.is-active`) y un re-skin lo dejaba ciego.
                            <div
                                key={m.block.id}
                                ref={(el) => registerRowRef(m.block.id, currentRound, el)}
                                className={cn('exec-v3-excard is-active', showMarquee && 'exec-v3-ss-hasmarquee')}
                                data-testid="ss-member-active"
                            >
                                {showMarquee &&
                                    (['is-top', 'is-bottom'] as const).map((pos) => (
                                        <div key={pos} className={cn('exec-v3-ss-marquee', pos)} aria-hidden="true">
                                            <div className="exec-v3-ss-marquee-track">
                                                <span>{MARQUEE_RUN}</span>
                                                <span aria-hidden="true">{MARQUEE_RUN}</span>
                                            </div>
                                            {/* Reduced-motion: la cinta se apaga y queda esta frase quieta y centrada. */}
                                            <span className="exec-v3-ss-marquee-static">{MARQUEE_PHRASE}</span>
                                        </div>
                                    ))}
                                <div className="exec-v3-ss-activetop">
                                    <span className="exec-v3-exletter" aria-hidden>{m.letter}</span>
                                    <span className="exec-v3-exstate is-now">Ahora</span>
                                </div>
                                <h3 className="exec-v3-exname">{m.exercise.name}</h3>
                                <div className="exec-v3-ss-activechips">
                                    <span className="exec-v3-chip">
                                        {RUT_TYPE_META[m.effType].label} · {m.exercise.muscle_group}
                                    </span>
                                    {/* Chip «Por lado»/«Alternado» (R39), rótulo del motor. */}
                                    {m.block.side_mode && SIDE_LABEL[m.block.side_mode] ? (
                                        <span className="exec-v3-chip">{SIDE_LABEL[m.block.side_mode]}</span>
                                    ) : null}
                                </div>

                                {/* Cuerpo expandible: entra con animación de altura (curva estándar). */}
                                <div className="exec-v3-ss-body">
                                    <div className="exec-v3-ss-body-in space-y-3">
                                        <ExecMediaCard
                                            exercise={m.exercise}
                                            note={m.block.notes?.trim() || null}
                                            openTechnique={openTechnique}
                                        />

                                        {/* Módulo de hold compacto (80 px) DEBAJO de la media (W4.11, V1). Predicado único
                                            R29: movilidad con `duration_sec > 0` o fuerza por tiempo; sin reloj que montar la
                                            fila manual de siempre queda tal cual. A 0 guarda solo por `holdPrefill.submit` y
                                            el miembro avanza (V4); el último de la ronda espera el toque (D2). */}
                                        {(() => {
                                            const holdKind =
                                                m.effType === 'mobility' && (m.block.duration_sec ?? 0) > 0
                                                    ? ('mobility' as const)
                                                    : m.effType === 'strength' && isStrengthTimeBlock(m.block, m.exercise)
                                                      ? ('strength_time' as const)
                                                      : null
                                            if (!holdKind) return null
                                            return (
                                                <HoldModuleV3
                                                    kind={holdKind}
                                                    size="ss"
                                                    blockId={m.block.id}
                                                    prescribedSec={m.block.duration_sec ?? 0}
                                                    sideMode={m.block.side_mode}
                                                    context="superset"
                                                    closesRound={!nextInRound}
                                                    resetKey={`${m.block.id}:${currentRound}`}
                                                    suspended={false}
                                                    accent={holdKind === 'mobility' ? 'var(--exec-recovery, #18abd4)' : undefined}
                                                    nextLabel={nextMemberName}
                                                    onMeasured={(hm) => {
                                                        lastHoldSourceRef.current = hm.submit ? hm.source : null
                                                        // R3 armado: sólo un envío real (lado `single`
                                                        // o `right`) puede abrir la sheet de huecos.
                                                        promptArmRef.current = hm.submit
                                                            ? {
                                                                  blockId: m.block.id,
                                                                  setNumber: currentRound,
                                                                  kind: holdKind,
                                                                  expiredWhileAway: hm.expiredWhileAway,
                                                              }
                                                            : null
                                                        setHoldPrefill({ holdSec: hm.holdSec, leftSec: hm.leftSec, rightSec: hm.rightSec, submit: hm.submit, source: hm.source, nonce: hm.nonce })
                                                    }}
                                                    onStatusChange={setHoldStatus}
                                                    testIdPrefix={`hold-ss-${m.block.id}`}
                                                />
                                            )
                                        })()}

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

                                        {/* R8/R26: con el reloj CORRIENDO la fila se oculta con `hidden` + `inert`, NUNCA se
                                            desmonta — si el `<form>` desapareciera, `holdPrefill.submit` no tendría a quién llamar y
                                            el guardado automático se perdería en silencio. En `paused` vuelve a verse, editable. */}
                                        <div className="exec-v3-setlist" hidden={holdStatus === 'running'} inert={holdStatus === 'running' ? true : undefined}>
                                            <LogSetForm
                                                key={`${m.block.id}-${currentRound}`}
                                                blockId={m.block.id}
                                                sideMode={m.block.side_mode}
                                                strengthTimeMode={m.effType === 'strength' && isStrengthTimeBlock(m.block, m.exercise)}
                                                holdPrefill={holdPrefill ?? undefined}
                                                setNumber={currentRound}
                                                restTimeStr={m.block.rest_time}
                                                warmupRestTimeStr={m.block.warmup_rest_time}
                                                totalSets={m.block.sets}
                                                nextUpLabel={firstName}
                                                existingLog={sessionLogs.find((l) => l.block_id === m.block.id && l.set_number === currentRound)}
                                                seed={seedByKey?.get(sessionLogKey(m.block.id, currentRound))}
                                                isRepeatSession={isRepeatSession}
                                                suggestedWeightKg={m.suggestedWeightKg}
                                                prThresholdKg={exerciseMaxes[m.exercise.id] ?? null}
                                                targetReps={m.block.reps}
                                                lastSet={m.bestPrev ? { weightKg: m.bestPrev.weight_kg, reps: m.bestPrev.reps_done } : null}
                                                autoTimerEnabled={autoTimerEnabled}
                                                mode={m.effType}
                                                isActive
                                                prefill={fill ?? undefined}
                                                // Un miembro de superserie puede ser tipado: los ejes salen del
                                                // motor igual que en la pantalla dedicada (unidad prescrita G3 +
                                                // modalidad Fase C). En strength ambas props son inertes.
                                                distanceUnit={m.block.distance_unit ?? null}
                                                cardioModality={m.exercise.cardio_modality ?? null}
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
                    // R7 · línea «Serie N · 10 kg × 30 s» del miembro HECHO de fuerza por tiempo. En
                    // superserie la única acción es «Editar», y ya existe: la tarjeta entera es el
                    // botón que abre la sheet (`aria-label="Editar …"`). «Repetir» no aplica acá
                    // (R8/R13: la unidad de repetición de una superserie es la RONDA).
                    const doneHoldLog =
                        editable && m.effType === 'strength' && isStrengthTimeBlock(m.block, m.exercise)
                            ? sessionLogs
                                  .filter((l) => l.block_id === m.block.id && l.set_number <= m.block.sets)
                                  .sort((a, b) => b.set_number - a.set_number)[0]
                            : undefined
                    const doneHoldLine = doneHoldLog
                        ? formatStrengthTimeSetLine({
                              weight_kg: doneHoldLog.weight_kg,
                              reps_done: doneHoldLog.reps_done,
                              actual_hold_sec: doneHoldLog.actual_hold_sec ?? null,
                              metadata: doneHoldLog.metadata,
                          })
                        : null
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
                            onClick={editable ? () => openEditSheet(m.block.id) : undefined}
                            onKeyDown={
                                editable
                                    ? (e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                              e.preventDefault()
                                              openEditSheet(m.block.id)
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
                                    {/* Hecho el hold, lo que hizo manda sobre el objetivo (R7). */}
                                    <span className="exec-v3-exrx tabular-nums">
                                        {doneHoldLine && doneHoldLog
                                            ? `Serie ${doneHoldLog.set_number} · ${doneHoldLine}`
                                            : m.rxLabel}
                                    </span>
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

            {/* D2 / R24: la ronda cerró con la preferencia «Pasar solo al descanso» apagada ⇒ el descanso de
                grupo quedó ARMADO en el orquestador y el alumno lo arranca acá («Ronda N de M» viaja en `label`). */}
            {pendingRoundRest && onStartPendingRoundRest ? (
                <RestOfferV3
                    kind="ronda"
                    seconds={pendingRoundRest.seconds}
                    onRest={onStartPendingRoundRest}
                    onNext={onDismissPendingRoundRest}
                    // Con el grupo ya cerrado «Siguiente ronda» mentiría: lo que sigue es otro ejercicio.
                    nextLabel={groupComplete ? 'Siguiente ejercicio' : undefined}
                    testIdPrefix="rest-offer-round"
                />
            ) : null}

            {/* Nota: el descanso completo llega al cerrar la ronda (no entre miembros). */}
            {!pendingRoundRest && !groupComplete && groupRestSeconds > 0 && (
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
                            aria-label={promptCopy ? 'Cerrar sin guardar' : 'Cerrar edición'}
                            onClick={() => closeEditSheet('dismissed')}
                            className={cn('exec-v3-sheet-scrim', activePrompt && 'exec-v3-holdsheet-scrim')}
                            initial={reducedMotion ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={reducedMotion ? undefined : { opacity: 0 }}
                        />
                        <motion.div
                            ref={sheetRef}
                            className={cn('exec-v3-settings', activePrompt && 'exec-v3-holdsheet')}
                            role="dialog"
                            aria-modal="true"
                            // Nombre accesible PROPIO cuando es el prompt de huecos: jamás «Descanso»
                            // (el assert del E2E cuenta ese diálogo en 0).
                            aria-label={promptCopy ? `Anotar la serie ${promptCopy.setNumber}` : `Editar ${editVM.exercise.name}`}
                            data-testid={promptCopy ? 'hold-gap-sheet' : undefined}
                            initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
                            animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
                            exit={reducedMotion ? { opacity: 0 } : { y: '100%' }}
                            transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 38 }}
                        >
                            <div className="pt-1">
                                <span className="exec-v3-handle" aria-hidden />
                            </div>
                            <div className="exec-v3-settings-hd">
                                <span>
                                    {promptCopy && (
                                        <span className="exec-v3-holdsheet-k">
                                            Serie {promptCopy.setNumber}
                                            {promptHoldSec != null ? ` · guardada con ${promptHoldSec} s` : ''}
                                        </span>
                                    )}
                                    {/* Copy de SPEC §6; desde el tap en la tarjeta hecha, la cabecera de siempre. */}
                                    <span className="exec-v3-settings-t">
                                        {promptCopy
                                            ? promptCopy.focus === 'weight'
                                                ? '¿Con cuánto peso?'
                                                : '¿Cuántas reps hiciste?'
                                            : `Editar ${editVM.exercise.name}`}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => closeEditSheet('dismissed')}
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
                                            sideMode={editVM.block.side_mode}
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
                                            // Mismos ejes que en la captura (si no, al EDITAR una ronda
                                            // tipada las cajas no coincidirían con las de registro).
                                            distanceUnit={editVM.block.distance_unit ?? null}
                                            cardioModality={editVM.exercise.cardio_modality ?? null}
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
                                            // R10: sin esto, editar la serie de un miembro de FUERZA
                                            // POR TIEMPO la guardaría sin la caja de segundos y el
                                            // UPDATE escribiría `actual_hold_sec = NULL`
                                            // (`workout-log.actions.ts:168`): la sheet borraba el hold.
                                            strengthTimeMode={editIsStrengthTime}
                                            // Abre en edición la serie que el prompt vino a completar
                                            // (las demás siguen colapsadas como chip, igual que hoy).
                                            reopenNonce={
                                                activePrompt && activePrompt.setNumber === log.set_number
                                                    ? activePrompt.nonce
                                                    : undefined
                                            }
                                            v3
                                            heroV3
                                            onLogged={handleEditLogged}
                                            onResult={onResult}
                                        />
                                    ))
                                ) : (
                                    <p className="py-3 text-center text-sm text-on-dark-muted">
                                        Todavía no registras ninguna serie de este ejercicio.
                                    </p>
                                )}
                            </div>
                            {/* R7/R9: «Sin reps» cierra sin guardar — la serie ya quedó con sus segundos. */}
                            {promptCopy && (
                                <button
                                    type="button"
                                    className="exec-v3-holdmod-btn2 mt-2"
                                    onClick={() => closeEditSheet('dismissed')}
                                    aria-label={
                                        promptCopy.focus === 'weight' ? 'Dejar la serie sin peso' : 'Dejar la serie sin reps'
                                    }
                                    data-testid="hold-gap-skip"
                                >
                                    {promptCopy.focus === 'weight' ? 'Sin peso' : 'Sin reps'}
                                </button>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    )
}
