'use client'

import { CheckCircle2, Circle, ChevronRight, Building2, Users, UserCheck, Palette, Rocket } from 'lucide-react'
import { useDemoActions } from '../../_providers/DemoStateProvider'

const STEPS = [
    {
        id: 1,
        icon: Building2,
        title: 'Datos de la organización',
        description: 'Nombre legal, RUT, dirección y email de contacto.',
        completed: true,
    },
    {
        id: 2,
        icon: Palette,
        title: 'Marca y white-label',
        description: 'Logo, color primario y mensaje de bienvenida para tus alumnos.',
        completed: true,
    },
    {
        id: 3,
        icon: Users,
        title: 'Coaches activos',
        description: 'Invita a tus kinesiológos y entrenadores a la plataforma.',
        completed: true,
        note: '8 coaches configurados',
    },
    {
        id: 4,
        icon: UserCheck,
        title: 'Primeros clientes',
        description: 'Importa tu lista de alumnos (Excel/CSV) o agrégalos manualmente.',
        completed: false,
        active: true,
    },
    {
        id: 5,
        icon: Rocket,
        title: '¡Lanzar Movida en EVA!',
        description: 'Tu gym ya está digitalizado. Tus alumnos recibirán el link de descarga.',
        completed: false,
    },
]

export default function OnboardingPage() {
    const actions = useDemoActions()
    const completedCount = STEPS.filter(s => s.completed).length

    return (
        <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="text-xl font-bold">Onboarding Movida</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Configuración inicial de tu gym en EVA</p>
            </div>

            {/* Progress bar */}
            <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Progreso</span>
                    <span className="text-sm font-bold" style={{ color: '#0D9488' }}>{completedCount}/{STEPS.length} pasos</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(completedCount / STEPS.length) * 100}%`, backgroundColor: '#0D9488' }}
                    />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                    {completedCount === STEPS.length ? '¡Listo para lanzar!' : `Paso ${completedCount + 1} pendiente`}
                </p>
            </div>

            {/* Steps */}
            <div className="space-y-3">
                {STEPS.map((step, idx) => {
                    const Icon = step.icon
                    return (
                        <div
                            key={step.id}
                            className={`rounded-xl border p-4 transition-all ${
                                step.active
                                    ? 'border-teal-500/30 bg-teal-500/5'
                                    : step.completed
                                        ? 'border-border bg-card'
                                        : 'border-border bg-card opacity-60'
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                    step.completed ? 'bg-teal-500/15' : step.active ? 'bg-teal-500/10' : 'bg-muted'
                                }`}>
                                    {step.completed
                                        ? <CheckCircle2 className="w-4 h-4 text-teal-500" />
                                        : <Circle className={`w-4 h-4 ${step.active ? 'text-teal-500' : 'text-muted-foreground'}`} />
                                    }
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold">{step.title}</p>
                                        {step.completed && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/10 text-teal-500 font-medium">Completado</span>
                                        )}
                                        {step.active && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-medium">En progreso</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                                    {step.note && <p className="text-xs text-teal-600 dark:text-teal-400 mt-1 font-medium">✓ {step.note}</p>}
                                    {step.active && (
                                        <button
                                            onClick={() => actions.simulateAction('Importando clientes...')}
                                            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-white rounded-lg px-3 py-1.5"
                                            style={{ backgroundColor: '#0D9488' }}
                                        >
                                            Importar desde Excel
                                            <ChevronRight className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                                <Icon className={`w-4 h-4 shrink-0 mt-1 ${step.completed ? 'text-teal-500' : 'text-muted-foreground'}`} />
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">
                    💡 En tu onboarding real, un Customer Success Manager de EVA te acompaña 1-a-1 durante la primera semana.
                    El proceso completo toma <strong>entre 2 y 7 días hábiles</strong> desde la firma del contrato.
                </p>
            </div>
        </div>
    )
}
