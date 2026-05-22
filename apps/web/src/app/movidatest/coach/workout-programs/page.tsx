'use client'

import Link from 'next/link'
import { Plus, Dumbbell, Users, Clock } from 'lucide-react'
import { useDemoActions } from '../../_providers/DemoStateProvider'
import { movidaPrograms } from '../../_mock'

const LEVEL_COLOR: Record<string, string> = {
    'Principiante': 'bg-emerald-500/10 text-emerald-500',
    'Intermedio': 'bg-amber-500/10 text-amber-500',
    'Avanzado': 'bg-red-500/10 text-red-500',
    'Todos los niveles': 'bg-teal-500/10 text-teal-500',
}

const FOCUS_COLOR: Record<string, string> = {
    'Hipertrofia': 'text-violet-500',
    'Rehabilitación': 'text-blue-500',
    'Fuerza': 'text-red-500',
    'Movilidad': 'text-teal-500',
}

export default function WorkoutProgramsPage() {
    const actions = useDemoActions()

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold">Programas</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">{movidaPrograms.length} programas en biblioteca</p>
                </div>
                <button
                    onClick={() => actions.simulateAction('Creando nuevo programa...')}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white"
                    style={{ backgroundColor: '#0D9488' }}
                >
                    <Plus className="w-4 h-4" />
                    Nuevo programa
                </button>
            </div>

            <div className="space-y-3">
                {movidaPrograms.map(prog => (
                    <div key={prog.id} className="rounded-xl border border-border bg-card p-5">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                                <Dumbbell className="w-5 h-5 text-violet-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <h3 className="text-sm font-semibold">{prog.name}</h3>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">{prog.description}</p>
                                    </div>
                                    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${LEVEL_COLOR[prog.level] ?? 'bg-muted text-muted-foreground'}`}>
                                        {prog.level}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 mt-2.5 text-[11px] text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {prog.weeks} semanas · {prog.days_per_week}x/sem
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Users className="w-3 h-3" />
                                        {prog.client_count} alumnos
                                    </div>
                                    <span className={`font-medium ${FOCUS_COLOR[prog.focus] ?? ''}`}>{prog.focus}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                            <Link
                                href={`/movidatest/coach/builder/client-maria-001`}
                                className="text-xs px-3 py-1.5 rounded-lg border border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/5"
                            >
                                Abrir builder
                            </Link>
                            <button
                                onClick={() => actions.simulateAction(`Asignando ${prog.name} a un alumno...`)}
                                className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent"
                            >
                                Asignar a alumno
                            </button>
                            <button
                                onClick={() => actions.simulateAction(`Duplicando ${prog.name}...`)}
                                className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-accent"
                            >
                                Duplicar
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
