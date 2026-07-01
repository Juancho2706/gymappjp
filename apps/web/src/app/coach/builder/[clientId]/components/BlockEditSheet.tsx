'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Minus, Plus } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { Input } from '@/components/ui/input'
import { ClampedIntInput } from '@/components/ui/clamped-int-input'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { getExerciseHistoryAction } from '../_actions/builder.actions'
import type { BuilderBlock, BuilderCardioContext } from '../types'
import type { ExerciseType, IntervalConfig, SideMode } from '@/domain/workout/types'
import { EXERCISE_TYPE_LABEL, effectiveExerciseType } from '@/lib/workout-exercise-type'
import { exerciseThumbnailUrl } from '@/lib/youtube'
import { INTERVAL_TEMPLATES } from '@/lib/workout-interval'
import { HR_ZONES } from '@/domain/cardio/zones'

interface ExerciseHistory {
    logged_at: string
    weight_kg: number | null
    reps_done: number | null
    set_number: number
}

interface BlockEditSheetProps {
    block: BuilderBlock | null
    clientId?: string | null
    /** Contexto del módulo cardio (zonas del alumno + plantillas); undefined ⇒ OFF. */
    cardio?: BuilderCardioContext
    /** <760: bottom-sheet con grabber + steppers (desktop conserva el panel lateral) */
    isMobile?: boolean
    onClose: () => void
    onUpdate: (block: BuilderBlock) => void
    onChange: (block: BuilderBlock) => void
}

const FIELD_LABEL_CLASS = 'text-[12.5px] font-semibold text-foreground flex items-center gap-1.5'
const FIELD_INPUT_CLASS = 'h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary placeholder:text-muted-foreground'

const SIDE_MODE_OPTIONS: { value: SideMode | null; label: string }[] = [
    { value: null, label: 'Normal' },
    { value: 'per_side', label: 'Por lado' },
    { value: 'alternating', label: 'Alternado' },
]

/** Texto + blur: evita `type="number"` en móvil donde a veces no se puede vaciar el campo. */
function BlockProgressionValueInput({
    progressionType,
    value,
    onCommit,
}: {
    progressionType: 'weight' | 'reps'
    value: number | null
    onCommit: (n: number | null) => void
}) {
    const [str, setStr] = useState(() => (value == null ? '' : String(value)))
    const defaultNum = progressionType === 'weight' ? 2.5 : 1

    useEffect(() => {
        setStr(value == null ? '' : String(value))
    }, [value, progressionType])

    return (
        <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={str}
            onChange={(e) => {
                let v = e.target.value.replace(',', '.')
                if (v !== '' && !/^\d*\.?\d*$/.test(v)) return
                setStr(v)
                if (v === '' || v === '.') {
                    onCommit(null)
                    return
                }
                const f = parseFloat(v)
                if (!Number.isNaN(f)) onCommit(f)
            }}
            onBlur={() => {
                if (str === '' || str === '.') {
                    onCommit(defaultNum)
                    setStr(String(defaultNum))
                    return
                }
                const f = parseFloat(str)
                if (Number.isNaN(f) || f < 0) {
                    onCommit(defaultNum)
                    setStr(String(defaultNum))
                    return
                }
                if (progressionType === 'weight') {
                    const rounded = Math.round(f * 2) / 2
                    onCommit(rounded)
                    setStr(String(rounded))
                } else {
                    const n = Math.round(f)
                    onCommit(n)
                    setStr(String(n))
                }
            }}
            className="h-9 w-full min-w-0 rounded-lg border border-border bg-secondary text-center text-sm font-bold text-foreground focus:border-primary focus:outline-none dark:border-white/10 dark:bg-white/5 sm:w-24"
            placeholder={progressionType === 'weight' ? '2.5' : '1'}
        />
    )
}

/** Input numérico entero opcional (texto + inputMode) que comitea null cuando se vacía. */
function OptionalIntInput({
    value,
    onCommit,
    placeholder,
    max = 100000,
    className,
}: {
    value: number | null | undefined
    onCommit: (n: number | null) => void
    placeholder?: string
    max?: number
    className?: string
}) {
    const [str, setStr] = useState(() => (value == null ? '' : String(value)))
    useEffect(() => {
        setStr(value == null ? '' : String(value))
    }, [value])
    return (
        <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={str}
            onChange={(e) => {
                const v = e.target.value
                if (v !== '' && !/^\d*$/.test(v)) return
                setStr(v)
                if (v === '') {
                    onCommit(null)
                    return
                }
                const n = parseInt(v, 10)
                if (Number.isFinite(n)) onCommit(Math.min(max, n))
            }}
            placeholder={placeholder}
            className={className ?? 'h-12 w-full rounded-lg border border-border bg-secondary px-3 text-center text-sm font-bold text-foreground focus:border-primary focus:outline-none dark:border-white/10 dark:bg-white/5'}
        />
    )
}

