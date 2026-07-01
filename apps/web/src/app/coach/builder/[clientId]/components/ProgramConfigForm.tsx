'use client'

import { Repeat, RotateCcw, Calendar, Plus, Trash2, ChevronUp, ChevronDown, Minus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ClampedIntInput, OptionalClampedIntInput } from '@/components/ui/clamped-int-input'
import { Switch } from '@/components/ui/switch'
import type { ProgramPhase } from '../types'

/** Presets de color del Design System (.dt-phase-sw). */
const PHASE_COLORS = ['#2680FF', '#7C5CE6', '#1FB877', '#FF6A3D', '#DB2D7E']

/** Props de los campos — compartidas entre el slide-in desktop y el bottom sheet mobile. */
export interface ProgramConfigFieldProps {
    programName: string
    setProgramName: (name: string) => void
    durationType: 'weeks' | 'async' | 'calendar_days'
    setDurationType: (type: 'weeks' | 'async' | 'calendar_days') => void
    weeksToRepeat: number
    setWeeksToRepeat: (weeks: number) => void
    durationDays: number | null
    setDurationDays: (days: number | null) => void
    startDateFlexible: boolean
    setStartDateFlexible: (flexible: boolean) => void
    startDate: string
    setStartDate: (date: string) => void
    programNotes: string
    setProgramNotes: (notes: string) => void
    programStructureType: 'weekly' | 'cycle'
    setProgramStructureType: (type: 'weekly' | 'cycle') => void
    cycleLength: number
    setCycleLength: (length: number) => void
    programPhases: ProgramPhase[]
    setProgramPhases: (phases: ProgramPhase[]) => void
    isABMode: boolean
    setIsABMode: (ab: boolean) => void
}

interface ProgramConfigFormProps extends ProgramConfigFieldProps {
    /** Mobile (<md) muestra TIPO DE DURACIÓN (radios) + Inicio flexible. Desktop slide-in los omite. */
    isMobile: boolean
}

const SEC = 'text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground'

const DURATION_OPTIONS: { value: 'weeks' | 'async' | 'calendar_days'; label: string; helper: string }[] = [
    { value: 'weeks', label: 'Por semanas', helper: 'Se repite N semanas con calendario Lun–Dom.' },
    { value: 'async', label: 'Por días (sin calendario)', helper: 'El alumno avanza a su ritmo, sin fecha fija.' },
    { value: 'calendar_days', label: 'Por días corridos', helper: 'N días consecutivos desde el inicio.' },
]

/** Stepper −/valor/+ (.dt-ex-field numérico del DS). */
function Stepper({
    value, onChange, min, max, suffix,
}: {
    value: number
    onChange: (n: number) => void
    min: number
    max: number
    suffix?: string
}) {
    return (
        <div className="flex items-center gap-3">
            <button
                type="button"
                onClick={() => onChange(Math.max(min, value - 1))}
                disabled={value <= min}
                aria-label="Disminuir"
                className="flex h-9 w-9 items-center justify-center rounded-control border border-border bg-background text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-40"
            >
                <Minus className="h-4 w-4" />
            </button>
            <div className="min-w-[3rem] text-center">
                <span className="text-2xl font-black tabular-nums text-foreground">{value}</span>
                {suffix && <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{suffix}</p>}
            </div>
            <button
                type="button"
                onClick={() => onChange(Math.min(max, value + 1))}
                disabled={value >= max}
                aria-label="Aumentar"
                className="flex h-9 w-9 items-center justify-center rounded-control border border-border bg-background text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-40"
            >
                <Plus className="h-4 w-4" />
            </button>
        </div>
    )
}

