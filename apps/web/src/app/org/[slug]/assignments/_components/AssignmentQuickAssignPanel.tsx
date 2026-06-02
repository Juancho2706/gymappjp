'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Route, ShieldCheck } from 'lucide-react'
import { assignClientToCoach } from '../../_actions/clients.actions'

type AssignmentClient = {
    id: string
    full_name: string | null
    email: string | null
}

type AssignmentCoach = {
    id: string
    name: string
    count: number
    available: number
    load: number
}

interface Props {
    orgSlug: string
    clients: AssignmentClient[]
    coaches: AssignmentCoach[]
    targetClientsPerCoach: number
}

function optionLabel(name: string | null, fallback: string) {
    return name?.trim() || fallback
}

export function AssignmentQuickAssignPanel({ orgSlug, clients, coaches, targetClientsPerCoach }: Props) {
    const router = useRouter()
    const [clientId, setClientId] = useState(clients[0]?.id ?? '')
    const [coachId, setCoachId] = useState(coaches.find((coach) => coach.available > 0)?.id ?? coaches[0]?.id ?? '')
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [pending, startTransition] = useTransition()

    const selectedClient = useMemo(
        () => clients.find((client) => client.id === clientId) ?? null,
        [clientId, clients]
    )
    const selectedCoach = useMemo(
        () => coaches.find((coach) => coach.id === coachId) ?? null,
        [coachId, coaches]
    )
    const projectedCount = selectedCoach ? selectedCoach.count + 1 : 0
    const projectedLoad = selectedCoach ? Math.round((projectedCount / targetClientsPerCoach) * 100) : 0
    const canSubmit = Boolean(selectedClient && selectedCoach && !pending)

    const handleSubmit = () => {
        if (!selectedClient || !selectedCoach) return
        setMessage(null)
        startTransition(async () => {
            const result = await assignClientToCoach(orgSlug, selectedClient.id, selectedCoach.id)
            if (result?.error) {
                setMessage({ type: 'error', text: result.error })
                return
            }
            // First assignment of a pool client returns credentials for manual delivery (no email).
            const creds = result?.credentials
            setMessage({
                type: 'success',
                text: creds
                    ? `Alumno asignado. Accesos (compartir manual, sin email) — Email: ${creds.email} · Pass: ${creds.tempPassword}${creds.loginUrl ? ` · Link: ${creds.loginUrl}` : ''}`
                    : 'Alumno asignado. La vista se actualizara con datos auditados.',
            })
            router.refresh()
        })
    }

    return (
        <section className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <Route className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                        <h2 className="text-lg font-black text-white">Asignacion rapida</h2>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/75">
                        Mueve un alumno sin coach a un coach enterprise activo. La accion valida org, rol, alumno, coach y escribe audit log.
                    </p>
                </div>
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/30 bg-zinc-950/50 px-3 py-1 text-xs font-bold text-emerald-200">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Enterprise only
                </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_220px] lg:items-end">
                <label className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-100/70">Alumno sin coach</span>
                    <select
                        value={clientId}
                        onChange={(event) => setClientId(event.target.value)}
                        disabled={pending || clients.length === 0}
                        className="min-h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300/70 focus:ring-2 focus:ring-emerald-300/20 disabled:opacity-50"
                    >
                        {clients.length === 0 ? (
                            <option value="">No hay alumnos sin coach</option>
                        ) : (
                            clients.map((client) => (
                                <option key={client.id} value={client.id}>
                                    {optionLabel(client.full_name, 'Alumno sin nombre')} · {client.email ?? 'sin email'}
                                </option>
                            ))
                        )}
                    </select>
                </label>

                <label className="grid gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-100/70">Coach destino</span>
                    <select
                        value={coachId}
                        onChange={(event) => setCoachId(event.target.value)}
                        disabled={pending || coaches.length === 0}
                        className="min-h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm font-semibold text-white outline-none transition focus:border-emerald-300/70 focus:ring-2 focus:ring-emerald-300/20 disabled:opacity-50"
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

                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-black text-zinc-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {pending ? (
                        <span className="inline-flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Asignando
                        </span>
                    ) : (
                        'Asignar alumno'
                    )}
                </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-zinc-950/55 p-3">
                    <p className="text-xs text-emerald-100/60">Alumno</p>
                    <p className="mt-1 truncate text-sm font-black text-white">
                        {selectedClient ? optionLabel(selectedClient.full_name, 'Alumno sin nombre') : 'Sin seleccion'}
                    </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-zinc-950/55 p-3">
                    <p className="text-xs text-emerald-100/60">Coach</p>
                    <p className="mt-1 truncate text-sm font-black text-white">
                        {selectedCoach?.name ?? 'Sin seleccion'}
                    </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-zinc-950/55 p-3">
                    <p className="text-xs text-emerald-100/60">Carga proyectada</p>
                    <p className="mt-1 text-sm font-black text-white">
                        {selectedCoach ? `${projectedCount}/${targetClientsPerCoach} (${projectedLoad}%)` : 'Sin coach'}
                    </p>
                </div>
            </div>

            {message && (
                <div
                    className={message.type === 'success'
                        ? 'mt-4 flex gap-2 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-3 text-sm font-semibold text-emerald-100'
                        : 'mt-4 rounded-xl border border-red-300/30 bg-red-300/10 p-3 text-sm font-semibold text-red-100'
                    }
                >
                    {message.type === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                    <span>{message.text}</span>
                </div>
            )}
        </section>
    )
}
