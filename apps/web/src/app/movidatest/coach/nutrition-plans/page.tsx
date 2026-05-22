'use client'

import { useState } from 'react'
import { Plus, Apple, Users, BarChart3 } from 'lucide-react'
import { useDemoActions } from '../../_providers/DemoStateProvider'
import { felipeNutritionTemplates, mariaClient } from '../../_mock'

export default function NutritionPlansPage() {
    const actions = useDemoActions()
    const [showNewTemplate, setShowNewTemplate] = useState(false)
    const [templateName, setTemplateName] = useState('')

    function handleCreateTemplate(e: React.FormEvent) {
        e.preventDefault()
        actions.simulateAction(`Plantilla "${templateName}" creada`)
        setTemplateName('')
        setShowNewTemplate(false)
    }

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold">Nutrición</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Plantillas y planes de alumnos</p>
                </div>
                <button
                    onClick={() => setShowNewTemplate(v => !v)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white"
                    style={{ backgroundColor: '#0D9488' }}
                >
                    <Plus className="w-4 h-4" />
                    Nueva plantilla
                </button>
            </div>

            {showNewTemplate && (
                <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-4">
                    <h3 className="text-sm font-semibold mb-3">Nueva plantilla nutricional</h3>
                    <form onSubmit={handleCreateTemplate} className="flex gap-2">
                        <input
                            placeholder="Nombre de la plantilla"
                            value={templateName}
                            onChange={e => setTemplateName(e.target.value)}
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                        />
                        <button type="submit" className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: '#0D9488' }}>Crear</button>
                        <button type="button" onClick={() => setShowNewTemplate(false)} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent">Cancelar</button>
                    </form>
                </div>
            )}

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-2xl font-bold">{felipeNutritionTemplates.length}</p>
                    <p className="text-xs text-muted-foreground">Plantillas</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-2xl font-bold">24</p>
                    <p className="text-xs text-muted-foreground">Alumnos con plan</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-2xl font-bold text-teal-500">92%</p>
                    <p className="text-xs text-muted-foreground">Adherencia media</p>
                </div>
            </div>

            {/* Template list */}
            <div>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Plantillas</h2>
                <div className="space-y-3">
                    {felipeNutritionTemplates.map(tmpl => (
                        <div key={tmpl.id} className="rounded-xl border border-border bg-card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                                        <Apple className="w-4 h-4 text-emerald-500" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold">{tmpl.name}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{tmpl.description}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                                    <Users className="w-3 h-3" />
                                    {tmpl.clients_using}
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                                <div className="rounded-lg bg-muted p-2">
                                    <p className="text-sm font-bold">{tmpl.calories}</p>
                                    <p className="text-[10px] text-muted-foreground">kcal</p>
                                </div>
                                <div className="rounded-lg bg-muted p-2">
                                    <p className="text-sm font-bold text-blue-500">{tmpl.protein_g}g</p>
                                    <p className="text-[10px] text-muted-foreground">proteína</p>
                                </div>
                                <div className="rounded-lg bg-muted p-2">
                                    <p className="text-sm font-bold text-amber-500">{tmpl.carbs_g}g</p>
                                    <p className="text-[10px] text-muted-foreground">carbs</p>
                                </div>
                                <div className="rounded-lg bg-muted p-2">
                                    <p className="text-sm font-bold text-emerald-500">{tmpl.fat_g}g</p>
                                    <p className="text-[10px] text-muted-foreground">grasas</p>
                                </div>
                            </div>
                            <div className="mt-3 flex gap-2">
                                <button
                                    onClick={() => actions.simulateAction(`Asignando "${tmpl.name}" a un alumno...`)}
                                    className="text-xs px-3 py-1.5 rounded-lg border border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/5"
                                >
                                    Asignar a alumno
                                </button>
                                <button
                                    onClick={() => actions.simulateAction(`Editando "${tmpl.name}"...`)}
                                    className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent"
                                >
                                    Editar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Active plan for María */}
            <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-violet-500" />
                    Plan activo — {mariaClient.full_name}
                </h2>
                <p className="text-xs text-muted-foreground mb-3">
                    Plan de Definición 1800 kcal · Semana 6 · Adherencia esta semana: <strong>89%</strong>
                </p>
                <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                        { label: 'kcal', value: '1.700/1.800', color: '' },
                        { label: 'Proteína', value: '128g', color: 'text-blue-500' },
                        { label: 'Carbs', value: '188g', color: 'text-amber-500' },
                        { label: 'Grasas', value: '48g', color: 'text-emerald-500' },
                    ].map(m => (
                        <div key={m.label} className="rounded-lg bg-muted p-2.5">
                            <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                            <p className="text-[10px] text-muted-foreground">{m.label}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
