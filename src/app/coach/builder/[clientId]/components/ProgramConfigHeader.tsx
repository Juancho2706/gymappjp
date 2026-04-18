'use client'

import { Edit2, Repeat, ChevronDown, ChevronUp, RotateCcw, Calendar, Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ClampedIntInput, OptionalClampedIntInput } from '@/components/ui/clamped-int-input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ProgramPhase } from '../types'

const PHASE_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

interface ProgramConfigHeaderProps {
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
    onClose: () => void
}

const DURATION_LABELS: Record<string, string> = {
    weeks: 'Semanas',
    async: 'Ciclos Asíncronos',
    calendar_days: 'Días Fijos',
}

export function ProgramConfigHeader({
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
    onClose
}: ProgramConfigHeaderProps) {
    return (
        <div className="max-w-7xl mx-auto px-4 py-6 bg-muted/30 border-t border-border shadow-inner max-h-[80dvh] md:max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                    {/* Nombre */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center justify-between">
                            Designación
                        </label>
                        <div className="relative">
                            <Edit2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input 
                                value={programName}
                                onChange={e => setProgramName(e.target.value)}
                                placeholder="EJ: HYPERTROPHY BLOCK 1"
                                className="h-12 pl-11 rounded-xl bg-background border-border font-bold text-xs uppercase tracking-widest placeholder:text-muted-foreground"
                            />
                        </div>
                    </div>

                    {/* Modo de Estructura: Semanal / Ciclo */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                            Estructura del Programa
                        </label>
                        <div className="flex rounded-xl overflow-hidden border border-border bg-background">
                            <button
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
                            <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl p-3 mt-2">
                                <RotateCcw className="w-4 h-4 text-primary flex-shrink-0" />
                                <div className="flex-1">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Longitud del Ciclo</p>
                                    <p className="text-[10px] text-muted-foreground">El ciclo se repite continuamente sin depender del día de la semana</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCycleLength(Math.max(1, cycleLength - 1))}
                                        className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center text-lg font-bold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                                    >−</button>
                                    <div className="w-12 text-center">
                                        <span className="text-2xl font-black text-foreground">{cycleLength}</span>
                                        <p className="text-[9px] text-muted-foreground uppercase tracking-widest">días</p>
                                    </div>
                                    <button
                                        onClick={() => setCycleLength(Math.min(14, cycleLength + 1))}
                                        className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center text-lg font-bold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                                    >+</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Duración (solo en modo semanal) */}
                    {programStructureType === 'weekly' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                                    <Repeat className="w-3.5 h-3.5" />
                                    Tipo de Duración
                                </label>
                                <Select value={durationType} onValueChange={v => setDurationType(v as any)}>
                                    <SelectTrigger className="h-12 rounded-xl bg-background border-border font-bold text-xs uppercase tracking-widest">
                                        <SelectValue>
                                            {DURATION_LABELS[durationType] ?? durationType}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-border bg-background text-foreground">
                                        <SelectItem value="weeks" className="text-xs font-bold uppercase tracking-widest">Semanas</SelectItem>
                                        <SelectItem value="async" className="text-xs font-bold uppercase tracking-widest">Ciclos Asíncronos</SelectItem>
                                        <SelectItem value="calendar_days" className="text-xs font-bold uppercase tracking-widest">Días Fijos</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {durationType === 'weeks' && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Cant. Semanas</label>
                                    <ClampedIntInput
                                        value={weeksToRepeat}
                                        onValueChange={setWeeksToRepeat}
                                        min={1}
                                        max={12}
                                        className="h-12 bg-background border-border font-bold text-xs text-center"
                                    />
                                </div>
                            )}
                            {(durationType === 'async' || durationType === 'calendar_days') && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Total Días</label>
                                    <OptionalClampedIntInput
                                        value={durationDays}
                                        onValueChange={setDurationDays}
                                        min={1}
                                        max={730}
                                        placeholder="Ej: 10"
                                        className="h-12 bg-background border-border font-bold text-xs text-center"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <div className="space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer w-max group">
                            <input 
                                type="checkbox" 
                                checked={startDateFlexible}
                                onChange={e => setStartDateFlexible(e.target.checked)}
                                className="rounded border-border accent-primary h-4 w-4"
                            />
                            <span className="text-sm font-medium group-hover:text-foreground text-muted-foreground transition-colors">
                                Inicio Flexible (El cliente decide cuándo arranca)
                            </span>
                        </label>
                        {!startDateFlexible && (
                            <div className="flex items-center gap-4">
                                <div className="relative flex-1">
                                    <Input 
                                        type="date"
                                        value={startDate}
                                        onChange={e => setStartDate(e.target.value)}
                                        className="h-12 bg-background border-border text-foreground font-bold text-sm w-full font-sans"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Notas y Reglas del Programa</label>
                        <textarea 
                            className="w-full h-[88px] p-4 text-sm rounded-xl bg-background border border-border text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none resize-none placeholder:text-muted-foreground"
                            value={programNotes}
                            onChange={e => setProgramNotes(e.target.value)}
                            placeholder="Reglas del macrociclo, RIR general, consideraciones..."
                        />
                    </div>
                </div>
            </div>

            {/* Fases del macrociclo (metadata visual) — ancho completo */}
            <div className="space-y-3 border-t border-border pt-6 mt-4 px-0">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                        Fases del programa (Volumen → Fuerza → etc.)
                    </label>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-[10px] font-bold uppercase tracking-widest"
                        onClick={() => {
                            const i = programPhases.length
                            setProgramPhases([
                                ...programPhases,
                                { name: `Fase ${i + 1}`, weeks: 4, color: PHASE_COLORS[i % PHASE_COLORS.length] },
                            ])
                        }}
                    >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Añadir fase
                    </Button>
                </div>
                <p className="text-[10px] text-muted-foreground -mt-1">
                    Solo referencia visual en el encabezado; no cambia ejercicios automáticamente.
                </p>
                <div className="space-y-2">
                    {programPhases.map((phase, index) => (
                        <div
                            key={index}
                            className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-background border border-border"
                        >
                            <input
                                type="color"
                                value={phase.color?.startsWith('#') ? phase.color : '#6366F1'}
                                onChange={e => {
                                    const next = [...programPhases]
                                    next[index] = { ...next[index], color: e.target.value }
                                    setProgramPhases(next)
                                }}
                                className="w-9 h-9 rounded-lg border border-border cursor-pointer shrink-0 p-0.5 bg-transparent"
                                title="Color en timeline"
                            />
                            <Input
                                value={phase.name}
                                onChange={e => {
                                    const next = [...programPhases]
                                    next[index] = { ...next[index], name: e.target.value }
                                    setProgramPhases(next)
                                }}
                                placeholder="Nombre de la fase"
                                className="h-9 flex-1 min-w-[120px] text-xs font-bold uppercase tracking-widest"
                            />
                            <div className="flex items-center gap-1">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Sem.</span>
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
                            <div className="flex items-center gap-0.5 shrink-0">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={index === 0}
                                    onClick={() => {
                                        if (index === 0) return
                                        const next = [...programPhases]
                                        ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
                                        setProgramPhases(next)
                                    }}
                                >
                                    <ChevronUp className="w-4 h-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={index >= programPhases.length - 1}
                                    onClick={() => {
                                        if (index >= programPhases.length - 1) return
                                        const next = [...programPhases]
                                        ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
                                        setProgramPhases(next)
                                    }}
                                >
                                    <ChevronDown className="w-4 h-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() => setProgramPhases(programPhases.filter((_, i) => i !== index))}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                    {programPhases.length === 0 && (
                        <p className="text-[10px] text-muted-foreground/60 italic py-2">Sin fases definidas. Usa &quot;Añadir fase&quot; para el timeline.</p>
                    )}
                </div>
            </div>
            
            {/* Botón Contraer */}
            <div className="flex justify-center mt-6 mb-2">
                <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-full px-6 text-xs uppercase tracking-widest font-bold">
                    <ChevronUp className="w-4 h-4 mr-2" />
                    Ocultar Configuración
                </Button>
            </div>
        </div>
    )
}


