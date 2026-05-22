'use client'

import { use } from 'react'
import Link from 'next/link'
import { ChevronLeft, Dumbbell, Apple, Scale, Phone, Mail, MapPin, Calendar, TrendingDown } from 'lucide-react'
import { useDemoState } from '../../../_providers/DemoStateProvider'
import { mariaCheckIns, mariaWorkoutHistory, mariaPRs } from '../../../_mock'

export default function ClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
    const { clientId } = use(params)
    const { clients } = useDemoState()
    const client = clients.find(c => c.id === clientId)

    if (!client) {
        return (
            <div className="p-6 text-center text-muted-foreground">
                <p>Cliente no encontrado.</p>
                <Link href="/movidatest/coach/clients" className="text-teal-500 text-sm hover:underline mt-2 inline-block">← Volver</Link>
            </div>
        )
    }

    const isMaria = clientId === 'client-maria-001'

    return (
        <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
            <div className="flex items-center gap-2">
                <Link href="/movidatest/coach/clients" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent">
                    <ChevronLeft className="w-5 h-5" />
                </Link>
                <h1 className="text-lg font-bold">Detalle alumno</h1>
            </div>

            {/* Header card */}
            <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start gap-4">
                    <div
                        className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0"
                        style={{ backgroundColor: '#0D9488' }}
                    >
                        {client.avatar_initials}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-bold">{client.full_name}</h2>
                        <p className="text-sm text-muted-foreground">{client.age} años · {client.city}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400">{client.condition}</span>
                            {client.program_name && <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500">{client.program_name}</span>}
                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${client.is_active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                                {client.is_active ? 'Activo' : 'Inactivo'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-xs truncate">{client.phone ?? '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-xs truncate">{client.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-xs">{client.city}</span>
                    </div>
                </div>
            </div>

            {/* Goal & weight */}
            {client.weight_kg && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Scale className="w-4 h-4 text-teal-500" />
                        Composición corporal
                    </h3>
                    <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                            <p className="text-xl font-bold">{client.weight_kg} kg</p>
                            <p className="text-xs text-muted-foreground">Peso actual</p>
                        </div>
                        <div>
                            <p className="text-xl font-bold text-teal-500">{client.goal_weight_kg} kg</p>
                            <p className="text-xs text-muted-foreground">Objetivo</p>
                        </div>
                        <div>
                            <p className="text-xl font-bold flex items-center justify-center gap-1">
                                <TrendingDown className="w-4 h-4 text-emerald-500" />
                                {client.weight_kg - (client.goal_weight_kg ?? client.weight_kg)} kg
                            </p>
                            <p className="text-xs text-muted-foreground">Por bajar</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Goal */}
            <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-1">Objetivo</p>
                <p className="text-sm">{client.goal}</p>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-3">
                <Link
                    href={`/movidatest/coach/builder/${client.id}`}
                    className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 hover:bg-accent transition-colors"
                >
                    <Dumbbell className="w-5 h-5 text-violet-500" />
                    <span className="text-xs font-medium">Abrir Builder</span>
                    <span className="text-[10px] text-muted-foreground">Editar rutina</span>
                </Link>
                <Link
                    href={`/movidatest/coach/nutrition-plans`}
                    className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 hover:bg-accent transition-colors"
                >
                    <Apple className="w-5 h-5 text-emerald-500" />
                    <span className="text-xs font-medium">Nutrición</span>
                    <span className="text-[10px] text-muted-foreground">Ver plan nutricional</span>
                </Link>
            </div>

            {/* Check-ins (María only) */}
            {isMaria && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-500" />
                        Check-ins recientes
                    </h3>
                    <div className="space-y-2">
                        {mariaCheckIns.slice(0, 4).map(ci => (
                            <div key={ci.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                                <div>
                                    <p className="text-xs font-medium">{new Date(ci.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</p>
                                    <p className="text-[11px] text-muted-foreground line-clamp-1">{ci.notes}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold">{ci.weight_kg} kg</p>
                                    <div className="flex gap-0.5 justify-end">
                                        {Array.from({ length: 5 }, (_, i) => (
                                            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < ci.energy_level ? 'bg-teal-500' : 'bg-muted'}`} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* PRs (María only) */}
            {isMaria && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold mb-3">Records personales</h3>
                    <div className="grid grid-cols-2 gap-2">
                        {mariaPRs.map(pr => (
                            <div key={pr.exercise_name} className="rounded-lg bg-muted p-2.5">
                                <p className="text-[10px] text-muted-foreground">{pr.exercise_name}</p>
                                <p className="text-sm font-bold">{pr.value}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Workout history (María only) */}
            {isMaria && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold mb-3">Últimas sesiones</h3>
                    <div className="space-y-2">
                        {mariaWorkoutHistory.slice(0, 5).map(log => (
                            <div key={log.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                                <div>
                                    <p className="text-xs font-medium">{log.plan_name}</p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {new Date(log.completed_at).toLocaleDateString('es-CL')} · {log.duration_minutes} min
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-medium">{(log.total_volume_kg / 1000).toFixed(1)}T</p>
                                    <p className="text-[10px] text-muted-foreground">{log.sets_count} series</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
