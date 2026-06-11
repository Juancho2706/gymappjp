'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Lock } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { ModuleKey } from '@/services/entitlements.service'
import { saveModulesAction } from '../_actions/modules.actions'

const MODULES: { key: ModuleKey; label: string; desc: string }[] = [
    { key: 'cardio', label: 'Cardio / Resistencia', desc: 'Prescripción de cardio por tiempo, ritmo y distancia + zonas de frecuencia cardíaca (estilo TrainingPeaks).' },
    { key: 'movement_assessment', label: 'Evaluación de movimiento', desc: 'Screening de movimiento de ingreso con semáforo de prioridad y evolución.' },
    { key: 'body_composition', label: 'Composición corporal', desc: 'Antropometría ISAK (5 componentes) + bioimpedancia, en pestañas separadas.' },
    { key: 'nutrition_exchanges', label: 'Nutrición por intercambios', desc: 'Planes por porciones/intercambios + PDF de pauta con tu marca.' },
]

export function ModulesForm({
    initial,
    canEdit,
    scope,
}: {
    initial: Record<ModuleKey, boolean>
    canEdit: boolean
    scope: 'team' | 'standalone'
}) {
    const [vals, setVals] = useState<Record<ModuleKey, boolean>>(initial)
    const [isPending, startTransition] = useTransition()

    function toggle(key: ModuleKey, checked: boolean) {
        if (!canEdit) return
        setVals((p) => ({ ...p, [key]: checked }))
    }

    function handleSave() {
        startTransition(async () => {
            const res = await saveModulesAction(vals)
            if (res.success) toast.success('Módulos actualizados', { id: 'modules-saved' })
            else toast.error(res.error ?? 'No se pudo guardar', { id: 'modules-err' })
        })
    }

    return (
        <div className="space-y-4">
            {!canEdit && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                    <Lock className="h-4 w-4 shrink-0" />
                    {scope === 'team'
                        ? 'Solo el owner o co-gestor del equipo gestiona los módulos del pool.'
                        : 'No tienes permiso para editar los módulos.'}
                </div>
            )}

            <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-card">
                {MODULES.map((m) => (
                    <li key={m.key} className="flex items-start justify-between gap-4 p-4">
                        <div className="min-w-0">
                            <p className="font-semibold text-foreground">{m.label}</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{m.desc}</p>
                        </div>
                        <Switch
                            checked={vals[m.key]}
                            onCheckedChange={(checked) => toggle(m.key, checked)}
                            disabled={!canEdit || isPending}
                            aria-label={m.label}
                            className="mt-1 shrink-0"
                        />
                    </li>
                ))}
            </ul>

            <p className="text-xs text-muted-foreground">
                Activar un módulo lo prepara para tu {scope === 'team' ? 'equipo' : 'cuenta'}; sus funciones se habilitan progresivamente.
            </p>

            {canEdit && (
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={isPending}
                    className={cn(
                        'flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg transition-all',
                        'hover:opacity-90 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60'
                    )}
                >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isPending ? 'Guardando...' : 'Guardar cambios'}
                </button>
            )}
        </div>
    )
}
