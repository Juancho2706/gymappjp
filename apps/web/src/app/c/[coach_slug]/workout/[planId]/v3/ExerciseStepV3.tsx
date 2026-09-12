'use client'

import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Keyboard, Pencil, X } from 'lucide-react'
import { usePostHog } from 'posthog-js/react'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { cn } from '@/lib/utils'
import { LogSetForm, type HoldPrefill, type SetSyncResult } from '../LogSetForm'
import {
    SIDE_LABEL,
    captureGapsFor,
    compactDuration,
    formatStrengthTimeSetLine,
    isStrengthTimeBlock,
    resolveEffectiveRest,
    sessionLogKey,
    type HoldCaptureGap,
    type OptimisticLogPayload,
    type RepeatSeedEntry,
} from '@eva/workout-engine'
import {
    decideHoldCapturePrompt,
    holdCaptureValuesFromCommit,
    type HoldCaptureFocus,
} from './hold-capture-prompt'
import type { ExerciseType as WorkoutKind } from '@/domain/workout/types'
import {
    type BlockType,
    type ExerciseType,
    type WorkoutSessionLog,
    RUT_TYPE_META,
} from '../WorkoutExecutionClient'
import { BlockActionsV3 } from './SkipBlockV3'
import { ExecMediaCard } from './ExecMediaCard'
import { HoldModuleV3 } from './HoldModuleV3'
import { RestOfferV3 } from './RestOfferV3'
import { parseRestTime, useWorkoutTimer } from '../WorkoutTimerProvider'
import { WheelHint } from './WheelHint'

/** Mejor sesión previa (para "Anterior" + autollenado). */
type PrevSet = { weight_kg: number | null; reps_done: number | null; date: string }
/** Prefill "= última vez" por bloque (mismo shape que `fillByBlock` del padre). */
type FillEntry = { weight: number | null; reps: number | null; nonce: number; setNumber: number }

/**
 * «Editar» / «Repetir» de la línea «Serie N» (specs/reps-tras-el-reloj, R7/R8) cuando el alumno la
 * toca DENTRO del interstitial de descanso: la línea la pinta `RestInterstitialV3` (que vive en el
 * contexto del orquestador, arriba del paso), así que la acción baja como señal por nonce — el mismo
 * carril que `reopenSignal` usa desde el 2026-07 para reabrir una serie desde afuera del paso. Con la
 * preferencia OFF la línea es local y no necesita esta señal.
 */
export type HoldSetActionSignal = {
    blockId: string
    setNumber: number
    action: 'edit' | 'repeat'
    nonce: number
}

interface ExerciseStepV3Props {
    block: BlockType
    exercise: ExerciseType
    /** Tipo efectivo (siempre 'strength' en este camino; se usa sólo para la etiqueta y `mode`). */
    effType: WorkoutKind
    /** Peso objetivo efectivo (sobrecarga progresiva). */
    suggestedWeightKg: number | null
    /** Chip compacto de sobrecarga (null ⇒ sin chip). */
    overloadLabel: string | null
    /** Mejor sesión previa (fila "Anterior" + `lastSet` del LogSetForm). */
    bestPrev: PrevSet | null
    /** Primera serie sin registrar (serie activa / destino del prefill). */
    firstUnlogged: number | null
    /** Series ya registradas (dots del pie). */
    doneCount: number
    /** Logs de la sesión de ESTE bloque. */
    blockLogs: WorkoutSessionLog[]
    /**
     * Semilla de "repetir el día" indexada por `(block_id, set_number)` (engine `buildRepeatSeedMap`).
     * Sólo pre-llena las filas: no marca series como registradas. Ausente ⇒ sesión normal.
     */
    seedByKey?: Map<string, RepeatSeedEntry>
    /**
     * ¿La sesión entera es un "repetir el día"? Propiedad de la SESIÓN, no de la fila: una serie que ese
     * día no se hizo no tiene semilla pero sigue siendo parte del día repetido. Endurece el umbral de PR
     * (igualar el máximo no celebra; sólo superarlo). Ausente ⇒ sesión normal.
     */
    isRepeatSession?: boolean

