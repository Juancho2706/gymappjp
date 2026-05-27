'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckSquare, Loader2, ShieldCheck, Square } from 'lucide-react'
import { bulkAssignUnassignedClientsAction } from '../../_actions/clients.actions'

type BulkClient = {
    id: string
    full_name: string | null
    email: string | null
}

type BulkCoach = {
    id: string
    name: string
    count: number
    available: number
    load: number
}

interface Props {
    orgSlug: string
    clients: BulkClient[]
    coaches: BulkCoach[]
    targetClientsPerCoach: number
}

function clientLabel(client: BulkClient) {
    return client.full_name?.trim() || client.email || 'Alumno sin nombre'
}

export function BulkAssignPanel({ orgSlug, clients, coaches, targetClientsPerCoach }: Props) {
    const router = useRouter()
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [coachId, setCoachId] = useState(coaches.find((coach) => coach.available > 0)?.id ?? coaches[0]?.id ?? '')
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [pending, startTransition] = useTransition()

    const selectedCoach = useMemo(() => coaches.find((coach) => coach.id === coachId) ?? null, [coachId, coaches])
    const selectedClients = useMemo(
        () => clients.filter((client) => selectedIds.includes(client.id)),
        [clients, selectedIds]
    )
    const projectedCount = selectedCoach ? selectedCoach.count + selectedIds.length : 0
    const projectedLoad = selectedCoach ? Math.round((projectedCount / targetClientsPerCoach) * 100) : 0
    const visibleSelectableIds = clients.slice(0, 50).map((client) => client.id)
    const allVisibleSelected = visibleSelectableIds.length > 0 && visibleSelectableIds.every((id) => selectedIds.includes(id))
    const canSubmit = Boolean(selectedCoach && selectedIds.length > 0 && !pending)

    const toggleClient = (clientId: string) => {
        setMessage(null)
        setSelectedIds((current) =>
            current.includes(clientId) ? current.filter((id) => id !== clientId) : [...current, clientId].slice(0, 50)
        )
    }

    const toggleAllVisible = () => {
        setMessage(null)
        setSelectedIds(allVisibleSelected ? [] : visibleSelectableIds)
    }

    const handleSubmit = () => {
        if (!selectedCoach || selectedIds.length === 0) return
        setMessage(null)
        startTransition(async () => {
            const result = await bulkAssignUnassignedClientsAction(orgSlug, selectedIds, selectedCoach.id)
            if (result?.error) {
                setMessage({ type: 'error', text: result.error })
                return
            }
            setMessage({ type: 'success', text: `${result.count ?? selectedIds.length} alumnos asignados con audit log.` })
            setSelectedIds([])
            router.refresh()
        })
    }

    return (
        <section className="rounded-2xl border border-sky-400/25 bg-sky-400/10 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <CheckSquare className="h-4 w-4 text-sky-300" aria-hidden="true" />
                        <h2 className="text-lg font-black text-white">Bulk assign seguro</h2>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-sky-50/75">
                        Selecciona alumnos activos sin coach, revisa el impacto de carga y confirma el lote. Limite inicial: 50 alumnos por accion.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={toggleAllVisible}
                    disabled={clients.length === 0 || pending}
                    className="inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-xl border border-sky-300/30 bg-zinc-950/55 px-3 text-sm font-bold text-sky-100 transition hover:bg-zinc-900 disabled:opacity-50"
                >
                    {allVisibleSelected ? <CheckSquare className="h-4 w-4" aria-hidden="true" /> : <Square className="h-4 w-4" aria-hidden="true" />}
                    {allVisibleSelected ? 'Limpiar seleccion' : 'Seleccionar visibles'}
                </button>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_360px]">
                <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/55">
                    <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-100/70">
                            Alumnos seleccionables
                        </p>
                        <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2 py-1 text-xs font-black text-sky-100">
                            {selectedIds.length} seleccionados
                        </span>
                    </div>

                    <div className="max-h-[360px] overflow-y-auto">
                        {clients.length > 0 ? (
                            clients.slice(0, 50).map((client) => {
                                const selected = selectedIds.includes(client.id)
                                return (
                                    <label
                                        key={client.id}
                                        className="grid cursor-pointer grid-cols-[auto_1fr] gap-3 border-b border-white/10 px-4 py-3 transition last:border-b-0 hover:bg-white/[0.03]"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selected}
                                            onChange={() => toggleClient(client.id)}
                                            disabled={pending}
                                            className="mt-1 size-4 rounded border-white/20 bg-zinc-900 text-sky-300 accent-sky-300"
                                        />
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-black text-white">{clientLabel(client)}</span>
                                            <span className="mt-1 block truncate text-xs text-sky-100/55">{client.email ?? 'Sin email registrado'}</span>
                                        </span>
                                    </label>
                                )
                            })
                        ) : (
                            <div className="p-5 text-sm text-sky-100/60">No hay alumnos activos sin coach para asignar.</div>
                        )}
                    </div>
                </div>

                <aside className="rounded-xl border border-white/10 bg-zinc-950/55 p-4">
                    <label className="grid gap-2">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-sky-100/70">Coach destino</span>
                        <select
                            value={coachId}
                            onChange={(event) => setCoachId(event.target.value)}
                            disabled={pending || coaches.length === 0}
                            className="min-h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm font-semibold text-white outline-none transition focus:border-sky-300/70 focus:ring-2 focus:ring-sky-300/20 disabled:opacity-50"
                        >
                            {coaches.length === 0 ? (
                                <option value="">No hay coaches activos</option>
                            ) : (
                                coaches.map((coach) => (
                                    <option key={coach.id} value={coach.id}>
                                        {coach.name} · {coach.count}/{targetClientsPerCoach}
                                    </option>
                                ))
                            )}
                        </select>
                    </label>

                    <div className="mt-4 grid gap-2">
                        <div className="rounded-xl border border-white/10 bg-zinc-900/70 p-3">
                            <p className="text-xs text-sky-100/55">Impacto</p>
                            <p className="mt-1 text-sm font-black text-white">
                                {selectedCoach ? `${selectedCoach.count} -> ${projectedCount} alumnos` : 'Sin coach'}
                            </p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-zinc-900/70 p-3">
                            <p className="text-xs text-sky-100/55">Carga proyectada</p>
                            <p className="mt-1 text-sm font-black text-white">
                                {selectedCoach ? `${projectedLoad}%` : 'Sin coach'}
                            </p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-zinc-900/70 p-3">
                            <p className="text-xs text-sky-100/55">Preview</p>
                            <p className="mt-1 text-sm font-black text-white">
                                {selectedClients.length > 0 ? selectedClients.slice(0, 2).map(clientLabel).join(', ') : 'Selecciona alumnos'}
                                {selectedClients.length > 2 ? ` +${selectedClients.length - 2}` : ''}
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 flex gap-2 rounded-xl border border-sky-300/25 bg-sky-300/10 p-3 text-xs leading-5 text-sky-50/75">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-200" aria-hidden="true" />
                        <span>El servidor revalida org, rol, alumnos activos sin coach y coach activo antes de escribir.</span>
                    </div>

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-sky-300 px-4 text-sm font-black text-zinc-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {pending ? (
                            <span className="inline-flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                Asignando lote
                            </span>
                        ) : (
                            `Asignar ${selectedIds.length || ''}`.trim()
                        )}
                    </button>

                    {message && (
                        <div
                            className={message.type === 'success'
                                ? 'mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-3 text-sm font-semibold text-emerald-100'
                                : 'mt-4 rounded-xl border border-red-300/30 bg-red-300/10 p-3 text-sm font-semibold text-red-100'
                            }
                        >
                            {message.text}
                        </div>
                    )}
                </aside>
            </div>
        </section>
    )
}
