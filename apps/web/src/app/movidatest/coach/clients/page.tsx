'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Search, CheckCircle2, XCircle, ChevronRight, Activity } from 'lucide-react'
import { useDemoState } from '../../_providers/DemoStateProvider'
import { felipeCoach } from '../../_mock'

export default function CoachClientsPage() {
    const { clients } = useDemoState()
    const [search, setSearch] = useState('')

    const myClients = clients
        .filter(c => c.coach_id === felipeCoach.id)
        .filter(c => {
            if (!search) return true
            const q = search.toLowerCase()
            return c.full_name.toLowerCase().includes(q) || c.condition.toLowerCase().includes(q)
        })

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
            <div>
                <h1 className="text-xl font-bold">Mis alumnos</h1>
                <p className="text-sm text-muted-foreground mt-0.5">{myClients.length} asignados</p>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                    placeholder="Buscar alumno o condición..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
            </div>

            <div className="grid gap-2">
                {myClients.map(client => (
                    <Link
                        key={client.id}
                        href={`/movidatest/coach/clients/${client.id}`}
                        className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:bg-accent transition-colors"
                    >
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                            style={{ backgroundColor: '#0D9488' }}
                        >
                            {client.avatar_initials}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate">{client.full_name}</p>
                                <span className="text-[10px] text-muted-foreground">{client.age} años</span>
                                {client.is_active
                                    ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                    : <XCircle className="w-3 h-3 text-muted-foreground shrink-0" />
                                }
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{client.condition}</p>
                            <p className="text-xs text-muted-foreground truncate">{client.goal}</p>
                            {client.program_name && (
                                <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400">
                                    {client.program_name}
                                </span>
                            )}
                        </div>
                        <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                            {client.last_activity ? (
                                <div className="flex items-center gap-1 text-[11px] text-emerald-500">
                                    <Activity className="w-3 h-3" />
                                    Activo
                                </div>
                            ) : (
                                <span className="text-[11px] text-muted-foreground">Sin actividad</span>
                            )}
                            <span className="text-[10px] text-muted-foreground">{client.city}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    </Link>
                ))}
            </div>
            {myClients.length === 0 && (
                <div className="text-center py-10 text-sm text-muted-foreground">Sin resultados para &quot;{search}&quot;</div>
            )}
        </div>
    )
}
