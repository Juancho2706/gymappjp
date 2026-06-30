'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, FileText, ChevronRight, AlertTriangle } from 'lucide-react'
import { getTemplatesForBuilderAction, loadTemplateForBuilderAction } from '../_actions/builder.actions'
import type { DayState, ProgramPhase } from '../types'
import { DAYS_OF_WEEK } from '../hooks/usePlanBuilder'

function parseTemplatePhases(raw: unknown): ProgramPhase[] {
    if (raw == null) return []
    try {
        const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? JSON.parse(raw) : []
        if (!Array.isArray(arr)) return []
        return arr.map((p: any, i: number) => ({
            name: String(p?.name || `Fase ${i + 1}`).slice(0, 80),
            weeks: Math.min(52, Math.max(1, Number(p?.weeks) || 1)),
            color: typeof p?.color === 'string' && p.color.startsWith('#') ? p.color : '#6366F1',
        }))
    } catch {
        return []
    }
}

interface Template {
    id: string
    name: string
    weeks_to_repeat: number
    duration_type: string | null
    plan_count: number
}

interface TemplatePickerDialogProps {
    open: boolean
    onClose: () => void
    hasExistingData: boolean
    onApply: (days: DayState[], programName: string, meta: {
        weeks_to_repeat: number
        duration_type: string
        duration_days: number | null
        program_notes: string
        program_phases: ProgramPhase[]
        appliedTemplateId: string
        // Variante B de una plantilla A/B (semana A/B). Solo presente si la plantilla tiene
        // planes con week_variant === 'B'. Sin esto la variante B se descartaba en silencio
        // (la plantilla A/B se degradaba a semana simple). El handler debe cargarla en builderB.
        daysB?: DayState[]
        // Metadata de estructura del programa — para no degradar plantillas de ciclo/AB a weekly.
        // `ab_mode` se infiere de la presencia de planes B; el resto viaja tal cual venga de la
        // plantilla (forward-compatible: hoy el SELECT del action no trae structure_type/cycle_length).
        ab_mode?: boolean
        program_structure_type?: 'weekly' | 'cycle'
        cycle_length?: number
        start_date_flexible?: boolean
    }) => void
}