    /** Máximos históricos por ejercicio (umbral de PR inline). */
    exerciseMaxes: Record<string, number>
    /** Prefill "= última vez" por bloque (entrada del padre). */
    fillEntry?: FillEntry
    /** Setter del prefill "= última vez" (autollenado 1-tap de "Anterior"). */
    setFillByBlock: Dispatch<SetStateAction<Record<string, FillEntry>>>
    /** Señal de "Deshacer" (reabre la última serie logueada). */
    reopenSignal: { blockId: string; setNumber: number; nonce: number } | null
    /**
     * «Editar»/«Repetir» tocados en la línea «Serie N» del interstitial de descanso (R7/R8). Ausente
     * ⇒ nada que hacer (bloques que no son fuerza por tiempo, o pref «Pasar solo al descanso» OFF,
     * donde la línea vive acá mismo y llama a los handlers locales).
     */
    holdActionSignal?: HoldSetActionSignal | null
    /** Sustitución activa (se pasa tal cual al LogSetForm). */
    substitution?: { exerciseId: string; exerciseName: string; reason: string } | null
    /** Auto-timer del descanso. */
    autoTimerEnabled: boolean
    /** Abre el modal de técnica existente (chip "Instrucciones" y placeholder YouTube). */
    openTechnique: (exercise: ExerciseType | null) => void
    /** ¿Se puede sustituir el ejercicio (máquina ocupada)? Bloque sin series registradas aún. */
    canSubstitute?: boolean
    /** Abre el sheet "Máquina ocupada" para este bloque (mismo handler del padre; sólo si `canSubstitute`). */
    onOpenSubstitute?: () => void
    /** Abre el sheet «Omitir hoy» (mockup 3). Ausente ⇒ el bloque ya está completo: nada que omitir. */
    onSkip?: () => void
    /**
     * Log optimista + guía/scroll (handler del padre — superficie de resiliencia intocada).
     * `opts.repeat` (R8): el commit rehace una serie YA registrada, así que el orquestador tiene que
     * tratarla como serie NUEVA (celebración + avance) pese a que el bloque ya estuviera completo.
     */
    handleLogged: (payload: OptimisticLogPayload, opts?: { repeat?: boolean }) => void
    /** Reconciliación del optimismo (resultado REAL del server). */
    handleResult: (blockId: string, setNumber: number, result: SetSyncResult) => void
    /**
     * Avisa al orquestador si el par «Descansar N s» / «Siguiente serie» está en pantalla (reporte del
     * alumno 2026-09-11). Sin esto el auto-avance desmonta el CTA antes de que el alumno lo toque.
     */
    onRestOfferChange?: (open: boolean) => void
}

/**
 * Ejecutor V3 (E2.4) — presentación del paso STRENGTH en el stepper (modo V3). Traducción del mockup
 * `concepto-a-v3-core` (pantalla Fuerza): nombre + chip, MEDIA siempre visible con chips glass
 * "Instrucciones" / "Nota del coach" que entran extendidos y colapsan a solo-icono (~1,2 s vía CSS;
 * reduced-motion los deja extendidos), prescripción compacta + chip sobrecarga, fila "Anterior"
 * tappable de 1-tap (reusa el autollenado `fillByBlock` del padre) y el `LogSetForm` REUSADO tal cual
 * como superficie de captura/resiliencia (inputs/keypad/RPE-RIR/recap sin bifurcar).
 *
 * Sólo re-estiliza contenedores vía clases scoped `[data-exec-v3]`; NO toca la lógica de guardado /
 * draft / cola. El chip "Instrucciones" y el placeholder de YouTube abren el modal de técnica del
 * padre; "Nota del coach" abre un sheet local con `block.notes`.
 */
