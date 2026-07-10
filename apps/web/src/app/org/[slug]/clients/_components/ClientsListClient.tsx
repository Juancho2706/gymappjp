'use client'

import { useState, useTransition } from 'react'
import {
    Archive,
    CheckCircle2,
    CheckSquare2,
    ChevronDown,
    ExternalLink,
    Loader2,
    RefreshCw,
    Square,
    UserX,
    Users,
    X,
} from 'lucide-react'
import { AssignClientSelect } from './AssignClientSelect'
import { ClientDetailSheet } from './ClientDetailSheet'
import { OrgEmptyState } from '../../_components/OrgEmptyState'
import { bulkAssignSelectedClientsAction, bulkArchiveClientsAction, bulkReactivateClientsAction } from '../../_actions/org.actions'

export type ClientDisplayRow = {
    id: string
    name: string | null
    email: string | null
    phone: string | null
    isActive: boolean
    coachId: string | null
    coachName: string | null
    paymentStatus: string | null
    riskCount: number
}

export type ActiveCoachOption = {
    id: string
    name: string
    slug: string | null
}

interface Props {
    orgSlug: string
    clients: ClientDisplayRow[]
    coaches: ActiveCoachOption[]
    isAdmin: boolean
}

function initials(name: string | null | undefined) {
    return (name?.trim()?.charAt(0) || '?').toUpperCase()
}

function paymentTone(status: string | null) {
    if (status === 'paid') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
    if (status === 'overdue') return 'border-red-400/30 bg-red-400/10 text-red-400'
    if (status === 'pending') return 'border-amber-400/30 bg-amber-400/10 text-amber-300'
    return 'border-zinc-700 bg-zinc-900 text-zinc-400'
}

function paymentLabel(status: string | null) {
    if (status === 'paid') return 'Pagado'
    if (status === 'overdue') return 'Vencido'
    if (status === 'pending') return 'Pendiente'
    return 'Sin registro'
}

