'use client'

import { useState } from 'react'
import { Bluetooth, HeartPulse, Pause, Play, Repeat, RotateCcw, Ruler, SkipForward, Timer, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    buildIntervalSequence,
    intervalTimerKind,
    intervalPhaseTargetLabel,
    isManualPhase,
    computeCardioProgress,
    formatTypedObjective,
    INTERVAL_PHASE_LABEL,
    compactDistance,
    sessionLogKey,
    type IntervalPhase,
} from '@eva/workout-engine'
import { LogSetForm, type SetSyncResult } from '../LogSetForm'
import { useWorkoutTimer } from '../WorkoutTimerProvider'
import type { OptimisticLogPayload, RepeatSeedEntry } from '@eva/workout-engine'
import type { BlockType, ExerciseType, WorkoutSessionLog } from '../WorkoutExecutionClient'
import type { ClientCardioView } from '../_data/workout-execution.queries'
import { BlockActionsV3 } from './SkipBlockV3'
import { ExecTypedMedia } from './ExecTypedMedia'
import { useExecCountdown, formatCountdown } from './useExecCountdown'
import { useIntervalRunner } from './useIntervalRunner'
import { useWebBleHr } from './use-web-ble-hr'
import { SensorSheetV3 } from './SensorSheetV3'
import { zoneFromRanges } from './web-ble-hr'

interface CardioStepV3Props {
    block: BlockType
    exercise: ExerciseType
    firstUnlogged: number | null
    doneCount: number
    blockLogs: WorkoutSessionLog[]
    /**
     * Semilla de "repetir el día" indexada por `(block_id, set_number)` (engine `buildRepeatSeedMap`):
     * pre-llena min/metros/FC de esa fecha. No marca nada como registrado. Ausente ⇒ sesión normal.
     */
    seedByKey?: Map<string, RepeatSeedEntry>
    cardio?: ClientCardioView
    autoTimerEnabled: boolean
    reopenSignal: { blockId: string; setNumber: number; nonce: number } | null
    substitution?: { exerciseId: string; exerciseName: string; reason: string } | null
    openTechnique: (exercise: ExerciseType | null) => void
    /** ¿Se puede sustituir el ejercicio? (mockup 3: «Cambiar» ya no es exclusivo de fuerza). */
    canSubstitute?: boolean
    /** Abre el sheet "Máquina ocupada" para este bloque (sólo si `canSubstitute`). */
    onOpenSubstitute?: () => void
    /** Abre el sheet «Omitir hoy» (mockup 3). Ausente ⇒ el bloque ya está completo. */
    onSkip?: () => void
    handleLogged: (payload: OptimisticLogPayload) => void
    handleResult: (blockId: string, setNumber: number, result: SetSyncResult) => void
}

/** Cue corto por zona (es-neutro) — refuerza el objetivo sin depender de leer el número. */
const ZONE_CUE: Record<number, string> = {
    1: 'Suave',
    2: 'Mantén el ritmo',
    3: 'Cómodo-duro',
    4: 'Fuerte',
    5: 'Máximo',
}

/** Color FIJO por fase de intervalo (esfuerzo ámbar / recuperación verde); warmup/cooldown = marca. */
function phaseColor(kind: IntervalPhase['kind']): string {
    if (kind === 'work') return 'var(--zone-z4)'
    if (kind === 'recovery') return 'var(--zone-z2)'
    return 'var(--exec-brand)'
}

const DASH = 2 * Math.PI * 92

/**
 * Ejecutor V3 (E3.4) — pantalla de CARDIO con IDENTIDAD. Traducción de los mockups
 * `concepto-a-v31-cardio-wheel` (cardio continuo) y `concepto-a-v32-momentos` (intervalo en fase):
 * nombre + media del catálogo (la escaladora no es correr), countdown en el color de la ZONA objetivo
 * (`computeCardioProgress`), y — en intervalos — anillo POR FASE con colores fijos (Trabajo ámbar /
 * Recupera verde), barra de fases segmentada y "intervalo N de M". La zona objetivo se muestra SIEMPRE
 * con su rango bpm concreto cuando el perfil FC del alumno viaja al ejecutor (chip "Z2 · 128-142 bpm");
 * si el módulo cardio está OFF o el perfil no permite derivar bpm, cae a "Z2" (el BPM en vivo por BLE es
 * una capa opcional de Ola 6, jamás requisito). La FC se captura MANUAL en las filas tipadas reusadas.
 */