/** Pace "m:ss" por km ↔ segundos. */
function PaceInput({
    paceSecPerKm,
    onCommit,
}: {
    paceSecPerKm: number | null | undefined
    onCommit: (sec: number | null) => void
}) {
    const format = (sec: number | null | undefined) =>
        sec == null ? '' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
    const [str, setStr] = useState(() => format(paceSecPerKm))
    useEffect(() => {
        setStr(format(paceSecPerKm))
    }, [paceSecPerKm])
    return (
        <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={str}
            placeholder="5:00"
            onChange={(e) => setStr(e.target.value)}
            onBlur={() => {
                const t = str.trim()
                if (t === '') {
                    onCommit(null)
                    return
                }
                const match = /^(\d{1,2}):([0-5]\d)$/.exec(t)
                if (match) {
                    onCommit(parseInt(match[1], 10) * 60 + parseInt(match[2], 10))
                } else {
                    const n = parseInt(t, 10)
                    if (Number.isFinite(n) && n > 0) onCommit(Math.min(3600, n))
                    else setStr(format(paceSecPerKm))
                }
            }}
            className="h-12 w-full rounded-lg border border-border bg-secondary px-3 text-center text-sm font-bold text-foreground focus:border-primary focus:outline-none dark:border-white/10 dark:bg-white/5"
        />
    )
}

/** Stepper táctil 44px para Series en mobile (kit: botones circulares + numeral eva-metric). */
function SeriesStepper({
    value,
    onValueChange,
    min = 1,
    max = 20,
}: {
    value: number
    onValueChange: (n: number) => void
    min?: number
    max?: number
}) {
    return (
        <div className="flex items-center justify-center gap-3">
            <button
                type="button"
                aria-label="Menos series"
                onClick={() => onValueChange(Math.max(min, (value || 0) - 1))}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--border-default)] bg-surface-card text-[var(--ink-700)] transition-colors active:bg-surface-sunken"
            >
                <Minus className="h-[18px] w-[18px]" />
            </button>
            <span className="eva-metric min-w-9 text-center text-2xl text-strong">{value || 0}</span>
            <button
                type="button"
                aria-label="Más series"
                onClick={() => onValueChange(Math.min(max, (value || 0) + 1))}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--border-default)] bg-surface-card text-[var(--ink-700)] transition-colors active:bg-surface-sunken"
            >
                <Plus className="h-[18px] w-[18px]" />
            </button>
        </div>
    )
}

