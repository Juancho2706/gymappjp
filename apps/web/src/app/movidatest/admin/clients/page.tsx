'use client'

import { useState } from 'react'
import { Search, UserPlus, CheckCircle2, XCircle } from 'lucide-react'
import { useDemoState, useDemoActions } from '../../_providers/DemoStateProvider'

type Tab = 'all' | 'unassigned' | 'inactive'

export default function ClientsPage() {
    const { clients, coaches, stats } = useDemoState()
    const actions = useDemoActions()
    const [search, setSearch] = useState('')
    const [tab, setTab] = useState<Tab>('all')
    const [showAddForm, setShowAddForm] = useState(false)
    const [newClientName, setNewClientName] = useState('')
    const [newClientEmail, setNewClientEmail] = useState('')

    const filtered = clients
        .filter(c => {
            if (tab === 'unassigned') return !c.coach_id
            if (tab === 'inactive') return !c.is_active
            return true
        })
        .filter(c => {
            if (!search) return true
            const q = search.toLowerCase()
            return c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
        })

    const unassignedCount = clients.filter(c => !c.coach_id).length

    function handleAddClient(e: React.FormEvent) {
        e.preventDefault()
        actions.simulateAction(`Cliente ${newClientName} agregado`)
        setNewClientName('')
        setNewClientEmail('')
        setShowAddForm(false)
    }

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold">Clientes</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Pool total: {stats.totalClients} · Activos: {stats.activeClients}
                    </p>
                </div>
                <button
                    onClick={() => setShowAddForm(v => !v)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white"
                    style={{ backgroundColor: '#0D9488' }}
                >
                    <UserPlus className="w-4 h-4" />
                    Agregar cliente
                </button>
            </div>

            {showAddForm && (
                <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-4">
                    <h3 className="text-sm font-semibold mb-3">Agregar nuevo cliente</h3>
                    <form onSubmit={handleAddClient} className="space-y-2">
                        <input
                            placeholder="Nombre completo"
                            value={newClientName}
                            onChange={e => setNewClientName(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                        />
                        <input
                            type="email"
                            placeholder="email@alumno.cl"
                            value={newClientEmail}
                            onChange={e => setNewClientEmail(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                        />
                        <div className="flex gap-2">
                            <button type="submit" className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: '#0D9488' }}>
                                Agregar
                            </button>
                            <button type="button" onClick={() => setShowAddForm(false)} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent">
                                Cancelar
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border">
                {(['all', 'unassigned', 'inactive'] as Tab[]).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                            tab === t ? 'border-teal-500 text-teal-600 dark:text-teal-400' : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {t === 'all' ? `Todos (${clients.length})` : t === 'unassigned' ? `Sin asignar (${unassignedCount})` : 'Inactivos'}
                    </button>
                ))}
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                    placeholder="Buscar por nombre o email..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
            </div>

            {/* List */}
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {filtered.slice(0, 50).map(client => {
                    const assignedCoach = coaches.find(c => c.id === client.coach_id)
                    return (
                        <div key={client.id} className="flex items-center gap-3 p-3">
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                style={{ backgroundColor: '#0D9488' }}
                            >
                                {client.avatar_initials}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-medium truncate">{client.full_name}</p>
                                    {client.is_active
                                        ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                        : <XCircle className="w-3 h-3 text-muted-foreground shrink-0" />
                                    }
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate">{client.email}</p>
                                <p className="text-[11px] text-muted-foreground">{client.condition} · {client.city}</p>
                            </div>
                            <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                                {assignedCoach ? (
                                    <span className="text-[11px] text-muted-foreground">{assignedCoach.full_name.split(' ')[0]}</span>
                                ) : (
                                    <select
                                        defaultValue=""
                                        onChange={e => {
                                            if (!e.target.value) return
                                            const coach = coaches.find(c => c.id === e.target.value)
                                            actions.assignClient(client.id, e.target.value, coach?.full_name ?? '')
                                        }}
                                        className="text-[11px] border border-border rounded-md px-1.5 py-0.5 bg-background text-muted-foreground"
                                    >
                                        <option value="">Sin asignar</option>
                                        {coaches.filter(c => c.status === 'active').map(c => (
                                            <option key={c.id} value={c.id}>{c.full_name.split(' ')[0]}</option>
                                        ))}
                                    </select>
                                )}
                                <span className="text-[10px] text-muted-foreground">
                                    {new Date(client.created_at).toLocaleDateString('es-CL')}
                                </span>
                            </div>
                        </div>
                    )
                })}
                {filtered.length === 0 && (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                        Sin resultados para &quot;{search}&quot;
                    </div>
                )}
            </div>
            {filtered.length > 50 && (
                <p className="text-xs text-center text-muted-foreground">Mostrando 50 de {filtered.length} clientes</p>
            )}
        </div>
    )
}