export function CardioStepV3(props: CardioStepV3Props) {
    const { block, exercise, cardio, openTechnique, canSubstitute, onOpenSubstitute, onSkip } = props
    const coachNote = block.notes?.trim() || null
    const intervalConfig = block.interval_config ?? null
    // Fase D (G2): los intervalos por DISTANCIA (8×400m, HYROX) también montan la cara de intervalos —
    // sus fases de trabajo esperan avance MANUAL y las de tiempo (warmup/recuperación/cooldown) se
    // cronometran igual que siempre. `none` ⇒ sin intervalos usables ⇒ cara continua de siempre.
    const isInterval = intervalTimerKind(intervalConfig) !== 'none'

    const zone = block.hr_zone ?? null
    const zoneRange =
        zone != null && cardio?.enabled ? cardio.zones?.find((z) => z.zone === zone) ?? null : null

    // BPM en vivo por Web Bluetooth (Ola 6, capa opcional): SOLO en Chrome/Edge Android (feature-detect
    // estricto en el hook). Si el navegador no lo soporta, `hr.supported` es false y NO se muestra NADA de
    // sensor — la FC sigue siendo manual (fallback de siempre). El BPM vivo solo ALIMENTA la UI: el chip de
    // zona y el auto-prellenado de `actual_avg_hr` (editable) por el flujo tipado existente.
    const hr = useWebBleHr()
    const [sensorOpen, setSensorOpen] = useState(false)
    const liveZones = cardio?.enabled ? cardio.zones : null
    const liveBpm = hr.status === 'connected' ? hr.bpm : null
    const liveZone = liveBpm != null ? zoneFromRanges(liveBpm, liveZones) : null

    return (
        <div className="exec-v3-step space-y-3">
            {/* Identidad: nombre + chip */}
            <div className="exec-v3-cardio-id">
                <div className="min-w-0">
                    <h2 className="exec-v3-exname">{exercise.name}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={cn('exec-v3-chip', isInterval && 'is-amber')}>
                            Cardio{isInterval ? ' · Intervalos' : exercise.muscle_group ? ` · ${exercise.muscle_group}` : ''}
                        </span>
                        {/* Salida digna del paso activo (mockup 3): «Cambiar» + «Omitir hoy». */}
                        <BlockActionsV3
                            onOpenSubstitute={canSubstitute ? onOpenSubstitute : undefined}
                            onSkip={onSkip}
                        />
                    </div>
                </div>
            </div>

            {/* Media del catálogo — mismo tratamiento que fuerza: chips "Instrucciones" + "Nota del coach"
                DENTRO de la media (overlay superior-izquierdo), precedencia + audio en video (QA4). */}
            <ExecTypedMedia
                exercise={exercise}
                note={coachNote}
                openTechnique={openTechnique}
                fallbackIcon={<HeartPulse className="h-9 w-9" />}
            />

            {isInterval && intervalConfig ? (
                <IntervalFace phases={buildIntervalSequence(intervalConfig, block.sets)} zone={zone} zoneRange={zoneRange} />
            ) : (
                <ContinuousFace block={block} zone={zone} zoneRange={zoneRange} />
            )}

            {/* Fuente FC honesta. Con sensor BLE conectado la FC llega EN VIVO y auto-rellena la fila
                (editable); sin soporte o sin conexión, sigue siendo MANUAL (fallback de siempre). El
                bloque de sensor solo aparece si el navegador soporta Web Bluetooth (Chrome/Edge Android). */}
            {liveBpm != null ? (
                <button
                    type="button"
                    onClick={() => setSensorOpen(true)}
                    className="exec-v3-hrlive"
                    style={liveZone ? ({ '--zc': `var(--zone-z${liveZone.zone})` } as React.CSSProperties) : undefined}
                    aria-label="Sensor de pulso conectado — ver detalle"
                >
                    <span className="exec-v3-hrlive-pulse" aria-hidden>
                        <HeartPulse className="h-4 w-4" />
                    </span>
                    <span className="exec-v3-hrlive-num tabular-nums">{liveBpm}</span>
                    <span className="exec-v3-hrlive-lbl">
                        {liveZone ? `Z${liveZone.zone} · bpm en vivo` : 'bpm en vivo'}
                    </span>
                    {hr.contactLost && <span className="exec-v3-hrlive-warn">sin contacto</span>}
                </button>
            ) : (
                <div className="exec-v3-cardio-source">
                    <HeartPulse className="h-4 w-4 shrink-0" aria-hidden />
                    <span>
                        FC <b>manual</b> — compárala con tu reloj o app y regístrala abajo.
                    </span>
                    {hr.supported && (
                        <button type="button" onClick={() => setSensorOpen(true)} className="exec-v3-hrconnect">
                            <Bluetooth className="h-4 w-4" aria-hidden /> Conectar sensor
                        </button>
                    )}
                </div>
            )}

            {/* Registro tipado REUSADO — captura min / metros / FC de siempre. El promedio del stream BLE
                auto-rellena `actual_avg_hr` de la fila activa (editable) por el flujo tipado existente. */}
            <CaptureRows {...props} suggestedAvgHr={liveBpm != null ? hr.avgBpm : null} />

            {/* Sheet "Conectar sensor" — solo se renderiza si hay soporte (sin promesas falsas en iOS/desktop). */}
            {hr.supported && (
                <SensorSheetV3 open={sensorOpen} onClose={() => setSensorOpen(false)} hr={hr} zones={liveZones} />
            )}

            {/* Pie: rondas */}
            {block.sets > 1 && (
                <div className="exec-v3-foot">
                    <div className="exec-v3-sets">
                        {Array.from({ length: block.sets }).map((_, i) => (
                            <span key={i} className={cn('exec-v3-sq', i < props.doneCount && 'is-on')} />
                        ))}
                        <span className="exec-v3-setlbl tabular-nums">
                            {props.doneCount}/{block.sets} rondas
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}

/** Chip de zona objetivo (Z{n} + rango bpm concreto si el perfil viaja; si no, sólo Z{n}). */
function ZoneChip({ zone, zoneRange }: { zone: number | null; zoneRange: { minBpm: number; maxBpm: number } | null }) {
    if (zone == null) return null
    const color = `var(--zone-z${zone})`
    return (
        <div className="exec-v3-zone" style={{ '--zc': color } as React.CSSProperties}>
            <span className="exec-v3-zonedot" aria-hidden />
            <span className="exec-v3-zonet">Z{zone}</span>
            {zoneRange ? (
                <span className="exec-v3-zonek tabular-nums">{zoneRange.minBpm}–{zoneRange.maxBpm} bpm</span>
            ) : (
                <span className="exec-v3-zonek">{ZONE_CUE[zone] ?? ''}</span>
            )}
        </div>
    )
}

/** Chip de métrica pro (look .a3a-cchip). Solo se renderiza cuando llega con dato real; nunca inventa. */
function MetricChip({
    icon,
    value,
    label,
    wide,
    iconColor,
}: {
    icon: React.ReactNode
    value: string
    label: string
    wide?: boolean
    iconColor?: string
}) {
    return (
        <div className={cn('exec-v3-cchip', wide && 'is-wide')}>
            <span className="exec-v3-ci" style={iconColor ? { color: iconColor } : undefined} aria-hidden>
                {icon}
            </span>
            <span className="exec-v3-cm">
                <span className="exec-v3-cv tabular-nums">{value}</span>
                <span className="exec-v3-cl">{label}</span>
            </span>
        </div>
    )
}

/** Botón juicy "Pausar/Reanudar" del cardio (D2) — full-width, como en RN. */
function CardioPauseButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className="exec-v3-juicy exec-v3-pausebtn"
            aria-label={active ? 'Pausar el temporizador' : 'Reanudar el temporizador'}
        >
            <span className="exec-v3-pauseicon" aria-hidden>
                {active ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5" fill="currentColor" />}
            </span>
            {active ? 'Pausar' : 'Reanudar'}
        </button>
    )
}

/**
 * CTA de las fases por DISTANCIA (Fase D): el alumno confirma que terminó el tramo y la secuencia
 * avanza (si la fase siguiente es por tiempo, arranca sola). Misma identidad juicy que "Pausar" —
 * cero CSS nuevo, así que respeta los tokens `[data-exec-v3]` y reduced-motion tal cual.
 */
function IntervalNextButton({ onNext, phase }: { onNext: () => void; phase: IntervalPhase | null }) {
    const target = intervalPhaseTargetLabel(phase)
    return (
        <button
            type="button"
            onClick={onNext}
            className="exec-v3-juicy exec-v3-pausebtn"
            aria-label={target ? `Fase siguiente — terminé los ${target}` : 'Fase siguiente'}
        >
            <span className="exec-v3-pauseicon" aria-hidden>
                <SkipForward className="h-5 w-5" fill="currentColor" />
            </span>
            Fase siguiente
        </button>
    )
}

/** Cardio CONTINUO: countdown (o distancia) en el color de la zona. */
function ContinuousFace({
    block,
    zone,
    zoneRange,
}: {
    block: BlockType
    zone: number | null
    zoneRange: { minBpm: number; maxBpm: number } | null
}) {
    const { startStopwatch } = useWorkoutTimer()
    const durationSec = block.duration_sec ?? 0
    const countdown = useExecCountdown(durationSec, { autoStart: false })
    const ringColor = zone != null ? `var(--zone-z${zone})` : 'var(--exec-brand)'

    if (durationSec <= 0) {
        return (
            <div className="flex flex-col items-center gap-3">
                <div className="exec-v3-cardio-goal">
                    {(block.distance_value ?? 0) > 0 ? (
                        <>
                            Objetivo: <b>{compactDistance(block.distance_value as number, block.distance_unit)}</b>
                        </>
                    ) : (
                        <>Objetivo: <b>{block.reps || '—'}</b></>
                    )}
                </div>
                <ZoneChip zone={zone} zoneRange={zoneRange} />
                <button type="button" onClick={() => startStopwatch()} className="exec-v3-timerchip">
                    <Timer className="h-4 w-4" aria-hidden /> Cronómetro
                </button>
            </div>
        )
    }

    // Avance vía el motor puro (E3.4): objetivo por TIEMPO, avance = elapsed. El anillo dibuja el
    // RESTANTE (se vacía al avanzar): remaining = 1 - pct → offset = DASH * pct.
    const progress = computeCardioProgress(
        { duration_sec: durationSec },
        { elapsed_sec: durationSec - countdown.timeLeft },
    )
    const pctDone = progress?.pct ?? 1 - countdown.frac
    const restoffset = DASH * pctDone

    return (
        <div className="flex flex-col items-center gap-3">
            <div className="exec-v3-ringrow">
            <button
                type="button"
                onClick={countdown.done ? countdown.restart : countdown.toggle}
                className="exec-v3-holdwrap"
                style={{ '--ring-c': ringColor, width: 196, height: 196 } as React.CSSProperties}
                aria-label={countdown.done ? 'Reiniciar' : countdown.isActive ? 'Pausar' : 'Iniciar'}
            >
                <svg className="exec-v3-hold-svg" viewBox="0 0 208 208" aria-hidden>
                    <circle cx="104" cy="104" r="92" className="exec-v3-hold-track" fill="none" strokeWidth="22" />
                    <circle
                        cx="104"
                        cy="104"
                        r="92"
                        className="exec-v3-cardio-fill"
                        fill="none"
                        strokeWidth="22"
                        strokeLinecap="round"
                        strokeDasharray={DASH}
                        strokeDashoffset={restoffset}
                        style={{ stroke: ringColor }}
                    />
                </svg>
                <div className="exec-v3-holdtxt">
                    <div className={cn('exec-v3-holdnum tabular-nums', countdown.done && 'is-done')}>
                        {countdown.done ? '¡Listo!' : formatCountdown(countdown.timeLeft)}
                    </div>
                    {/* Affordance de tap DENTRO del anillo (QA4): Play/Pause 18px justo bajo el número. */}
                    <span className="exec-v3-hold-icon" aria-hidden>
                        {countdown.done ? <RotateCcw className="h-[18px] w-[18px]" /> : countdown.isActive ? <Pause className="h-[18px] w-[18px]" /> : <Play className="h-[18px] w-[18px]" />}
                    </span>
                    <div className="exec-v3-holdlbl">{countdown.done ? 'Registra abajo' : 'Restante'}</div>
                </div>
            </button>
                {/* QA5 h3: reinicia el countdown a su duración prescrita (mecanismo `restart` del hook). */}
                <button
                    type="button"
                    onClick={countdown.restart}
                    className="exec-v3-restart"
                    aria-label="Reiniciar el contador"
                >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                </button>
            </div>
            <ZoneChip zone={zone} zoneRange={zoneRange} />
            {!countdown.done && <CardioPauseButton active={countdown.isActive} onToggle={countdown.toggle} />}
            {/* Chips de métricas: SOLO objetivos derivables de la prescripción (nada inventado). */}
            <div className="exec-v3-cchips">
                <MetricChip
                    icon={<Timer className="h-4 w-4" />}
                    value={formatCountdown(durationSec)}
                    label="Objetivo"
                    wide={(block.distance_value ?? 0) <= 0}
                />
                {(block.distance_value ?? 0) > 0 && (
                    <MetricChip
                        icon={<Ruler className="h-4 w-4" />}
                        value={compactDistance(block.distance_value as number, block.distance_unit)}
                        label="Distancia"
                    />
                )}
            </div>
        </div>
    )
}

/** Valor mostrado de una fase: distancia si avanza a mano, reloj si se cronometra. */
function phaseValue(phase: IntervalPhase | null, timeLeft: number): string {
    if (!phase) return formatCountdown(timeLeft)
    if (isManualPhase(phase)) return intervalPhaseTargetLabel(phase)
    return formatCountdown(timeLeft)
}

/** Cardio POR INTERVALOS: anillo por fase (colores fijos) + barra de fases + "intervalo N de M". */
function IntervalFace({
    phases,
    zone,
    zoneRange,
}: {
    phases: IntervalPhase[]
    zone: number | null
    zoneRange: { minBpm: number; maxBpm: number } | null
}) {
    const runner = useIntervalRunner(phases)
    const { phase, timeLeft, finished, frac, isActive } = runner
    const color = phase ? phaseColor(phase.kind) : 'var(--exec-brand)'
    const dashoffset = DASH * (1 - frac)
    // Fase D: la fase actual se prescribió por DISTANCIA ⇒ el anillo queda lleno y estático, y el
    // avance lo confirma el alumno con el CTA "Fase siguiente" (nada se cronometra a sus espaldas).
    const manual = !finished && runner.isManual

    const nextPhase = phases[runner.phaseIndex + 1] ?? null
    const totalIntervals = phases.filter((p) => p.kind === 'work').length || 1
    const currentInterval = phase?.repeat ?? (finished ? totalIntervals : 0)
    // Duraciones/distancias de fase derivadas de la prescripción (chips honestos: trabajo / recupera).
    const workPhase = phases.find((p) => p.kind === 'work') ?? null
    const recoveryPhase = phases.find((p) => p.kind === 'recovery') ?? null

    const ringInner = (
        <>
            <svg className="exec-v3-hold-svg" viewBox="0 0 208 208" aria-hidden>
                <circle cx="104" cy="104" r="92" className="exec-v3-hold-track" fill="none" strokeWidth="22" />
                <circle
                    cx="104"
                    cy="104"
                    r="92"
                    className="exec-v3-cardio-fill"
                    fill="none"
                    strokeWidth="22"
                    strokeLinecap="round"
                    strokeDasharray={DASH}
                    strokeDashoffset={dashoffset}
                    style={{ stroke: color }}
                />
            </svg>
            <div className="exec-v3-holdtxt">
                <div className="exec-v3-phaselbl" style={{ color }}>
                    {finished ? 'Completado' : phase ? INTERVAL_PHASE_LABEL[phase.kind] : ''}
                </div>
                <div className={cn('exec-v3-holdnum tabular-nums', finished && 'is-done')}>
                    {finished ? '¡Listo!' : phaseValue(phase, timeLeft)}
                </div>
                {/* Affordance de tap DENTRO del anillo (QA4): Play/Pause 18px justo bajo el número.
                    En una fase por distancia no hay conteo que pausar ⇒ regla (no promete un timer). */}
                <span className="exec-v3-hold-icon" aria-hidden>
                    {finished ? <RotateCcw className="h-[18px] w-[18px]" /> : manual ? <Ruler className="h-[18px] w-[18px]" /> : isActive ? <Pause className="h-[18px] w-[18px]" /> : <Play className="h-[18px] w-[18px]" />}
                </span>
                <div className="exec-v3-holdlbl">
                    {finished ? 'Registra abajo' : manual ? 'Avanza al terminar' : 'Restante en fase'}
                </div>
            </div>
        </>
    )

    return (
        <div className="flex flex-col items-center gap-2.5">
            <div className="exec-v3-ringrow">
            {manual ? (
                // Sin cuenta regresiva no hay nada que pausar: el anillo deja de ser botón (evita un
                // control que no hace nada) y el avance vive en el CTA explícito de abajo.
                <div
                    className="exec-v3-holdwrap"
                    style={{ width: 224, height: 224 } as React.CSSProperties}
                    role="group"
                    aria-label={`Fase actual: ${phase ? INTERVAL_PHASE_LABEL[phase.kind] : ''} ${intervalPhaseTargetLabel(phase)}`}
                >
                    {ringInner}
                </div>
            ) : (
            <button
                type="button"
                onClick={finished ? runner.restart : runner.toggle}
                className="exec-v3-holdwrap"
                style={{ width: 224, height: 224 } as React.CSSProperties}
                aria-label={finished ? 'Reiniciar intervalos' : isActive ? 'Pausar' : 'Iniciar intervalos'}
            >
                {ringInner}
            </button>
            )}
                {/* QA5 h3: reinicia los intervalos desde la primera fase (mecanismo `restart` del runner). */}
                <button
                    type="button"
                    onClick={runner.restart}
                    className="exec-v3-restart"
                    aria-label="Reiniciar el contador"
                >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                </button>
            </div>

            {!finished && nextPhase && (
                <div className="exec-v3-nextphase" style={{ '--np': phaseColor(nextPhase.kind) } as React.CSSProperties}>
                    <span className="exec-v3-nextphase-dot" aria-hidden />
                    Luego: <b>{INTERVAL_PHASE_LABEL[nextPhase.kind]}</b>{' '}
                    <span className="tabular-nums">
                        {isManualPhase(nextPhase) ? intervalPhaseTargetLabel(nextPhase) : formatCountdown(nextPhase.durationSec)}
                    </span>
                </div>
            )}

            {/* Barra de fases segmentada (un segmento por intervalo de trabajo). */}
            <div className="exec-v3-segwrap">
                <div className="exec-v3-segs">
                    {Array.from({ length: totalIntervals }).map((_, i) => {
                        const n = i + 1
                        const state = n < currentInterval ? 'fill' : n === currentInterval ? 'cur' : ''
                        return <span key={i} className={cn('exec-v3-seg', state === 'fill' && 'is-fill', state === 'cur' && 'is-cur')} />
                    })}
                </div>
                <div className="exec-v3-seglbl tabular-nums">
                    Intervalo <b>{Math.max(1, currentInterval)} de {totalIntervals}</b>
                </div>
            </div>

            {/* Chips de fase: duraciones derivadas de la prescripción (trabajo ámbar / recupera verde). */}
            {(workPhase || recoveryPhase) && (
                <div className="exec-v3-cchips">
                    {workPhase && (
                        <MetricChip
                            icon={isManualPhase(workPhase) ? <Ruler className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                            iconColor="var(--zone-z4)"
                            value={isManualPhase(workPhase) ? intervalPhaseTargetLabel(workPhase) : formatCountdown(workPhase.durationSec)}
                            label="Trabajo"
                            wide={!recoveryPhase}
                        />
                    )}
                    {recoveryPhase && (
                        <MetricChip
                            icon={isManualPhase(recoveryPhase) ? <Ruler className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
                            iconColor="var(--zone-z2)"
                            value={isManualPhase(recoveryPhase) ? intervalPhaseTargetLabel(recoveryPhase) : formatCountdown(recoveryPhase.durationSec)}
                            label="Recupera"
                            wide={!workPhase}
                        />
                    )}
                </div>
            )}

            <div className="flex items-center gap-2">
                <ZoneChip zone={zone} zoneRange={zoneRange} />
                {/* "Saltar fase" es el escape de una fase CRONOMETRADA; en una fase manual el avance ya
                    es el CTA principal, así que no se duplica el control. */}
                {!finished && !manual && (
                    <button type="button" onClick={runner.skip} className="exec-v3-skipphase" aria-label="Saltar fase">
                        <SkipForward className="h-3.5 w-3.5" aria-hidden /> Saltar fase
                    </button>
                )}
            </div>
            {!finished && (manual
                ? <IntervalNextButton onNext={runner.next} phase={phase} />
                : <CardioPauseButton active={isActive} onToggle={runner.toggle} />)}
        </div>
    )
}

/**
 * Filas de captura tipada de cardio — LogSetForm REUSADO. Los EJES salen del motor según la
 * modalidad del ejercicio (Fase C): Min · Distancia · FC por defecto, Min · FC en elíptica,
 * Min · Saltos/Reps/Pisos · FC en las rep-based.
 */
function CaptureRows({
    block,
    exercise,
    firstUnlogged,
    blockLogs,
    seedByKey,
    autoTimerEnabled,
    reopenSignal,
    substitution,
    handleLogged,
    handleResult,
    suggestedAvgHr,
}: CardioStepV3Props & { suggestedAvgHr?: number | null }) {
    return (
        <div className="exec-v3-setlist space-y-1.5">
            {Array.from({ length: block.sets }).map((_, i) => {
                const setNumber = i + 1
                const log = blockLogs.find((entry) => entry.set_number === setNumber)
                const isActive = setNumber === firstUnlogged
                return (
                    <LogSetForm
                        key={`${block.id}-${setNumber}`}
                        blockId={block.id}
                        setNumber={setNumber}
                        restTimeStr={block.rest_time}
                        warmupRestTimeStr={block.warmup_rest_time}
                        totalSets={block.sets}
                        nextUpLabel={exercise.name}
                        existingLog={log}
                        seed={seedByKey?.get(sessionLogKey(block.id, setNumber))}
                        targetReps={block.reps}
                        autoTimerEnabled={autoTimerEnabled}
                        mode="cardio"
                        // Unidad de captura = unidad PRESCRITA (G3): con "5 km" la caja se llama "Km" y
                        // el motor guarda 5000 en `actual_distance_m`. Sin prescripción ⇒ "Metros".
                        distanceUnit={block.distance_unit ?? null}
                        // Ejes por MODALIDAD (Fase C): elíptica ⇒ Min · FC; cuerda/HIIT/escaladora ⇒
                        // Min · Saltos|Reps|Pisos · FC; run/bike/row ⇒ como hoy. null ⇒ genérica.
                        cardioModality={exercise.cardio_modality ?? null}
                        typedObjective={formatTypedObjective(block, 'cardio')}
                        isActive={isActive}
                        reopenNonce={
                            reopenSignal?.blockId === block.id && reopenSignal?.setNumber === setNumber
                                ? reopenSignal.nonce
                                : undefined
                        }
                        substitution={substitution ?? null}
                        v3
                        // Auto-prellenado del promedio BLE SOLO en la fila activa (nonce = bpm ⇒ cambia con el
                        // promedio); LogSetForm solo lo escribe si el campo FC está vacío (no pisa ediciones).
                        suggestedAvgHr={
                            isActive && suggestedAvgHr != null ? { bpm: suggestedAvgHr, nonce: suggestedAvgHr } : undefined
                        }
                        onLogged={handleLogged}
                        onResult={handleResult}
                    />
                )
            })}
        </div>
    )
}
