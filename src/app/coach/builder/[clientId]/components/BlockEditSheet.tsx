'use client'

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { getExerciseHistoryAction } from '../actions'
import type { BuilderBlock } from '../types'

interface ExerciseHistory {
    logged_at: string
    weight_kg: number | null
    reps_done: number | null
    set_number: number
}

interface BlockEditSheetProps {
    block: BuilderBlock | null
    clientId?: string | null
    onClose: () => void
    onUpdate: (block: BuilderBlock) => void
    onChange: (block: BuilderBlock) => void
}

export function BlockEditSheet({ block, clientId, onClose, onUpdate, onChange }: BlockEditSheetProps) {
    const { t } = useTranslation()
    const [history, setHistory] = useState<ExerciseHistory[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)

    useEffect(() => {
        if (!block || !clientId) { setHistory([]); return }
        setLoadingHistory(true)
        getExerciseHistoryAction(clientId, block.exercise_id).then(result => {
            setHistory(result.data || [])
            setLoadingHistory(false)
        })
    }, [block?.exercise_id, clientId])

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

    return (
        <Sheet open={!!block} onOpenChange={onClose}>
            <SheetContent side="right" className="w-[400px] sm:w-[540px] bg-background/95 backdrop-blur-2xl border-l border-border p-0 flex flex-col shadow-2xl">
                <SheetHeader className="px-6 pb-6 pt-[max(1.5rem,env(safe-area-inset-top))] border-b border-border bg-muted/20">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden border border-border shrink-0">
                            {block.gif_url || (block.video_url && !block.video_url.includes('youtube') && !block.video_url.includes('youtu.be')) ? (
                                <img
                                    src={block.gif_url || block.video_url!}
                                    alt={block.exercise_name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <span className="text-primary font-bold text-2xl">
                                    {block.exercise_name.charAt(0)}
                                </span>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <SheetTitle className="text-lg font-display uppercase tracking-widest text-foreground leading-tight">
                                {block.exercise_name}
                            </SheetTitle>
                            <p className="text-xs font-bold uppercase tracking-widest mt-1 text-muted-foreground flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                {block.muscle_group}
                            </p>
                            {/* Historial del cliente */}
                            {clientId && (
                                <div className="mt-2">
                                    {loadingHistory ? (
                                        <span className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Cargando historial...</span>
                                    ) : historyLabel ? (
                                        <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1">
                                            <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-500">Última vez {historyLabel.date}:</span>
                                            <span className="text-[9px] font-bold text-emerald-400">{historyLabel.label}</span>
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
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                                Series
                                <span className="text-red-500">*</span>
                            </label>
                            <Input
                                type="number"
                                value={block.sets || ''}
                                onChange={e => onChange({...block, sets: parseInt(e.target.value) || 0})}
                                placeholder="Ej. 3"
                                className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary text-center"
                                min={1}
                            />
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                                Repeticiones
                                <span className="text-red-500">*</span>
                            </label>
                            <Input
                                value={block.reps}
                                onChange={e => onChange({...block, reps: e.target.value})}
                                placeholder="Ej. 10-12"
                                className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary text-center"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                                Peso Objetivo (kg)
                                <InfoTooltip content={t('tooltip.weight')} />
                            </label>
                            <Input
                                value={block.target_weight_kg || ''}
                                onChange={e => onChange({...block, target_weight_kg: e.target.value})}
                                placeholder="Opcional"
                                className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary placeholder:text-muted-foreground"
                            />
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                                RIR / RPE
                                <InfoTooltip content={t('tooltip.rir')} />
                            </label>
                            <Input
                                value={block.rir || ''}
                                onChange={e => onChange({...block, rir: e.target.value})}
                                placeholder="Ej. RIR 2"
                                className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary placeholder:text-muted-foreground"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                                Tempo
                                <InfoTooltip content={t('tooltip.tempo')} />
                            </label>
                            <Input
                                value={block.tempo || ''}
                                onChange={e => onChange({...block, tempo: e.target.value})}
                                placeholder="Ej. 3-1-X-1"
                                className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary placeholder:text-muted-foreground"
                            />
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                                Recuperación
                                <InfoTooltip content={t('tooltip.rest')} />
                            </label>
                            <Input
                                value={block.rest_time || ''}
                                onChange={e => onChange({...block, rest_time: e.target.value})}
                                placeholder="Ej. 120s"
                                className="h-12 bg-secondary dark:bg-white/5 border-border dark:border-white/10 text-foreground font-bold focus:border-primary placeholder:text-muted-foreground"
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                            Instrucciones de Protocolo
                            <InfoTooltip content={t('tooltip.notes')} />
                        </label>
                        <textarea
                            className="w-full h-32 p-4 text-sm rounded-xl bg-secondary dark:bg-white/5 border border-border dark:border-white/10 text-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none transition-all resize-none placeholder:text-muted-foreground"
                            value={block.notes || ''}
                            onChange={e => onChange({...block, notes: e.target.value})}
                            placeholder="Detalles biomecánicos o notas..."
                        />
                    </div>

                    {/* Auto-progression */}
                    <div className="space-y-3 border border-border dark:border-white/10 rounded-xl p-4 bg-muted/30">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                                Progresión Automática
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

                        {block.progression_type && (
                            <div className="flex items-center gap-3 mt-2">
                                <div className="flex rounded-lg border border-border dark:border-white/10 overflow-hidden text-[10px] font-bold uppercase tracking-widest">
                                    <button
                                        onClick={() => onChange({...block, progression_type: 'weight'})}
                                        className={`px-3 py-1.5 transition-colors ${block.progression_type === 'weight' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                                    >
                                        + Peso
                                    </button>
                                    <button
                                        onClick={() => onChange({...block, progression_type: 'reps'})}
                                        className={`px-3 py-1.5 transition-colors ${block.progression_type === 'reps' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                                    >
                                        + Reps
                                    </button>
                                </div>
                                <div className="flex items-center gap-1.5 flex-1">
                                    <input
                                        type="number"
                                        step={block.progression_type === 'weight' ? 0.5 : 1}
                                        min={0}
                                        value={block.progression_value ?? ''}
                                        onChange={e => onChange({...block, progression_value: parseFloat(e.target.value) || null})}
                                        className="w-20 h-8 text-center text-sm font-bold bg-secondary dark:bg-white/5 border border-border dark:border-white/10 rounded-lg text-foreground focus:border-primary focus:outline-none"
                                        placeholder="2.5"
                                    />
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                                        {block.progression_type === 'weight' ? 'kg/sem' : 'rep/ses'}
                                    </span>
                                </div>
                            </div>
                        )}
                        {!block.progression_type && (
                            <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">
                                Activa para incrementar peso o reps automáticamente cada semana
                            </p>
                        )}
                    </div>

                    <button
                        onClick={() => onUpdate(block)}
                        disabled={!block.sets || block.sets < 1 || !block.reps?.trim()}
                        className="w-full py-4 mt-4 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-xs rounded-xl shadow-[0_0_20px_rgba(var(--theme-primary-rgb,0,122,255),0.4)] hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                        style={{
                            backgroundColor: 'var(--theme-primary, #007AFF)',
                            boxShadow: '0 0 20px -5px var(--theme-primary, rgba(0,122,255,0.4))'
                        }}
                    >
                        {(!block.sets || block.sets < 1 || !block.reps?.trim())
                            ? 'DATA INCOMPLETA'
                            : 'SINCRONIZAR BLOQUE'}
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