function SideModeSelector({ block, onChange }: { block: BuilderBlock; onChange: (b: BuilderBlock) => void }) {
    return (
        <div className="grid grid-cols-3 overflow-hidden rounded-control border border-border text-[10px] font-bold uppercase tracking-widest dark:border-white/10">
            {SIDE_MODE_OPTIONS.map((opt) => (
                <button
                    key={opt.label}
                    type="button"
                    onClick={() => onChange({ ...block, side_mode: opt.value })}
                    className={`min-h-[44px] px-2 py-2 transition-colors md:min-h-0 ${
                        (block.side_mode ?? null) === opt.value
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted'
                    }`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    )
}

function HrZoneSelector({
    block,
    cardio,
    onChange,
}: {
    block: BuilderBlock
    cardio?: BuilderCardioContext
    onChange: (b: BuilderBlock) => void
}) {
    const selectedRange = cardio?.enabled
        ? cardio.zones?.find((z) => z.zone === block.hr_zone) ?? null
        : null
    return (
        <div className="space-y-2">
            <label className={FIELD_LABEL_CLASS}>Zona de FC objetivo</label>
            <div className="flex flex-wrap gap-1.5">
                <button
                    type="button"
                    onClick={() => onChange({ ...block, hr_zone: null })}
                    className={`min-h-[44px] rounded-lg border px-3 text-[10px] font-bold uppercase tracking-widest transition-colors md:min-h-[36px] ${
                        block.hr_zone == null
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                >
                    Sin zona
                </button>
                {HR_ZONES.map((zone) => (
                    <button
                        key={zone}
                        type="button"
                        onClick={() => onChange({ ...block, hr_zone: zone })}
                        className={`min-h-[44px] min-w-[44px] rounded-lg border px-3 text-xs font-black transition-colors md:min-h-[36px] md:min-w-[36px] ${
                            block.hr_zone === zone
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                    >
                        Z{zone}
                    </button>
                ))}
            </div>
            {cardio?.enabled && block.hr_zone != null && (
                selectedRange ? (
                    <p className="text-[10px] font-bold text-[var(--success-600)]">
                        Z{block.hr_zone} · {selectedRange.minBpm}–{selectedRange.maxBpm} bpm para este alumno
                    </p>
                ) : (
                    <p className="text-[10px] text-muted-foreground/60">
                        Completa el perfil cardio del alumno (fecha de nacimiento) para ver los bpm.
                    </p>
                )
            )}
        </div>
    )
}

function IntervalEditor({
    block,
    cardio,
    onChange,
}: {
    block: BuilderBlock
    cardio?: BuilderCardioContext
    onChange: (b: BuilderBlock) => void
}) {
    const config = block.interval_config
    const patch = (partial: Partial<IntervalConfig>) => {
        const next: IntervalConfig = {
            repeats: config?.repeats ?? 4,
            work: config?.work ?? { duration_sec: 60 },
            recovery: config?.recovery,
            warmup_sec: config?.warmup_sec,
            cooldown_sec: config?.cooldown_sec,
            ...partial,
        }
        onChange({ ...block, interval_config: next })
    }
    const workByDistance = config?.work?.distance_m != null

    return (
        <div className="space-y-3 rounded-card border border-border bg-muted/30 p-4 dark:border-white/10">
            <div className="flex items-center justify-between gap-2">
                <label className={FIELD_LABEL_CLASS}>Intervalos</label>
                {cardio?.enabled && (
                    <select
                        value=""
                        onChange={(e) => {
                            const tpl = INTERVAL_TEMPLATES.find((t) => t.id === e.target.value)
                            if (!tpl) return
                            onChange({
                                ...block,
                                interval_config: tpl.config,
                                hr_zone: tpl.suggestedHrZone ?? block.hr_zone ?? null,
                                duration_sec: null,
                                distance_value: '',
                            })
                        }}
                        className="h-9 max-w-[180px] rounded-lg border border-border bg-background px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground focus:border-primary focus:outline-none"
                        aria-label="Aplicar plantilla de intervalos"
                    >
                        <option value="">Aplicar plantilla…</option>
                        {INTERVAL_TEMPLATES.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                )}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Repeticiones (N)</p>
                    <ClampedIntInput
                        value={config?.repeats ?? 4}
                        onValueChange={(repeats) => patch({ repeats })}
                        min={1}
                        max={100}
                        className="h-10 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold text-center"
                    />
                </div>
                <div className="space-y-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Trabajo por</p>
                    <div className="grid grid-cols-2 overflow-hidden rounded-control border border-border text-[10px] font-bold uppercase tracking-widest dark:border-white/10">
                        <button
                            type="button"
                            onClick={() => patch({ work: { ...config?.work, duration_sec: config?.work?.duration_sec ?? 60, distance_m: undefined } })}
                            className={`min-h-[40px] transition-colors ${!workByDistance ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                        >
                            Tiempo
                        </button>
                        <button
                            type="button"
                            onClick={() => patch({ work: { ...config?.work, distance_m: config?.work?.distance_m ?? 400, duration_sec: undefined } })}
                            className={`min-h-[40px] transition-colors ${workByDistance ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                        >
                            Distancia
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                        {workByDistance ? 'Trabajo (m)' : 'Trabajo (seg)'}
                    </p>
                    <OptionalIntInput
                        value={workByDistance ? config?.work?.distance_m ?? null : config?.work?.duration_sec ?? null}
                        onCommit={(n) =>
                            patch({
                                work: workByDistance
                                    ? { ...config?.work, distance_m: n ?? undefined, duration_sec: undefined }
                                    : { ...config?.work, duration_sec: n ?? undefined, distance_m: undefined },
                            })
                        }
                        placeholder={workByDistance ? '400' : '60'}
                        max={workByDistance ? 100000 : 14400}
                        className="h-10 w-full rounded-lg border border-border bg-secondary px-3 text-center text-sm font-bold text-foreground focus:border-primary focus:outline-none dark:border-white/10 dark:bg-white/5"
                    />
                </div>
                <div className="space-y-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Recuperación (seg)</p>
                    <OptionalIntInput
                        value={config?.recovery?.duration_sec ?? null}
                        onCommit={(n) => patch({ recovery: n != null ? { ...config?.recovery, duration_sec: n } : undefined })}
                        placeholder="90"
                        max={7200}
                        className="h-10 w-full rounded-lg border border-border bg-secondary px-3 text-center text-sm font-bold text-foreground focus:border-primary focus:outline-none dark:border-white/10 dark:bg-white/5"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Calentamiento (seg)</p>
                    <OptionalIntInput
                        value={config?.warmup_sec ?? null}
                        onCommit={(n) => patch({ warmup_sec: n ?? undefined })}
                        placeholder="300"
                        max={7200}
                        className="h-10 w-full rounded-lg border border-border bg-secondary px-3 text-center text-sm font-bold text-foreground focus:border-primary focus:outline-none dark:border-white/10 dark:bg-white/5"
                    />
                </div>
                <div className="space-y-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Vuelta a la calma (seg)</p>
                    <OptionalIntInput
                        value={config?.cooldown_sec ?? null}
                        onCommit={(n) => patch({ cooldown_sec: n ?? undefined })}
                        placeholder="300"
                        max={7200}
                        className="h-10 w-full rounded-lg border border-border bg-secondary px-3 text-center text-sm font-bold text-foreground focus:border-primary focus:outline-none dark:border-white/10 dark:bg-white/5"
                    />
                </div>
            </div>

            <button
                type="button"
                onClick={() => onChange({ ...block, interval_config: null })}
                className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors min-h-[44px] md:min-h-0"
            >
                Quitar intervalos
            </button>
        </div>
    )
}

function NotesField({ block, onChange, t }: { block: BuilderBlock; onChange: (b: BuilderBlock) => void; t: (k: string) => string }) {
    return (
        <div className="space-y-3">
            <label className={FIELD_LABEL_CLASS}>
                Instrucciones de Protocolo
                <InfoTooltip content={t('tooltip.notes')} />
            </label>
            <textarea
                className="w-full h-32 p-4 text-sm rounded-control bg-secondary dark:bg-white/5 border border-border dark:border-white/10 text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none transition-all resize-none placeholder:text-muted-foreground"
                value={block.notes || ''}
                onChange={e => onChange({...block, notes: e.target.value})}
                placeholder="Detalles biomecánicos o notas..."
                maxLength={1000}
            />
            <p className={`text-right text-[10px] tabular-nums ${(block.notes?.length ?? 0) > 900 ? 'text-[var(--warning-600)]' : 'text-muted-foreground/50'}`}>
                {block.notes?.length ?? 0}/1000
            </p>
        </div>
    )
}

export function BlockEditSheet({ block, clientId, cardio, isMobile = false, onClose, onUpdate, onChange }: BlockEditSheetProps) {
    const { t } = useTranslation()
    const [history, setHistory] = useState<ExerciseHistory[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)

    const effectiveType: ExerciseType = block
        ? effectiveExerciseType(block, { exercise_type: block.exercise_type })
        : 'strength'

    useEffect(() => {
        // Historial solo para fuerza (peso×reps); en tipos nuevos mostraría "? reps".
        if (!block || !clientId || effectiveType !== 'strength') { setHistory([]); return }
        setLoadingHistory(true)
        getExerciseHistoryAction(clientId, block.exercise_id).then(result => {
            setHistory(result.data || [])
            setLoadingHistory(false)
        })
    }, [block?.exercise_id, clientId, effectiveType])

    if (!block) return null

    // Summarize history: avg weight and reps across sets of last session
    const historyLabel = (() => {
        if (!history.length) return null
        const date = new Date(history[0].logged_at)
        const dateStr = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
        const weights = history.map(s => s.weight_kg).filter((w): w is number => w !== null)
        const reps = history.map(s => s.reps_done).filter((r): r is number => r !== null)
        const avgWeight = weights.length ? Math.round(weights.reduce((a, b) => a + b, 0) / weights.length) : null
        const avgReps = reps.length ? Math.round(reps.reduce((a, b) => a + b, 0) / reps.length) : null
        const sets = history.length

        const parts: string[] = [`${sets} × ${avgReps ?? '?'} reps`]
        if (avgWeight) parts.push(`@ ${avgWeight} kg`)
        return { label: parts.join(' '), date: dateStr }
    })()

    const distanceNumber = parseFloat((block.distance_value || '').replace(',', '.'))
    const hasDistance = Number.isFinite(distanceNumber) && distanceNumber > 0

    // Thumbnail del ejercicio (gif > imagen > thumbnail de YouTube > media directa). Iguala la app
    // del alumno: un ejercicio solo-YouTube ya no muestra la inicial. img.youtube.com está en
    // next.config remotePatterns; `unoptimized` para servir gif/mp4 externos tal cual (igual que antes).
    const thumb = exerciseThumbnailUrl(block)

    const blockIsValid = (() => {
        if (effectiveType === 'cardio') {
            return (block.duration_sec ?? 0) > 0 || hasDistance || !!block.interval_config
        }
        if (effectiveType === 'mobility') {
            return !!block.sets && block.sets >= 1 && ((block.duration_sec ?? 0) > 0 || (block.reps_value ?? 0) > 0)
        }
        if (effectiveType === 'roller') {
            return (block.duration_sec ?? 0) > 0 || (block.reps_value ?? 0) > 0
        }
        return !!block.sets && block.sets >= 1 && !!block.reps?.trim()
    })()

    const setOverride = (type: ExerciseType) => {
        const ownType = effectiveExerciseType(null, { exercise_type: block.exercise_type })
        onChange({ ...block, exercise_type_override: type === ownType ? null : type })
    }

    return (
        <Sheet open={!!block} onOpenChange={onClose}>
            <SheetContent
                side={isMobile ? 'bottom' : 'right'}
                className={isMobile
                    ? 'max-h-[92dvh] gap-0 rounded-t-sheet bg-background/95 p-0 shadow-2xl backdrop-blur-2xl'
                    : 'w-full max-w-full bg-background/95 p-0 shadow-2xl backdrop-blur-2xl sm:w-[540px] sm:max-w-[540px] border-l border-border'}
            >
                {isMobile && (
                    <div className="mx-auto mb-1 mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--border-strong)]" aria-hidden="true" />
                )}
                <SheetHeader className={isMobile
                    ? 'border-b border-border bg-muted/20 px-5 pb-4 pt-1 pr-14'
                    : 'border-b border-border bg-muted/20 pb-6 pl-6 pr-14 pt-[max(1.5rem,env(safe-area-inset-top))]'}>
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-control bg-primary/10 flex items-center justify-center overflow-hidden border border-border shrink-0 relative">
                            {thumb ? (
                                <Image
                                    src={thumb}
                                    alt={block.exercise_name}
                                    fill
                                    sizes="64px"
                                    unoptimized
                                    className="object-cover"
                                />
                            ) : (
                                <span className="text-primary font-bold text-2xl">
                                    {block.exercise_name.charAt(0)}
                                </span>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <SheetTitle className="text-lg font-display font-extrabold normal-case tracking-[-0.02em] text-foreground leading-tight break-words">
                                {block.exercise_name}
                            </SheetTitle>
                            <p className="text-xs mt-1 text-muted-foreground flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                {block.muscle_group}
                            </p>
                            {/* Historial del cliente */}
                            {clientId && effectiveType === 'strength' && (
                                <div className="mt-2">
                                    {loadingHistory ? (
                                        <span className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Cargando historial...</span>
                                    ) : historyLabel ? (
                                        <div className="flex items-center gap-1.5 bg-[var(--success-100)] border border-[var(--success-500)]/20 rounded-lg px-2 py-1">
                                            <span className="text-[10px] font-bold text-[var(--success-700)]">Última vez {historyLabel.date}:</span>
                                            <span className="text-[10px] font-bold text-[var(--success-600)]">{historyLabel.label}</span>
                                        </div>
                                    ) : (
                                        <span className="text-[9px] text-muted-foreground/40 uppercase tracking-widest">Sin historial con este cliente</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {/* Tipo de ejercicio (override del bloque — decisión #2 del PLAN) */}
                    <div className="space-y-2">
                        <label className={FIELD_LABEL_CLASS}>Tipo de ejercicio</label>
                        <div className="grid grid-cols-4 overflow-hidden rounded-control border border-border text-[9px] font-bold uppercase tracking-widest dark:border-white/10">
                            {(Object.keys(EXERCISE_TYPE_LABEL) as ExerciseType[]).map((type) => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => setOverride(type)}
                                    className={`min-h-[44px] px-1 py-2 transition-colors md:min-h-[36px] ${
                                        effectiveType === type
                                            ? 'bg-primary text-primary-foreground'
                                            : 'text-muted-foreground hover:bg-muted'
                                    }`}
                                >
                                    {EXERCISE_TYPE_LABEL[type]}
                                </button>
                            ))}
                        </div>
                        {block.exercise_type_override != null && (
                            <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">
                                Tipo modificado solo en este bloque
                            </p>
                        )}
                    </div>

                    {effectiveType === 'strength' && (
                        <>
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <label className="text-[12.5px] font-semibold text-foreground flex items-center gap-1.5">
                                Series
                                <span className="text-[var(--danger-500)]">*</span>
                            </label>
                            {isMobile ? (
                                <SeriesStepper value={block.sets ?? 0} onValueChange={(sets) => onChange({ ...block, sets })} />
                            ) : (
                                <ClampedIntInput
                                    value={block.sets ?? 0}
                                    onValueChange={(sets) => onChange({ ...block, sets })}
                                    min={1}
                                    max={20}
                                    placeholder="Ej. 3"
                                    className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary text-center"
                                />
                            )}
                            <p className="text-[10px] text-muted-foreground/50 text-center">1–20 series</p>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[12.5px] font-semibold text-foreground flex items-center gap-1.5">
                                Repeticiones
                                <span className="text-[var(--danger-500)]">*</span>
                            </label>
                            <Input
                                value={block.reps}
                                onChange={e => onChange({...block, reps: e.target.value})}
                                placeholder="Ej. 10-12 o AMRAP"
                                maxLength={20}
                                autoComplete="off"
                                className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary text-center"
                            />
                            <p className="text-[10px] text-muted-foreground/50 text-center">número, rango o AMRAP</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <label className="text-[12.5px] font-semibold text-foreground flex items-center gap-1.5">
                                Peso Objetivo (kg)
                                <InfoTooltip content={t('tooltip.weight')} />
                            </label>
                            <Input
                                value={block.target_weight_kg || ''}
                                onChange={e => onChange({...block, target_weight_kg: e.target.value})}
                                placeholder="Ej. 60 o 62.5"
                                inputMode="decimal"
                                autoComplete="off"
                                className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary placeholder:text-muted-foreground"
                            />
                            <p className="text-[10px] text-muted-foreground/50">en kg, acepta decimales</p>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[12.5px] font-semibold text-foreground flex items-center gap-1.5">
                                RIR / RPE
                                <InfoTooltip content={t('tooltip.rir')} />
                            </label>
                            <Input
                                value={block.rir || ''}
                                onChange={e => onChange({...block, rir: e.target.value})}
                                placeholder="Ej. 2 (reps en reserva)"
                                maxLength={10}
                                autoComplete="off"
                                className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary placeholder:text-muted-foreground"
                            />
                            <p className="text-[10px] text-muted-foreground/50">cuántas reps quedan en el tanque</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <label className="text-[12.5px] font-semibold text-foreground flex items-center gap-1.5">
                                Tempo
                                <InfoTooltip content={t('tooltip.tempo')} />
                            </label>
                            <Input
                                value={block.tempo || ''}
                                onChange={e => onChange({...block, tempo: e.target.value})}
                                placeholder="Ej. 3-1-X-1"
                                maxLength={20}
                                autoComplete="off"
                                className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary placeholder:text-muted-foreground"
                            />
                            <p className="text-[10px] text-muted-foreground/50">excéntrica · pausa · concéntrica · pausa</p>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[12.5px] font-semibold text-foreground flex items-center gap-1.5">
                                Recuperación
                                <InfoTooltip content={t('tooltip.rest')} />
                            </label>
                            <Input
                                value={block.rest_time || ''}
                                onChange={e => onChange({...block, rest_time: e.target.value})}
                                placeholder="Ej. 90s o 2min"
                                maxLength={20}
                                autoComplete="off"
                                className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary placeholder:text-muted-foreground"
                            />
                            <p className="text-[10px] text-muted-foreground/50">segundos o minutos entre series</p>
                        </div>
                    </div>

                    {/* Ejes adicionales (farmer carry: carga + distancia + lado — AC2) */}
                    <div className="space-y-3 rounded-card border border-border bg-muted/30 p-4 dark:border-white/10">
                        <label className={FIELD_LABEL_CLASS}>Ejes adicionales (opcional)</label>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Distancia</p>
                                <div className="flex gap-1.5">
                                    <Input
                                        value={block.distance_value || ''}
                                        onChange={e => onChange({ ...block, distance_value: e.target.value })}
                                        placeholder="Ej. 7.5"
                                        inputMode="decimal"
                                        autoComplete="off"
                                        className="h-10 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary text-center"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => onChange({ ...block, distance_unit: block.distance_unit === 'km' ? 'm' : 'km' })}
                                        className="h-10 min-w-[48px] rounded-lg border border-border bg-secondary text-[10px] font-bold uppercase text-muted-foreground hover:bg-muted dark:border-white/10 dark:bg-white/5"
                                    >
                                        {block.distance_unit ?? 'm'}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Unidad de carga</p>
                                <div className="grid grid-cols-2 overflow-hidden rounded-control border border-border text-[10px] font-bold uppercase tracking-widest dark:border-white/10">
                                    {(['kg', 'lb'] as const).map((unit) => (
                                        <button
                                            key={unit}
                                            type="button"
                                            onClick={() => onChange({ ...block, load_unit: unit, load_type: 'weight' })}
                                            className={`min-h-[40px] transition-colors ${
                                                (block.load_unit ?? 'kg') === unit
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'text-muted-foreground hover:bg-muted'
                                            }`}
                                        >
                                            {unit}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Lado</p>
                            <SideModeSelector block={block} onChange={onChange} />
                        </div>
                    </div>
                        </>
                    )}

                    {effectiveType === 'cardio' && (
                        <>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className={FIELD_LABEL_CLASS}>Duración (min)</label>
                                    <OptionalIntInput
                                        value={block.duration_sec != null ? Math.round(block.duration_sec / 60) : null}
                                        onCommit={(min) => onChange({ ...block, duration_sec: min != null ? min * 60 : null })}
                                        placeholder="Ej. 20"
                                        max={1440}
                                    />
                                    <p className="text-[10px] text-muted-foreground/50 text-center">minutos continuos</p>
                                </div>
                                <div className="space-y-3">
                                    <label className={FIELD_LABEL_CLASS}>Distancia</label>
                                    <div className="flex gap-1.5">
                                        <Input
                                            value={block.distance_value || ''}
                                            onChange={e => onChange({ ...block, distance_value: e.target.value })}
                                            placeholder="Ej. 5"
                                            inputMode="decimal"
                                            autoComplete="off"
                                            className={`${FIELD_INPUT_CLASS} text-center`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => onChange({ ...block, distance_unit: block.distance_unit === 'km' ? 'm' : 'km' })}
                                            className="h-12 min-w-[52px] rounded-lg border border-border bg-secondary text-[10px] font-bold uppercase text-muted-foreground hover:bg-muted dark:border-white/10 dark:bg-white/5"
                                        >
                                            {block.distance_unit ?? 'm'}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground/50 text-center">duración O distancia</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className={FIELD_LABEL_CLASS}>Pace objetivo (min/km)</label>
                                    <PaceInput
                                        paceSecPerKm={block.target_pace_sec_per_km}
                                        onCommit={(sec) => onChange({ ...block, target_pace_sec_per_km: sec })}
                                    />
                                    <p className="text-[10px] text-muted-foreground/50 text-center">opcional, formato m:ss</p>
                                </div>
                                <div className="space-y-3">
                                    <label className={FIELD_LABEL_CLASS}>Series del bloque</label>
                                    {isMobile ? (
                                        <SeriesStepper value={block.sets ?? 1} onValueChange={(sets) => onChange({ ...block, sets })} />
                                    ) : (
                                        <ClampedIntInput
                                            value={block.sets ?? 1}
                                            onValueChange={(sets) => onChange({ ...block, sets })}
                                            min={1}
                                            max={20}
                                            className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary text-center"
                                        />
                                    )}
                                    <p className="text-[10px] text-muted-foreground/50 text-center">rondas del mismo trabajo</p>
                                </div>
                            </div>

                            <HrZoneSelector block={block} cardio={cardio} onChange={onChange} />

                            {block.interval_config ? (
                                <IntervalEditor block={block} cardio={cardio} onChange={onChange} />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => onChange({
                                        ...block,
                                        interval_config: { repeats: 4, work: { duration_sec: 60 }, recovery: { duration_sec: 90, mode: 'rest' } },
                                    })}
                                    className="w-full min-h-[44px] rounded-control border border-dashed border-border px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                                >
                                    + Prescribir por intervalos
                                </button>
                            )}

                            <div className="space-y-3">
                                <label className={FIELD_LABEL_CLASS}>Recuperación entre series</label>
                                <Input
                                    value={block.rest_time || ''}
                                    onChange={e => onChange({...block, rest_time: e.target.value})}
                                    placeholder="Ej. 90s o 2min"
                                    maxLength={20}
                                    autoComplete="off"
                                    className={FIELD_INPUT_CLASS}
                                />
                            </div>
                        </>
                    )}

                    {effectiveType === 'mobility' && (
                        <>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className={FIELD_LABEL_CLASS}>
                                        Hold (seg)
                                        <span className="text-[var(--danger-500)]">*</span>
                                    </label>
                                    <OptionalIntInput
                                        value={block.duration_sec}
                                        onCommit={(sec) => onChange({ ...block, duration_sec: sec })}
                                        placeholder="Ej. 30"
                                        max={3600}
                                    />
                                    <p className="text-[10px] text-muted-foreground/50 text-center">segundos por hold</p>
                                </div>
                                <div className="space-y-3">
                                    <label className={FIELD_LABEL_CLASS}>Series (holds)</label>
                                    {isMobile ? (
                                        <SeriesStepper value={block.sets ?? 1} onValueChange={(sets) => onChange({ ...block, sets })} />
                                    ) : (
                                        <ClampedIntInput
                                            value={block.sets ?? 1}
                                            onValueChange={(sets) => onChange({ ...block, sets })}
                                            min={1}
                                            max={20}
                                            className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary text-center"
                                        />
                                    )}
                                    <p className="text-[10px] text-muted-foreground/50 text-center">repeticiones del hold</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className={FIELD_LABEL_CLASS}>Respiraciones (opcional)</label>
                                    <OptionalIntInput
                                        value={block.reps_unit === 'breaths' ? block.reps_value : null}
                                        onCommit={(n) => onChange({ ...block, reps_value: n, reps_unit: n != null ? 'breaths' : null })}
                                        placeholder="Ej. 5"
                                        max={100}
                                    />
                                    <p className="text-[10px] text-muted-foreground/50 text-center">respiraciones por hold</p>
                                </div>
                                <div className="space-y-3">
                                    <label className={FIELD_LABEL_CLASS}>Lado</label>
                                    <SideModeSelector block={block} onChange={onChange} />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className={FIELD_LABEL_CLASS}>Descanso entre holds</label>
                                <Input
                                    value={block.rest_time || ''}
                                    onChange={e => onChange({...block, rest_time: e.target.value})}
                                    placeholder="Ej. 30s"
                                    maxLength={20}
                                    autoComplete="off"
                                    className={FIELD_INPUT_CLASS}
                                />
                            </div>
                        </>
                    )}

                    {effectiveType === 'roller' && (
                        <>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className={FIELD_LABEL_CLASS}>Duración (seg)</label>
                                    <OptionalIntInput
                                        value={block.duration_sec}
                                        onCommit={(sec) => onChange({
                                            ...block,
                                            duration_sec: sec,
                                            ...(sec != null ? { reps_value: null, reps_unit: null } : {}),
                                        })}
                                        placeholder="Ej. 60"
                                        max={3600}
                                    />
                                    <p className="text-[10px] text-muted-foreground/50 text-center">segundos por zona</p>
                                </div>
                                <div className="space-y-3">
                                    <label className={FIELD_LABEL_CLASS}>Pasadas</label>
                                    <OptionalIntInput
                                        value={block.reps_unit === 'passes' ? block.reps_value : null}
                                        onCommit={(n) => onChange({
                                            ...block,
                                            reps_value: n,
                                            reps_unit: n != null ? 'passes' : null,
                                            ...(n != null ? { duration_sec: null } : {}),
                                        })}
                                        placeholder="Ej. 10"
                                        max={1000}
                                    />
                                    <p className="text-[10px] text-muted-foreground/50 text-center">duración O pasadas</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className={FIELD_LABEL_CLASS}>Lado</label>
                                <SideModeSelector block={block} onChange={onChange} />
                            </div>
                        </>
                    )}

                    {/* Instrucciones por ejercicio asignado (transversal — columna instructions) */}
                    {effectiveType !== 'strength' && (
                        <div className="space-y-3">
                            <label className={FIELD_LABEL_CLASS}>Instrucciones para el alumno</label>
                            <textarea
                                className="w-full h-24 p-4 text-sm rounded-control bg-secondary dark:bg-white/5 border border-border dark:border-white/10 text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none transition-all resize-none placeholder:text-muted-foreground"
                                value={block.instructions || ''}
                                onChange={e => onChange({ ...block, instructions: e.target.value })}
                                placeholder="Cómo ejecutar este bloque (ritmo, técnica, sensación)..."
                                maxLength={2000}
                            />
                        </div>
                    )}

                    <NotesField block={block} onChange={onChange} t={t} />

                    {/* Auto-progression — solo fuerza (kg/reps no aplican a los tipos nuevos) */}
                    {effectiveType === 'strength' && (
                    <div className="space-y-3 rounded-card border border-border bg-muted/30 p-4 dark:border-white/10">
                        <div className="flex items-center justify-between">
                            <label className="text-[12.5px] font-semibold text-foreground">
                                Progresión automática
                            </label>
                            <button
                                onClick={() => onChange({
                                    ...block,
                                    progression_type: block.progression_type ? null : 'weight',
                                    progression_value: block.progression_type ? null : 2.5,
                                })}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                    block.progression_type ? 'bg-primary' : 'bg-muted-foreground/30'
                                }`}
                            >
                                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow ${
                                    block.progression_type ? 'translate-x-4' : 'translate-x-0.5'
                                }`} />
                            </button>
                        </div>

                        {block.progression_type && (<>
                            <div className="mt-2 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                                <div className="grid min-w-0 grid-cols-2 overflow-hidden rounded-control border border-border text-[10px] font-bold uppercase tracking-widest dark:border-white/10">
                                    <button
                                        onClick={() => onChange({...block, progression_type: 'weight'})}
                                        className={`px-3 py-2 transition-colors ${block.progression_type === 'weight' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                                    >
                                        + Peso
                                    </button>
                                    <button
                                        onClick={() => onChange({...block, progression_type: 'reps'})}
                                        className={`px-3 py-2 transition-colors ${block.progression_type === 'reps' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                                    >
                                        + Reps
                                    </button>
                                </div>
                                <div className="flex min-w-0 items-center gap-1.5 sm:flex-1">
                                    <BlockProgressionValueInput
                                        progressionType={block.progression_type}
                                        value={block.progression_value ?? null}
                                        onCommit={(n) => onChange({ ...block, progression_value: n })}
                                    />
                                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                        {block.progression_type === 'weight' ? 'kg/sem' : 'rep/ses'}
                                    </span>
                                </div>
                            </div>
                            {/* Modo de progresión POR-EJERCICIO (solo peso). Motor: lib/workout/progression.ts */}
                            {block.progression_type === 'weight' && (
                                <div className="mt-3 space-y-1.5 rounded-lg border border-border/60 p-2.5 dark:border-white/10">
                                    <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">¿Cómo sube el peso?</label>
                                    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border dark:border-white/10">
                                        <button
                                            type="button"
                                            onClick={() => onChange({ ...block, progression_mode: 'weekly_linear' })}
                                            className={`p-2.5 text-left transition-colors ${(block.progression_mode ?? 'weekly_linear') === 'weekly_linear' ? 'bg-primary/10 ring-1 ring-inset ring-primary' : 'hover:bg-muted'}`}
                                        >
                                            <span className="block text-[11px] font-bold text-foreground">Cada semana</span>
                                            <span className="mt-0.5 block text-[9px] leading-tight text-muted-foreground">+{block.progression_value ?? '?'} kg automático por semana</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onChange({ ...block, progression_mode: 'double' })}
                                            className={`border-l border-border p-2.5 text-left transition-colors dark:border-white/10 ${block.progression_mode === 'double' ? 'bg-primary/10 ring-1 ring-inset ring-primary' : 'hover:bg-muted'}`}
                                        >
                                            <span className="block text-[11px] font-bold text-foreground">Al completar las reps</span>
                                            <span className="mt-0.5 block text-[9px] leading-tight text-muted-foreground">Sube cuando llena el rango (doble progresión)</span>
                                        </button>
                                    </div>
                                    {block.progression_mode === 'double' && (
                                        <p className="text-[9px] leading-snug text-muted-foreground/70">
                                            Necesita un rango de reps (ej. 8-12). El alumno mantiene el peso hasta completar el tope en todas las series; ahí sube +{block.progression_value ?? '?'} kg.
                                        </p>
                                    )}
                                </div>
                            )}
                        </>)}
                        {!block.progression_type && (
                            <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">
                                Activa para incrementar peso o reps automáticamente cada semana
                            </p>
                        )}
                    </div>
                    )}

                    <button
                        onClick={() => onUpdate(block)}
                        disabled={!blockIsValid}
                        className="w-full py-4 mt-4 bg-primary text-primary-foreground font-bold text-[15px] rounded-control shadow-[0_0_20px_rgba(var(--theme-primary-rgb,0,122,255),0.4)] hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                        style={{
                            backgroundColor: 'var(--theme-primary, #007AFF)',
                            boxShadow: '0 0 20px -5px var(--theme-primary, rgba(0,122,255,0.4))'
                        }}
                    >
                        {!blockIsValid
                            ? 'Datos incompletos'
                            : 'Guardar bloque'}
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