export function ProgramConfigForm({
    programName, setProgramName,
    durationType, setDurationType,
    weeksToRepeat, setWeeksToRepeat,
    durationDays, setDurationDays,
    startDateFlexible, setStartDateFlexible,
    startDate, setStartDate,
    programNotes, setProgramNotes,
    programStructureType, setProgramStructureType,
    cycleLength, setCycleLength,
    programPhases, setProgramPhases,
    isABMode, setIsABMode,
    isMobile,
}: ProgramConfigFormProps) {
    return (
        <div className="space-y-6">
            {/* NOMBRE */}
            <div className="space-y-2">
                <label className={SEC}>Nombre del programa</label>
                <Input
                    value={programName}
                    onChange={e => setProgramName(e.target.value)}
                    placeholder="EJ: HYPERTROPHY BLOCK 1"
                    maxLength={100}
                    autoComplete="off"
                    className="h-11 rounded-control bg-background border-border font-bold text-xs uppercase tracking-widest placeholder:text-muted-foreground"
                />
                <p className={`text-right text-[10px] tabular-nums ${programName.length > 85 ? 'text-amber-500' : 'text-muted-foreground/40'}`}>
                    {programName.length}/100
                </p>
            </div>

            {/* ESTRUCTURA */}
            <div className="space-y-2" data-tour-id="config-structure-section">
                <label className={SEC}>Estructura del programa</label>
                <div data-tour-id="program-structure-toggle" className="flex rounded-control overflow-hidden border border-border bg-background">
                    <button
                        type="button"
                        onClick={() => setProgramStructureType('weekly')}
                        className={`flex-1 flex items-center justify-center gap-2 h-11 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                            programStructureType === 'weekly'
                                ? 'bg-primary text-primary-foreground shadow-inner'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Calendar className="w-3.5 h-3.5" />
                        Semanal
                    </button>
                    <button
                        type="button"
                        onClick={() => setProgramStructureType('cycle')}
                        className={`flex-1 flex items-center justify-center gap-2 h-11 text-[11px] font-bold uppercase tracking-widest transition-colors border-l border-border ${
                            programStructureType === 'cycle'
                                ? 'bg-primary text-primary-foreground shadow-inner'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Ciclo N-Días
                    </button>
                </div>
                {programStructureType === 'cycle' && (
                    <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-card p-3 mt-2">
                        <RotateCcw className="w-4 h-4 text-primary flex-shrink-0" />
                        <div className="flex-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-0.5">Longitud del ciclo</p>
                            <p className="text-[10px] text-muted-foreground">Se repite continuamente, no depende de Lun–Dom.</p>
                        </div>
                        <Stepper value={cycleLength} onChange={setCycleLength} min={1} max={14} suffix="días" />
                    </div>
                )}
            </div>

            {/* SEMANAS A/B */}
            <div className="space-y-2">
                <label className={SEC}>Semanas A/B</label>
                <div className="flex items-center justify-between gap-3 rounded-control border border-border bg-background px-4 h-11">
                    <span className="text-sm font-medium text-foreground">Alternar semana A y B</span>
                    <Switch checked={isABMode} onCheckedChange={setIsABMode} />
                </div>
            </div>

            {/* SEMANAS A REPETIR (ancla del tour de duración) */}
            <div className="space-y-2" data-tour-id="config-duration-section">
                <label className={`${SEC} flex items-center gap-2`}>
                    <Repeat className="w-3.5 h-3.5" />
                    Semanas a repetir
                </label>
                <Stepper value={weeksToRepeat} onChange={setWeeksToRepeat} min={1} max={52} suffix="semanas" />
                <p className="text-[10px] text-muted-foreground/50">1–52 semanas</p>
            </div>

            {/* TIPO DE DURACIÓN — estructura semanal (desktop + mobile) */}
            {programStructureType === 'weekly' && (
                <div className="space-y-2">
                    <label className={SEC}>Tipo de duración</label>
                    <div className="flex flex-col gap-1.5">
                        {DURATION_OPTIONS.map(({ value, label, helper }) => {
                            const active = durationType === value
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setDurationType(value)}
                                    className={`flex items-start gap-2.5 rounded-control border p-3 text-left transition-colors ${
                                        active ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-primary/40'
                                    }`}
                                >
                                    <span className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${active ? 'border-primary bg-primary' : 'border-muted-foreground/50'}`}>
                                        {active && <span className="h-[7px] w-[7px] rounded-full bg-primary-foreground" />}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-[13px] font-bold text-foreground">{label}</span>
                                        <span className="text-[11px] text-muted-foreground">{helper}</span>
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                    {(durationType === 'async' || durationType === 'calendar_days') && (
                        <div className="space-y-1 pt-1">
                            <label className={SEC}>Total de días</label>
                            <OptionalClampedIntInput
                                value={durationDays}
                                onValueChange={setDurationDays}
                                min={1}
                                max={365}
                                placeholder="Ej: 10"
                                className="h-11 bg-background border-border font-bold text-xs text-center"
                            />
                            <p className="text-[10px] text-muted-foreground/50 text-center">1–365 días</p>
                        </div>
                    )}
                </div>
            )}

            {/* INICIO FLEXIBLE (desktop + mobile) */}
            {(
                <div className="space-y-3">
                    <label className="flex items-center gap-2.5 cursor-pointer w-max group">
                        <input
                            type="checkbox"
                            checked={startDateFlexible}
                            onChange={e => setStartDateFlexible(e.target.checked)}
                            className="rounded border-border accent-primary h-4 w-4"
                        />
                        <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                            Inicio flexible — el alumno decide cuándo arranca
                        </span>
                    </label>
                    {!startDateFlexible && (
                        <Input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="h-11 bg-background border-border text-foreground font-bold text-sm w-full font-sans"
                        />
                    )}
                </div>
            )}

            {/* FASES */}
            <div className="space-y-3" data-tour-id="config-phases-section">
                <div className="flex items-center justify-between gap-3">
                    <label className={SEC}>Fases (timeline)</label>
                    <button
                        type="button"
                        onClick={() => {
                            const i = programPhases.length
                            setProgramPhases([
                                ...programPhases,
                                { name: `Fase ${i + 1}`, weeks: 4, color: PHASE_COLORS[i % PHASE_COLORS.length] },
                            ])
                        }}
                        className="inline-flex items-center gap-1.5 rounded-pill border border-dashed border-primary/40 px-3 h-8 text-[11px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary/10"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Añadir fase
                    </button>
                </div>
                <p className="text-[10px] text-foreground/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    Solo ordenan el timeline visual del programa; no cambian ejercicios ni cargas.
                </p>
                <div className="space-y-2">
                    {programPhases.map((phase, index) => (
                        <div key={index} className="flex flex-wrap items-center gap-2 rounded-control bg-background border border-border p-2.5">
                            {/* Swatches de presets */}
                            <div className="flex items-center gap-1.5 shrink-0">
                                {PHASE_COLORS.map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        aria-label={`Color ${c}`}
                                        onClick={() => {
                                            const next = [...programPhases]
                                            next[index] = { ...next[index], color: c }
                                            setProgramPhases(next)
                                        }}
                                        style={{ backgroundColor: c }}
                                        className={`h-4 w-4 rounded-[5px] border-2 transition-transform hover:scale-110 ${phase.color === c ? 'border-foreground' : 'border-transparent'}`}
                                    />
                                ))}
                            </div>
                            <Input
                                value={phase.name}
                                onChange={e => {
                                    const next = [...programPhases]
                                    next[index] = { ...next[index], name: e.target.value }
                                    setProgramPhases(next)
                                }}
                                placeholder="Nombre de la fase"
                                maxLength={80}
                                autoComplete="off"
                                className="h-9 flex-1 min-w-[110px] text-xs font-bold uppercase tracking-widest"
                            />
                            <div className="flex items-center gap-1">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Sem.</span>
                                <ClampedIntInput
                                    value={phase.weeks}
                                    onValueChange={(weeks) => {
                                        const next = [...programPhases]
                                        next[index] = { ...next[index], weeks }
                                        setProgramPhases(next)
                                    }}
                                    min={1}
                                    max={52}
                                    className="h-9 w-14 text-center text-xs font-bold"
                                />
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0 ml-auto">
                                <button
                                    type="button"
                                    disabled={index === 0}
                                    onClick={() => {
                                        if (index === 0) return
                                        const next = [...programPhases]
                                        ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
                                        setProgramPhases(next)
                                    }}
                                    aria-label="Subir fase"
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                                >
                                    <ChevronUp className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    disabled={index >= programPhases.length - 1}
                                    onClick={() => {
                                        if (index >= programPhases.length - 1) return
                                        const next = [...programPhases]
                                        ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
                                        setProgramPhases(next)
                                    }}
                                    aria-label="Bajar fase"
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                                >
                                    <ChevronDown className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setProgramPhases(programPhases.filter((_, i) => i !== index))}
                                    aria-label="Eliminar fase"
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive/10"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                    {programPhases.length === 0 && (
                        <p className="text-[10px] text-muted-foreground/60 italic py-2">Sin fases definidas. Usa &quot;Añadir fase&quot; para el timeline.</p>
                    )}
                </div>
            </div>

            {/* NOTAS DEL PROGRAMA */}
            <div className="space-y-2">
                <label className={SEC}>Notas del programa</label>
                <textarea
                    className="w-full h-[88px] p-3 text-sm rounded-control bg-background border border-border text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none resize-none placeholder:text-muted-foreground"
                    value={programNotes}
                    onChange={e => setProgramNotes(e.target.value)}
                    placeholder="Reglas del macrociclo, RIR general, consideraciones…"
                    maxLength={2000}
                />
                <p className={`text-right text-[10px] tabular-nums ${(programNotes?.length ?? 0) > 1800 ? 'text-amber-500' : 'text-muted-foreground/40'}`}>
                    {programNotes?.length ?? 0}/2000
                </p>
            </div>
        </div>
    )
}