export function ClientsListClient({ orgSlug, clients, coaches, isAdmin }: Props) {
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [showCoachPicker, setShowCoachPicker] = useState(false)
    const [confirmArchive, setConfirmArchive] = useState(false)
    const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
    const [detailClient, setDetailClient] = useState<ClientDisplayRow | null>(null)
    const [pending, startTransition] = useTransition()

    const allSelected = selected.size === clients.length && clients.length > 0
    const someSelected = selected.size > 0

    function toggleAll() {
        setSelected(allSelected ? new Set() : new Set(clients.map(c => c.id)))
    }
    function toggleOne(id: string) {
        setSelected(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }
    function clearSelection() {
        setSelected(new Set())
        setShowCoachPicker(false)
        setConfirmArchive(false)
    }

    function showToast(ok: boolean, msg: string) {
        setToast({ ok, msg })
        setTimeout(() => setToast(null), 4000)
    }

    function handleAssign(coachId: string) {
        setShowCoachPicker(false)
        startTransition(async () => {
            const res = await bulkAssignSelectedClientsAction(orgSlug, [...selected], coachId)
            if (res.error) showToast(false, res.error)
            else { showToast(true, `${res.count} alumno${res.count === 1 ? '' : 's'} asignado${res.count === 1 ? '' : 's'}.`); clearSelection() }
        })
    }

    function handleArchive() {
        setConfirmArchive(false)
        startTransition(async () => {
            const res = await bulkArchiveClientsAction(orgSlug, [...selected])
            if (res.error) showToast(false, res.error)
            else { showToast(true, `${res.count} alumno${res.count === 1 ? '' : 's'} archivado${res.count === 1 ? '' : 's'}.`); clearSelection() }
        })
    }

    function handleReactivate() {
        startTransition(async () => {
            const res = await bulkReactivateClientsAction(orgSlug, [...selected])
            if (res.error) showToast(false, res.error)
            else { showToast(true, `${res.count} alumno${res.count === 1 ? '' : 's'} reactivado${res.count === 1 ? '' : 's'}.`); clearSelection() }
        })
    }

    if (clients.length === 0) {
        return (
            <div className="mt-5">
                <OrgEmptyState
                    icon={Users}
                    tone="amber"
                    headline="Sin alumnos en esta vista"
                    description="Agrega alumnos manualmente, importa un CSV, o ajusta el filtro activo para ver otros estados."
                    cta={isAdmin ? { label: 'Agregar alumno', href: `/org/${orgSlug}/clients` } : undefined}
                />
            </div>
        )
    }

    return (
        <>
            <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
                {/* Select-all header */}
                {isAdmin && (
                    <div className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900/60 px-4 py-2">
                        <button
                            onClick={toggleAll}
                            className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors"
                            aria-label={allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                        >
                            {allSelected
                                ? <CheckSquare2 className="h-4 w-4 text-amber-300" />
                                : <Square className="h-4 w-4" />}
                            <span className="hidden sm:inline">
                                {allSelected ? 'Deseleccionar todos' : `Seleccionar todos (${clients.length})`}
                            </span>
                        </button>
                        {someSelected && (
                            <span className="ml-auto text-xs font-bold text-amber-300">
                                {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
                            </span>
                        )}
                    </div>
                )}

                {/* Rows */}
                {clients.map(client => (
                    <div
                        key={client.id}
                        onClick={e => {
                            // Open detail sheet if not clicking checkbox or action buttons
                            if ((e.target as HTMLElement).closest('button,a,select')) return
                            setDetailClient(client)
                        }}
                        className={`flex items-center gap-3 border-b border-zinc-800 bg-zinc-950/50 p-3 last:border-b-0 xl:grid xl:gap-4 xl:grid-cols-[auto_1fr_180px_150px_180px] xl:items-center xl:p-4 transition-colors cursor-pointer hover:bg-zinc-900/60 ${
                            selected.has(client.id) ? 'bg-amber-400/5' : ''
                        }`}
                    >
                        {/* Checkbox */}
                        {isAdmin && (
                            <button
                                onClick={() => toggleOne(client.id)}
                                className="shrink-0 flex items-center justify-center"
                                style={{ minWidth: 36, minHeight: 36 }}
                                aria-label={selected.has(client.id) ? `Deseleccionar ${client.name}` : `Seleccionar ${client.name}`}
                            >
                                {selected.has(client.id)
                                    ? <CheckSquare2 className="h-4 w-4 text-amber-300" />
                                    : <Square className="h-4 w-4 text-zinc-500 hover:text-zinc-400 transition-colors" />}
                            </button>
                        )}

                        {/* Name + mobile secondary */}
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black xl:h-11 xl:w-11 ${
                                !client.isActive
                                    ? 'bg-zinc-800 text-zinc-500'
                                    : client.riskCount > 0
                                        ? 'bg-amber-400/10 text-amber-300'
                                        : 'bg-emerald-400/10 text-emerald-300'
                            }`}>
                                {initials(client.name)}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-black text-white">{client.name ?? 'Sin nombre'}</p>
                                <p className="xl:hidden mt-0.5 truncate text-xs text-zinc-500">
                                    {client.coachName ?? 'Sin coach'}
                                    {' · '}
                                    <span className={client.paymentStatus === 'paid' ? 'text-emerald-400' : client.paymentStatus === 'overdue' ? 'text-red-400' : 'text-zinc-400'}>
                                        {paymentLabel(client.paymentStatus)}
                                    </span>
                                </p>
                                <p className="hidden xl:block mt-1 truncate text-xs text-zinc-500">{client.email ?? client.phone ?? 'Sin contacto'}</p>
                            </div>
                        </div>

                        <div className="hidden xl:block">
                            <p className="text-xs text-zinc-500">Coach</p>
                            <p className="mt-1 truncate text-sm font-bold text-zinc-100">{client.coachName ?? 'Sin coach'}</p>
                        </div>

                        <div className="hidden xl:block">
                            <p className="text-xs text-zinc-500">Pago</p>
                            <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-bold ${paymentTone(client.paymentStatus)}`}>
                                {paymentLabel(client.paymentStatus)}
                            </span>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${
                                !client.isActive
                                    ? 'border-zinc-700 bg-zinc-900 text-zinc-400'
                                    : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                            }`}>
                                {!client.isActive ? <UserX className="h-3 w-3" aria-hidden="true" /> : <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                                <span className="hidden sm:inline">{!client.isActive ? 'Inactivo' : 'Activo'}</span>
                            </span>
                            {client.coachId && (
                                <a
                                    href={`/coach/builder/${client.id}`}
                                    className="hidden sm:flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                                    title="Abrir en builder del coach asignado (requiere workspace enterprise_coach activo)"
                                >
                                    <ExternalLink className="h-3 w-3" />
                                    Builder
                                </a>
                            )}
                            {isAdmin && (
                                <AssignClientSelect
                                    orgSlug={orgSlug}
                                    clientId={client.id}
                                    currentCoachId={client.coachId ?? undefined}
                                    coaches={coaches.map(c => ({ id: c.id, full_name: c.name, slug: c.slug }))}
                                />
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Floating bulk bar — appears when rows selected */}
            {someSelected && isAdmin && (
                <div className="fixed bottom-0 inset-x-0 z-40 border-t border-zinc-700 bg-zinc-900/95 backdrop-blur-md px-4 py-3 pl-safe pr-safe md:left-72 pb-safe">
                    <div className="mx-auto flex max-w-4xl items-center gap-3">
                        <span className="text-sm font-bold text-amber-300 shrink-0">
                            {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
                        </span>

                        <div className="flex flex-1 items-center justify-end gap-2">
                            {/* Assign coach */}
                            <div className="relative">
                                <button
                                    onClick={() => { setShowCoachPicker(v => !v); setConfirmArchive(false) }}
                                    disabled={pending}
                                    className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-300 transition-colors disabled:opacity-50"
                                >
                                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
                                    Asignar
                                    <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                                {showCoachPicker && (
                                    <div className="absolute bottom-full mb-2 right-0 w-52 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl py-1 z-50">
                                        {coaches.length === 0 ? (
                                            <p className="px-3 py-2 text-xs text-zinc-500">Sin coaches activos</p>
                                        ) : coaches.map(c => (
                                            <button
                                                key={c.id}
                                                onClick={() => handleAssign(c.id)}
                                                className="w-full text-left px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
                                            >
                                                {c.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Reactivate (shown when inactive clients selected) */}
                            {[...selected].some(id => clients.find(c => c.id === id)?.isActive === false) && (
                                <button
                                    onClick={handleReactivate}
                                    disabled={pending}
                                    className="flex items-center gap-1.5 rounded-xl border border-emerald-600/40 bg-emerald-600/15 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-600/25 transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Reactivar</span>
                                </button>
                            )}

                            {/* Archive */}
                            <button
                                onClick={() => { setConfirmArchive(true); setShowCoachPicker(false) }}
                                disabled={pending}
                                className="flex items-center gap-1.5 rounded-xl border border-zinc-600 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                            >
                                <Archive className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Archivar</span>
                            </button>

                            <button
                                onClick={clearSelection}
                                disabled={pending}
                                className="flex items-center p-2 text-zinc-500 hover:text-zinc-300 transition-colors"
                                aria-label="Cancelar selección"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Archive confirm */}
            {confirmArchive && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4 pl-safe pr-safe"
                    onClick={e => { if (e.target === e.currentTarget) setConfirmArchive(false) }}
                >
                    <div className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
                        <h2 className="font-bold text-white">Archivar {selected.size} alumno{selected.size === 1 ? '' : 's'}</h2>
                        <p className="text-sm text-zinc-400">
                            Se marcan como inactivos. No se eliminan datos. Puedes reactivarlos desde el perfil.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setConfirmArchive(false)}
                                className="flex-1 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleArchive}
                                className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 transition-colors"
                            >
                                Archivar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-20 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-xl px-4 py-3 pl-safe pr-safe text-sm font-semibold shadow-2xl ${
                    toast.ok ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                }`}>
                    {toast.msg}
                    <button onClick={() => setToast(null)}><X className="h-4 w-4" /></button>
                </div>
            )}

            {/* Client detail sheet — side panel desktop / bottom sheet mobile */}
            {detailClient && (
                <ClientDetailSheet
                    orgSlug={orgSlug}
                    client={detailClient}
                    onClose={() => setDetailClient(null)}
                    coaches={coaches}
                />
            )}
        </>
    )
}
