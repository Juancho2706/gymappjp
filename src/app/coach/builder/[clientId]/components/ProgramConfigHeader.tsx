'use client'

import { Edit2, Repeat, ChevronDown, ChevronUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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
    onClose: () => void
}

export function ProgramConfigHeader({
    programName, setProgramName,
    durationType, setDurationType,
    weeksToRepeat, setWeeksToRepeat,
    durationDays, setDurationDays,
    startDateFlexible, setStartDateFlexible,
    startDate, setStartDate,
    programNotes, setProgramNotes,
    onClose
}: ProgramConfigHeaderProps) {
    return (
        <div className="max-w-7xl mx-auto px-4 py-6 bg-muted/30 border-t border-border shadow-inner max-h-[50vh] overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
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
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Tipo de Duración</label>
                            <div className="relative">
                                <Repeat className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <select 
                                    value={durationType}
                                    onChange={e => setDurationType(e.target.value as any)}
                                    className="w-full h-12 pl-10 pr-8 rounded-xl bg-background border border-border text-foreground font-bold text-xs uppercase tracking-widest outline-none appearance-none"
                                >
                                    <option value="weeks">Semanas</option>
                                    <option value="async">Ciclos Asíncronos</option>
                                    <option value="calendar_days">Días Fijos</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            </div>
                        </div>

                        {durationType === 'weeks' && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Cant. Semanas</label>
                                <Input 
                                    type="number"
                                    value={weeksToRepeat}
                                    onChange={e => setWeeksToRepeat(parseInt(e.target.value) || 1)}
                                    className="h-12 bg-background border-border font-bold text-xs text-center"
                                    min={1} max={12}
                                />
                            </div>
                        )}
                        {(durationType === 'async' || durationType === 'calendar_days') && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Total Días</label>
                                <Input 
                                    type="number"
                                    value={durationDays || ''}
                                    onChange={e => setDurationDays(parseInt(e.target.value) || null)}
                                    placeholder="Ej: 10"
                                    className="h-12 bg-background border-border font-bold text-xs text-center"
                                />
                            </div>
                        )}
                    </div>
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