export function TemplatePickerDialog({ open, onClose, hasExistingData, onApply }: TemplatePickerDialogProps) {
    const [templates, setTemplates] = useState<Template[]>([])
    const [loading, setLoading] = useState(false)
    const [applying, setApplying] = useState<string | null>(null)
    const [confirmId, setConfirmId] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return
        setLoading(true)
        getTemplatesForBuilderAction().then(result => {
            setTemplates(result.data || [])
            setLoading(false)
        })
    }, [open])

    async function handleApply(templateId: string) {
        if (hasExistingData && confirmId !== templateId) {
            setConfirmId(templateId)
            return
        }
        setApplying(templateId)
        const result = await loadTemplateForBuilderAction(templateId)
        if (result.error || !result.data) {
            setApplying(null)
            return
        }

        const template = result.data
        // Construye los días de una variante (semana A o B) desde los planes de la plantilla.
        const buildVariantDays = (variant: 'A' | 'B'): DayState[] => DAYS_OF_WEEK.map(d => {
            const plan = template.workout_plans?.find(
                (p: any) => p.day_of_week === d.id && String(p.week_variant || 'A') === variant
            )
            return {
                ...d,
                title: plan?.title || '',
                blocks: (plan?.workout_blocks || [])
                    .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
                    .map((b: any) => ({
                        uid: `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        exercise_id: b.exercise_id,
                        exercise_name: b.exercises?.name || 'Desconocido',
                        muscle_group: b.exercises?.muscle_group || '',
                        gif_url: b.exercises?.gif_url ?? undefined,
                        video_url: b.exercises?.video_url ?? undefined,
                        thumbnail_url: b.exercises?.thumbnail_url ?? undefined,
                        sets: b.sets,
                        reps: b.reps,
                        target_weight_kg: b.target_weight_kg?.toString() || '',
                        tempo: b.tempo || '',
                        rir: b.rir || '',
                        rest_time: b.rest_time || '',
                        notes: b.notes || '',
                        superset_group: b.superset_group || null,
                        progression_type: b.progression_type || null,
                        progression_value: b.progression_value ?? null,
                        progression_mode: b.progression_mode ?? null,
                        section: b.section === 'warmup' || b.section === 'cooldown' ? b.section : 'main',
                        section_template_id: b.section_template_id ?? null,
                        is_override: false,
                        // Prescripción polimórfica (cardio/movilidad/roller/unilateral/carga): el query de
                        // plantilla la trae; sin copiarla acá, saveWorkoutProgram la pisaba con null al
                        // guardar (data-loss silencioso de toda la prescripción tipada). Espejo de
                        // mapDbBlockToBuilderBlock (round-trip canónico).
                        exercise_type: b.exercises?.exercise_type ?? null,
                        exercise_type_override: b.exercise_type_override ?? null,
                        side_mode: b.side_mode ?? null,
                        reps_value: b.reps_value ?? null,
                        reps_unit: b.reps_unit ?? null,
                        load_type: b.load_type ?? null,
                        load_value: b.load_value != null ? String(b.load_value) : '',
                        load_unit: b.load_unit ?? null,
                        distance_value: b.distance_value != null ? String(b.distance_value) : '',
                        distance_unit: b.distance_unit ?? null,
                        duration_sec: b.duration_sec ?? null,
                        target_pace_sec_per_km: b.target_pace_sec_per_km ?? null,
                        hr_zone: b.hr_zone ?? null,
                        instructions: b.instructions || '',
                        interval_config: b.interval_config ?? null,
                    })),
            }
        })

        const days = buildVariantDays('A')
        // La plantilla es A/B si tiene al menos un plan con week_variant === 'B'.
        const hasBPlans = (template.workout_plans || []).some(
            (p: any) => String(p.week_variant || 'A') === 'B'
        )
        const daysB = hasBPlans ? buildVariantDays('B') : undefined

        onApply(days, template.name, {
            weeks_to_repeat: template.weeks_to_repeat,
            duration_type: template.duration_type || 'weeks',
            duration_days: template.duration_days ?? null,
            program_notes: template.program_notes || '',
            program_phases: parseTemplatePhases(template.program_phases),
            appliedTemplateId: templateId,
            daysB,
            ab_mode: hasBPlans || !!template.ab_mode,
            // `program_structure_type`/`cycle_length` hoy NO los trae el SELECT del action
            // (loadTemplateForBuilderAction) → llegan undefined. Se pasan tal cual para ser
            // forward-compatible cuando el SELECT se extienda (ver deferred). `?? undefined`
            // mantiene el contrato (no fuerza weekly/7 si la plantilla los define).
            program_structure_type: template.program_structure_type ?? undefined,
            cycle_length: template.cycle_length ?? undefined,
            start_date_flexible: template.start_date_flexible ?? undefined,
        })
        setApplying(null)
        setConfirmId(null)
        onClose()
    }

    function durationLabel(t: Template) {
        if (t.duration_type === 'calendar_days') return `${t.weeks_to_repeat * 7} días`
        if (t.duration_type === 'async') return 'Ciclo asíncrono'
        return `${t.weeks_to_repeat} semana${t.weeks_to_repeat !== 1 ? 's' : ''}`
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg bg-background/95 backdrop-blur-2xl border border-border shadow-2xl overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="text-sm font-display uppercase tracking-[0.2em] text-foreground">
                        Biblioteca de Plantillas
                    </DialogTitle>
                </DialogHeader>

                <div className="mt-2 max-h-[60vh] overflow-y-auto space-y-2 pr-1">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : templates.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p className="text-xs font-bold uppercase tracking-widest opacity-50">Sin plantillas guardadas</p>
                            <p className="text-[10px] mt-1 opacity-30">Guarda un programa sin cliente para crear una plantilla</p>
                        </div>
                    ) : (
                        templates.map(tpl => (
                            <div
                                key={tpl.id}
                                className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 hover:border-primary/30 transition-all group"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-xs uppercase tracking-widest text-foreground truncate group-hover:text-primary transition-colors">
                                        {tpl.name}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                                            {durationLabel(tpl)}
                                        </span>
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                                            {tpl.plan_count} día{tpl.plan_count !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                </div>

                                {confirmId === tpl.id ? (
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1 text-[9px] font-bold text-orange-500 uppercase">
                                            <AlertTriangle className="w-3 h-3" />
                                            ¿Reemplazar?
                                        </div>
                                        <Button
                                            size="sm"
                                            onClick={() => handleApply(tpl.id)}
                                            disabled={applying === tpl.id}
                                            className="h-7 px-3 text-[9px] font-bold uppercase tracking-widest"
                                            style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
                                        >
                                            {applying === tpl.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Sí'}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setConfirmId(null)}
                                            className="h-7 px-3 text-[9px] font-bold uppercase tracking-widest"
                                        >
                                            No
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleApply(tpl.id)}
                                        disabled={applying === tpl.id}
                                        className="h-8 px-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary gap-1"
                                    >
                                        {applying === tpl.id ? <Loader2 className="w-3 h-3 animate-spin" /> : (
                                            <>Aplicar <ChevronRight className="w-3 h-3" /></>
                                        )}
                                    </Button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