export function ExerciseStepV3({
    block,
    exercise,
    effType,
    suggestedWeightKg,
    bestPrev,
    firstUnlogged,
    doneCount,
    blockLogs,
    seedByKey,
    isRepeatSession,
    exerciseMaxes,
    fillEntry,
    setFillByBlock,
    reopenSignal,
    holdActionSignal,
    substitution,
    autoTimerEnabled,
    openTechnique,
    canSubstitute,
    onOpenSubstitute,
    onSkip,
    handleLogged,
    handleResult,
    onRestOfferChange,
}: ExerciseStepV3Props) {
    // Pie: el lápiz revela las series anteriores (chips) para corregirlas; el teclado enfoca el valor activo.
    const [showPrev, setShowPrev] = useState(false)
    // Panel de esfuerzo (QA2 hallazgo 3): colapsado por default; el estado vive AQUÍ (por-ejercicio) para
    // persistir entre series del mismo ejercicio. Este componente se remonta por `key={block.id}` desde el
    // padre → al cambiar de ejercicio el estado vuelve a colapsado, como pide el contrato.
    const [effortExpanded, setEffortExpanded] = useState(false)
    const heroWrapRef = useRef<HTMLDivElement>(null)
    const note = block.notes?.trim() || null

    // ── Fuerza POR TIEMPO (specs/cuenta-atras-en-pantalla, D3 / W4.14) ────────────────────────────
    // Predicado único del motor (R29). Con él: anillo de 130 px en color de marca bajo la media, tile
    // SEG en la fila (`strengthTimeMode`), prescripción «N × 30s» y guardado solo a 0 con el KG del tile
    // por `holdPrefill.submit`. Descansar o seguir lo toca el alumno (R24) salvo preferencia encendida.
    const strengthTime = isStrengthTimeBlock(block, exercise)
    const holdSeconds = strengthTime ? (block.duration_sec ?? 0) : 0
    const { startRest, cancelRest } = useWorkoutTimer()
    const ph = usePostHog()
    const reducedMotion = useReducedMotion()
    const [holdPrefill, setHoldPrefill] = useState<HoldPrefill | null>(null)
    const [restOffer, setRestOffer] = useState<{ setNumber: number; seconds: number; warmup: boolean } | null>(null)
    /**
     * «Repetir» (R8) — override LOCAL de la serie activa. `firstUnlogged` lo calcula el orquestador
     * (`WorkoutExecutionClient`) sobre los logs y ahí no se toca: rehacer una serie ya registrada es
     * una decisión de ESTE paso y muere con él. Mientras vive, la serie N vuelve a ser la protagonista
     * (hero, módulo de reloj, prefill) aunque el bloque ya esté completo.
     */
    const [repeat, setRepeat] = useState<{ setNumber: number; nonce: number } | null>(null)
    const activeSetNumber = repeat?.setNumber ?? firstUnlogged
    /**
     * Sheet de huecos (R10): la serie se guardó sola y falta anotar reps (o el peso). `trigger`
     * distingue el origen para la analítica (R12/riesgo 9): `'timer'` la abre el reloj, `'manual'` el
     * botón «Editar» de la línea «Serie N».
     */
    const [sheet, setSheet] = useState<{
        setNumber: number
        focus: HoldCaptureFocus
        missing: HoldCaptureGap[]
        trigger: 'timer' | 'manual'
        nonce: number
    } | null>(null)
    const sheetRef = useRef<HTMLDivElement>(null)
    /**
     * R3 se ARMA en `onMeasured` (único punto que conoce `submit` y `expiredWhileAway`) y se RESUELVE
     * en `onLogged`, con los valores que de verdad se guardaron. Un ref y no state: entre las dos
     * llamadas no hay ningún render de por medio (el auto-envío es síncrono).
     */
    const promptArmRef = useRef<{ setNumber: number | null; expiredWhileAway: boolean } | null>(null)
    /** Peso al abrir la sheet — alimenta `weight_changed` de `hold_capture_resolved` (SPEC §7). */
    const sheetOpenWeightRef = useRef<number | null>(null)
    /**
     * Nonce monótono de apertura de sheet y de repetición. No es `Date.now()` a propósito: es impuro
     * y estas funciones se arman en el cuerpo del componente. Sólo importa que no se repita.
     */
    const stepNonceRef = useRef(0)
    useEffect(() => {
        setHoldPrefill(null)
    }, [activeSetNumber])
    /**
     * El paso se desmonta al avanzar (o al volver atrás) con su `restOffer` adentro: el orquestador
     * tiene que enterarse o su avance diferido se quedaría esperando un CTA que ya no existe.
     */
    useEffect(() => () => onRestOfferChange?.(false), [onRestOfferChange])

    /** Abre la sheet de huecos y emite `hold_capture_prompted` (R12) — un evento por apertura. */
    const openCaptureSheet = (
        setNumber: number,
        focus: HoldCaptureFocus,
        missing: HoldCaptureGap[],
        trigger: 'timer' | 'manual',
        weightAtOpen: number | null,
    ) => {
        sheetOpenWeightRef.current = weightAtOpen
        setSheet({ setNumber, focus, missing, trigger, nonce: ++stepNonceRef.current })
        ph?.capture('hold_capture_prompted', {
            block_id: block.id,
            exercise_type: 'strength',
            context: 'solo',
            missing,
            trigger,
            platform: 'web',
        })
    }
    /** Cierra la sheet por cualquiera de las dos vías y emite `hold_capture_resolved` (R12). */
    const closeCaptureSheet = (outcome: 'saved' | 'dismissed', payload?: OptimisticLogPayload) => {
        if (!sheet) return
        ph?.capture('hold_capture_resolved', {
            block_id: block.id,
            context: 'solo',
            outcome,
            reps_filled: (payload?.repsDone ?? 0) > 0,
            weight_changed: outcome === 'saved' && (payload?.weightKg ?? null) !== sheetOpenWeightRef.current,
        })
        setSheet(null)
    }
    /**
     * Guardado DESDE la sheet: no vuelve a ofrecer descanso (esa serie ya tuvo el suyo cuando se
     * cerró), así que va al handler CRUDO del orquestador y no al `onLogged` del paso — el mismo
     * criterio que la sheet de edición de la superserie, que usa el `onLogged` plano.
     */
    const onSheetLogged = (payload: OptimisticLogPayload) => {
        closeCaptureSheet('saved', payload)
        handleLogged(payload)
    }
    const onLogged = (payload: OptimisticLogPayload) => {
        // R8: el re-commit de una serie repetida viaja marcado para que el orquestador lo trate como
        // serie nueva (celebración + avance) pese a que el bloque ya estaba completo.
        const isRepeatCommit = repeat != null && repeat.setNumber === payload.setNumber
        if (isRepeatCommit) setRepeat(null)
        handleLogged(payload, isRepeatCommit ? { repeat: true } : undefined)
        if (!autoTimerEnabled) {
            // Reporte del alumno 2026-09-11: los segundos del CTA salían de `parseRestTime(rest_time)`
            // crudo ⇒ un bloque sin descanso configurado pintaba «Descansar 0 s» (o directamente sólo
            // «Siguiente serie») y la serie quedaba sin descanso. Se resuelven POR SERIE con la misma
            // regla que el camino automático de `LogSetForm`: aproximación → bloque → fallback 60 s.
            const { seconds, warmup } = resolveEffectiveRest({
                restSec: parseRestTime(block.rest_time),
                warmupRestSec: parseRestTime(block.warmup_rest_time),
                useWarmup: payload.setNumber === 1 && block.sets >= 3,
            })
            setRestOffer({ setNumber: payload.setNumber, seconds, warmup })
            onRestOfferChange?.(true)
        }
        // R10: la sheet se abre DESPUÉS del optimismo del padre y del CTA de descanso — así el
        // `blockLogs` del próximo render ya trae la serie recién cerrada y la sheet la encuentra.
        const armed = promptArmRef.current
        promptArmRef.current = null
        if (!armed || armed.setNumber !== payload.setNumber) return
        const decision = decideHoldCapturePrompt({
            submit: true,
            // El módulo de hold de ESTE paso es siempre de fuerza por tiempo (el predicado R29 de
            // movilidad monta `MobilityStepV3`, que es otra pantalla).
            kind: 'strength_time',
            expiredWhileAway: armed.expiredWhileAway,
            values: holdCaptureValuesFromCommit(payload),
        })
        if (!decision.open) return
        openCaptureSheet(payload.setNumber, decision.focus, decision.missing, 'timer', payload.weightKg ?? null)
    }
    /** «Siguiente serie»: se salta el descanso y destraba el avance diferido del orquestador. */
    const closeRestOffer = () => {
        setRestOffer(null)
        onRestOfferChange?.(false)
    }
    const startOfferedRest = () => {
        if (!restOffer) return
        startRest(`${restOffer.seconds}s`, { label: exercise.name, warmup: restOffer.warmup })
        closeRestOffer()
    }

    // ── Línea «Serie N · 60 kg × 8 · 30 s» y sus dos acciones (R7/R8) ─────────────────────────────
    /** Huecos de una serie YA guardada — sólo para la analítica del camino «Editar» (trigger manual). */
    const gapsOfLoggedSet = (setNumber: number): HoldCaptureGap[] => {
        const log = blockLogs.find((l) => l.set_number === setNumber)
        return captureGapsFor(
            holdCaptureValuesFromCommit({ weightKg: log?.weight_kg ?? null, repsDone: log?.reps_done ?? null }),
            'strength_time',
        )
    }
    /** «Editar» — R7: reabre la serie con foco en REPS y SIN el copy de huecos (no es un prompt). */
    const editHoldSet = (setNumber: number) => {
        const log = blockLogs.find((l) => l.set_number === setNumber)
        openCaptureSheet(setNumber, 'reps', gapsOfLoggedSet(setNumber), 'manual', log?.weight_kg ?? null)
    }
    /**
     * «Repetir» — R8: corta el descanso que esté corriendo (el alumno vuelve al reloj, no descansa),
     * retira el CTA de descanso y devuelve la serie N a activa con el módulo en `idle`. El nonce entra
     * al `resetKey` del módulo: sin él la clave se repetiría y el reloj no volvería a armarse.
     */
    const repeatHoldSet = (setNumber: number) => {
        cancelRest()
        closeRestOffer()
        setRepeat({ setNumber, nonce: ++stepNonceRef.current })
        ph?.capture('hold_set_repeated', { block_id: block.id, set_number: setNumber })
    }

    // La línea del interstitial la pinta el orquestador; sus botones bajan por esta señal (R7).
    const holdActionNonce = holdActionSignal?.blockId === block.id ? holdActionSignal.nonce : undefined
    useEffect(() => {
        if (holdActionNonce == null || !holdActionSignal) return
        if (holdActionSignal.action === 'repeat') repeatHoldSet(holdActionSignal.setNumber)
        else editHoldSet(holdActionSignal.setNumber)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [holdActionNonce])

    /**
     * Foco programático en la caja que falta (R10). Riesgo 6: `formIdentityKey` re-monta el `<form>`
     * cuando la reconciliación del optimismo cambia la identidad de la serie, y el foco se perdería en
     * silencio ⇒ se reintenta una vez, y sólo si el foco NO quedó ya dentro de la sheet (para no
     * robárselo al alumno si él mismo tocó otra caja).
     */
    const sheetNonce = sheet?.nonce
    const sheetFocus = sheet?.focus
    useEffect(() => {
        if (sheetNonce == null) return
        const selector = sheetFocus === 'weight' ? 'input[name="weight_kg"]' : 'input[name="reps_done"]'
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
    }, [sheetNonce, sheetFocus])

    // Deshacer (reopenSignal): la serie a corregir vive tras el lápiz — al reabrirla, mostramos el panel.
    useEffect(() => {
        if (reopenSignal?.blockId === block.id) setShowPrev(true)
    }, [reopenSignal, block.id])

    // Teclado del pie: enfoca el valor de peso de la serie activa (el foco abre el keypad tras el fix 14).
    const focusActiveValue = () => {
        const input = heroWrapRef.current?.querySelector<HTMLInputElement>(
            '.exec-v3-slot.is-active input[name="weight_kg"]',
        )
        input?.focus()
    }

    // R8: apunta a la serie ACTIVA de este paso (la repetida cuando la hay), no a `firstUnlogged`
    // crudo — si no, «Anterior» autollenaría una fila que no está en pantalla y no pasaría nada.
    const autofillActive = () => {
        if (activeSetNumber == null || !bestPrev) return
        setFillByBlock((prev) => ({
            ...prev,
            [block.id]: {
                weight: bestPrev.weight_kg,
                reps: bestPrev.reps_done,
                nonce: Date.now(),
                setNumber: activeSetNumber,
            },
        }))
    }

    // ── Datos de la línea «Serie N» con la preferencia OFF (R7) ──────────────────────────────────
    // Con la pref ON la línea vive dentro del interstitial (la arma el orquestador); acá sólo se pinta
    // el caso OFF, encima del par «Descansar N s» / «Siguiente serie». El texto sale del motor
    // (`formatStrengthTimeSetLine`), sin guion inventado (decisión W0.4 · 2).
    const offerLog = restOffer ? blockLogs.find((l) => l.set_number === restOffer.setNumber) : undefined
    const offerLine =
        strengthTime && offerLog
            ? formatStrengthTimeSetLine({
                  weight_kg: offerLog.weight_kg,
                  reps_done: offerLog.reps_done,
                  actual_hold_sec: offerLog.actual_hold_sec ?? null,
                  metadata: offerLog.metadata,
              })
            : null

    // ── Sheet de huecos (R10) ────────────────────────────────────────────────────────────────────
    const sheetLog = sheet ? blockLogs.find((l) => l.set_number === sheet.setNumber) : undefined
    const sheetPrompt = sheet?.trigger === 'timer'
    const sheetFaltaPeso = sheet?.focus === 'weight'
    // Copy de SPEC §6, palabra por palabra. Desde «Editar» la sheet conserva su cabecera de siempre.
    const sheetTitle = !sheetPrompt
        ? `Editar serie ${sheet?.setNumber ?? ''}`
        : sheetFaltaPeso
          ? '¿Con cuánto peso?'
          : '¿Cuántas reps hiciste?'
    // Nombre accesible PROPIO: jamás «Descanso» (el assert del E2E cuenta ese diálogo en 0).
    const sheetDialogLabel = sheetPrompt ? `Anotar la serie ${sheet?.setNumber}` : `Editar la serie ${sheet?.setNumber}`
    const sheetSkipLabel = sheetFaltaPeso ? 'Sin peso' : 'Sin reps'
    const sheetSkipA11y = sheetFaltaPeso ? 'Dejar la serie sin peso' : 'Dejar la serie sin reps'

    return (
        <div className="exec-v3-step space-y-3">
            {/* Nombre + chip tipo · músculo */}
            <div>
                <h2 className="exec-v3-exname">{exercise.name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="exec-v3-chip">
                        {RUT_TYPE_META[effType].label} · {exercise.muscle_group}
                    </span>
                    {/* Chip «Por lado»/«Alternado» en la fila de objetivo (R39): la fuerza nunca entra
                        a `TypedTargetGrid`; el rótulo sale del motor (`SIDE_LABEL`), no de una copia. */}
                    {block.side_mode && SIDE_LABEL[block.side_mode] ? (
                        <span className="exec-v3-chip">{SIDE_LABEL[block.side_mode]}</span>
                    ) : null}
                    {/* Salida digna del paso activo (mockup 3): «Cambiar» + «Omitir hoy». */}
                    <BlockActionsV3
                        onOpenSubstitute={canSubstitute ? onOpenSubstitute : undefined}
                        onSkip={onSkip}
                    />
                </div>
            </div>

            {/* Media SIEMPRE visible + chips glass colapsables (componente compartido con la superserie) */}
            <ExecMediaCard exercise={exercise} note={note} openTechnique={openTechnique} />

            {/* Fuerza POR TIEMPO: anillo 130 px DEBAJO de la media (V1), en color de marca. */}
            {strengthTime && holdSeconds > 0 && activeSetNumber != null && (
                <HoldModuleV3
                    kind="strength_time"
                    size="solo130"
                    blockId={block.id}
                    prescribedSec={holdSeconds}
                    sideMode={block.side_mode}
                    context="solo"
                    closesRound={false}
                    // R8: el nonce de «Repetir» entra a la clave — sin él, repetir la serie N reusaría
                    // la clave anterior y el módulo (y su candado de envío único) no volverían a armarse.
                    resetKey={`${block.id}:${activeSetNumber}:${repeat?.nonce ?? 1}`}
                    onMeasured={(m) => {
                        // R3 armado: sólo un envío real (lado `single` o `right`) puede abrir la sheet.
                        promptArmRef.current = m.submit
                            ? { setNumber: activeSetNumber, expiredWhileAway: m.expiredWhileAway }
                            : null
                        setHoldPrefill({
                            holdSec: m.holdSec,
                            leftSec: m.leftSec,
                            rightSec: m.rightSec,
                            submit: m.submit,
                            source: m.source,
                            nonce: m.nonce,
                            // R8: permiso EXPLÍCITO para que el auto-envío atraviese el gate `isLogged`.
                            repeat: repeat != null,
                        })
                    }}
                    testIdPrefix="hold-strength"
                />
            )}

            {/* Prescripción compacta (mockup a3a-rx: "4 × 8 · 60 kg · RIR 2 · desc 90s", sin extras) */}
            <div className="exec-v3-rx tabular-nums">
                {block.sets} × {strengthTime ? compactDuration(holdSeconds) : block.reps}
                {block.target_weight_kg != null && (
                    <>
                        {' · '}
                        <b>{suggestedWeightKg ?? block.target_weight_kg} kg</b>
                    </>
                )}
                {block.rir && <> · RIR {block.rir}</>}
                {block.rest_time && <> · desc {block.rest_time}</>}
            </div>

            {/* "Anterior" 1-tap → autollena la serie activa (mecanismo existente del padre). QA5 h4: sólo
                si la sesión previa registró AL MENOS un dato real (peso o reps); si no, no hay fila fantasma
                de puros guiones. */}
            {bestPrev && (bestPrev.weight_kg != null || bestPrev.reps_done != null) && (
                <button
                    type="button"
                    onClick={autofillActive}
                    disabled={activeSetNumber == null}
                    className="exec-v3-prev"
                    aria-label={
                        activeSetNumber != null && bestPrev.weight_kg
                            ? `Autollenar la serie activa con ${bestPrev.weight_kg} kg por ${bestPrev.reps_done ?? '-'} reps`
                            : undefined
                    }
                >
                    <span className="exec-v3-prev-l">Anterior</span>
                    <span className="exec-v3-prev-r tabular-nums">
                        {bestPrev.weight_kg ? `${bestPrev.weight_kg} kg` : '-'} × {bestPrev.reps_done || '-'}
                    </span>
                    {activeSetNumber != null && <span className="exec-v3-prev-tap">1 tap ↻</span>}
                </button>
            )}

            {/* Pista de la captura dual (E2.5): "Tap = teclado · Mantén presionado = rueda" — 1 sola vez. */}
            <WheelHint />

            {/* Captura HERO (informe 03): sólo la serie ACTIVA se ve como el mockup (tiles + esfuerzo + CTA).
                Las anteriores (chips) sólo con el lápiz (data-showprev); las futuras quedan ocultas. TODOS
                los LogSetForm siguen montados y estables (reconciliación de cola/optimismo intacta) — sólo
                cambia su visibilidad por CSS. */}
            <div
                ref={heroWrapRef}
                className="exec-v3-herowrap exec-v3-setlist space-y-1.5"
                data-showprev={showPrev ? '' : undefined}
            >
                {Array.from({ length: block.sets }).map((_, i) => {
                    const setNumber = i + 1
                    const log = blockLogs.find((entry) => entry.set_number === setNumber)
                    const slot =
                        setNumber === activeSetNumber ? 'is-active' : log ? 'is-prev' : 'is-future'
                    return (
                        // `data-testid` sólo en la ACTIVA (W6.10): el spec de Playwright apuntaba por
                        // clase (`.exec-v3-slot.is-active`) y un re-skin del CSS lo dejaba ciego.
                        <div
                            key={`${block.id}-${setNumber}`}
                            className={cn('exec-v3-slot', slot)}
                            data-testid={slot === 'is-active' ? 'set-slot-active' : undefined}
                        >
                            <LogSetForm
                                blockId={block.id}
                                sideMode={block.side_mode}
                                strengthTimeMode={strengthTime}
                                holdPrefill={strengthTime && setNumber === activeSetNumber && holdPrefill ? holdPrefill : undefined}
                                setNumber={setNumber}
                                restTimeStr={block.rest_time}
                                warmupRestTimeStr={block.warmup_rest_time}
                                totalSets={block.sets}
                                nextUpLabel={exercise.name}
                                existingLog={log}
                                seed={seedByKey?.get(sessionLogKey(block.id, setNumber))}
                                isRepeatSession={isRepeatSession}
                                suggestedWeightKg={suggestedWeightKg}
                                prThresholdKg={exerciseMaxes[exercise.id] ?? null}
                                targetReps={block.reps}
                                lastSet={bestPrev ? { weightKg: bestPrev.weight_kg, reps: bestPrev.reps_done } : null}
                                autoTimerEnabled={autoTimerEnabled}
                                mode={effType}
                                isActive={setNumber === activeSetNumber}
                                prefill={fillEntry?.setNumber === setNumber ? fillEntry : undefined}
                                // R8: al repetir, la fila de la serie N ya está logueada ⇒ sin reabrirla
                                // el hero no se pinta (sería el chip colapsado) y, peor, el `<form>`
                                // destino del auto-envío no existiría. `reopenNonce` es el carril que
                                // ya usa «Deshacer» para exactamente eso.
                                reopenNonce={
                                    repeat?.setNumber === setNumber
                                        ? repeat.nonce
                                        : reopenSignal?.blockId === block.id && reopenSignal?.setNumber === setNumber
                                          ? reopenSignal.nonce
                                          : undefined
                                }
                                substitution={substitution ?? null}
                                v3
                                heroV3
                                effortExpanded={effortExpanded}
                                onEffortExpandedChange={setEffortExpanded}
                                onLogged={onLogged}
                                onResult={handleResult}
                            />
                        </div>
                    )
                })}
            </div>

            {/* R24: con la preferencia «Pasar solo al descanso» APAGADA, tras cerrar cualquier serie (tocada
                o por reloj) el alumno elige «Descansar N s» o «Siguiente serie». Con la preferencia ON el
                `LogSetForm` ya arrancó el descanso y este par no se pinta. */}
            {/* R7 · pref OFF: la línea «Serie N · 60 kg × 8 · 30 s» con «Editar» y «Repetir», encima del
                par de CTAs. Con la pref ON esta misma línea vive dentro del interstitial de descanso
                (la arma el orquestador) y acá no se pinta porque no hay `restOffer`. */}
            {restOffer && !autoTimerEnabled && offerLine && (
                <div className="exec-v3-lastset" data-testid="hold-lastset">
                    <span className="exec-v3-lastset-k">Serie {restOffer.setNumber}</span>
                    <span className="exec-v3-lastset-v tabular-nums">{offerLine}</span>
                    <span className="exec-v3-lastset-acts">
                        <button
                            type="button"
                            className="exec-v3-lastset-a"
                            onClick={() => editHoldSet(restOffer.setNumber)}
                            aria-label={`Editar la serie ${restOffer.setNumber}`}
                        >
                            Editar
                        </button>
                        <button
                            type="button"
                            className="exec-v3-lastset-a"
                            onClick={() => repeatHoldSet(restOffer.setNumber)}
                            aria-label={`Repetir la serie ${restOffer.setNumber} desde el reloj`}
                        >
                            Repetir
                        </button>
                    </span>
                </div>
            )}

            {restOffer && !autoTimerEnabled && (
                <RestOfferV3 seconds={restOffer.seconds} onRest={startOfferedRest} onNext={closeRestOffer} testIdPrefix="rest-offer-strength" />
            )}

            {/* Pie: cuadraditos de serie (izq) + herramientas teclado/lápiz (der) — mockup a3a-foot */}
            <div className="exec-v3-foot">
                <div className="exec-v3-sets">
                    {Array.from({ length: block.sets }).map((_, i) => (
                        <span key={i} className={cn('exec-v3-sq', i < doneCount && 'is-on')} />
                    ))}
                    <span className="exec-v3-setlbl tabular-nums">
                        {doneCount}/{block.sets}
                    </span>
                </div>
                <div className="exec-v3-tools">
                    {/* «Cambiar» dejó de vivir acá (mockup 3): ahora es un chip de la cabecera junto a
                        «Omitir hoy», visible en TODOS los tipos de bloque. Duplicarlo sería ruido. */}
                    <button
                        type="button"
                        className="exec-v3-tool"
                        onClick={focusActiveValue}
                        aria-label="Abrir teclado para la serie activa"
                    >
                        <Keyboard className="h-[18px] w-[18px]" aria-hidden />
                    </button>
                    <button
                        type="button"
                        className="exec-v3-tool"
                        data-on={showPrev ? '' : undefined}
                        onClick={() => setShowPrev((v) => !v)}
                        aria-pressed={showPrev}
                        aria-label="Editar series anteriores"
                    >
                        <Pencil className="h-[15px] w-[15px]" aria-hidden />
                    </button>
                </div>
            </div>

            {/* Sheet de HUECOS (R10) — gemela de la de edición de `SupersetStepV3`: misma superficie
                `.exec-v3-settings`, mismo `role="dialog"`, misma animación. Lo único propio es el
                layering (`exec-v3-holdsheet*`, z 62/61 sobre el interstitial z 60: con la preferencia
                ON el descanso ya está en pantalla y la sheet tiene que quedar ENCIMA, y su scrim
                también, o tocar afuera no cerraría nada) y el copy de SPEC §6.

                Adentro va la MISMA `LogSetForm` de siempre —modo tiempo, con `existingLog` y abierta en
                edición por `reopenNonce`—, así el guardado, la cola offline y la marca `hold_source`
                recorren el camino único; cerrar sin guardar no toca nada porque la serie YA está. */}
            <AnimatePresence>
                {sheet && sheetLog && (
                    <>
                        <motion.button
                            type="button"
                            aria-label="Cerrar sin guardar"
                            onClick={() => closeCaptureSheet('dismissed')}
                            className="exec-v3-sheet-scrim exec-v3-holdsheet-scrim"
                            initial={reducedMotion ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={reducedMotion ? undefined : { opacity: 0 }}
                        />
                        <motion.div
                            ref={sheetRef}
                            className="exec-v3-settings exec-v3-holdsheet"
                            role="dialog"
                            aria-modal="true"
                            aria-label={sheetDialogLabel}
                            data-testid="hold-gap-sheet"
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
                                    {sheetPrompt && (
                                        <span className="exec-v3-holdsheet-k">
                                            Serie {sheet.setNumber}
                                            {sheetLog.actual_hold_sec != null ? ` · guardada con ${sheetLog.actual_hold_sec} s` : ''}
                                        </span>
                                    )}
                                    <span className="exec-v3-settings-t">{sheetTitle}</span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => closeCaptureSheet('dismissed')}
                                    aria-label="Cerrar"
                                    className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-dark-muted transition-colors hover:bg-white/[0.06] hover:text-on-dark"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="exec-v3-setlist space-y-1.5 overflow-y-auto pb-1">
                                <LogSetForm
                                    key={`${block.id}-holdgap-${sheet.setNumber}-${sheet.nonce}`}
                                    blockId={block.id}
                                    sideMode={block.side_mode}
                                    strengthTimeMode={strengthTime}
                                    setNumber={sheet.setNumber}
                                    restTimeStr={block.rest_time}
                                    warmupRestTimeStr={block.warmup_rest_time}
                                    totalSets={block.sets}
                                    nextUpLabel={exercise.name}
                                    existingLog={sheetLog}
                                    suggestedWeightKg={suggestedWeightKg}
                                    prThresholdKg={exerciseMaxes[exercise.id] ?? null}
                                    targetReps={block.reps}
                                    lastSet={bestPrev ? { weightKg: bestPrev.weight_kg, reps: bestPrev.reps_done } : null}
                                    autoTimerEnabled={autoTimerEnabled}
                                    mode={effType}
                                    // Abre en edición (si no, la fila logueada sería el chip colapsado).
                                    reopenNonce={sheet.nonce}
                                    substitution={substitution ?? null}
                                    v3
                                    heroV3
                                    onLogged={onSheetLogged}
                                    onResult={handleResult}
                                />
                            </div>
                            {sheetPrompt && (
                                <button
                                    type="button"
                                    className="exec-v3-holdmod-btn2 mt-2"
                                    onClick={() => closeCaptureSheet('dismissed')}
                                    aria-label={sheetSkipA11y}
                                    data-testid="hold-gap-skip"
                                >
                                    {sheetSkipLabel}
                                </button>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    )
}
