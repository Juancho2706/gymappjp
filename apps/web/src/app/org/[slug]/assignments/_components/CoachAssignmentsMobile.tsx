'use client'

import { Users } from 'lucide-react'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet'
import { ReassignClientSelect } from './ReassignClientSelect'

type CoachRow = {
    id: string
    name: string
    slug: string | null
    count: number
    load: number
    available: number
}

type AssignedClient = {
    id: string
    full_name: string | null
    email: string | null
    coach_id: string | null
}

type CoachAssignmentsMobileProps = {
    orgSlug: string
    coaches: CoachRow[]
    assignedClients: AssignedClient[]
    targetClientsPerCoach: number
}

function initials(name: string | null | undefined) {
    return (name?.trim()?.charAt(0) || '?').toUpperCase()
}

function capacityTone(load: number) {
    if (load >= 100) return 'text-red-300 bg-red-400/10 border-red-400/25'
    if (load >= 80) return 'text-amber-300 bg-amber-400/10 border-amber-400/25'
    return 'text-emerald-300 bg-emerald-400/10 border-emerald-400/25'
}

export function CoachAssignmentsMobile({
    orgSlug,
    coaches,
    assignedClients,
    targetClientsPerCoach,
}: CoachAssignmentsMobileProps) {
    if (coaches.length === 0) {
        return (
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 md:hidden">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-500">
                    No hay coaches activos para asignar alumnos.
                </div>
            </section>
        )
    }

    return (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 md:hidden">
            <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-sky-300" aria-hidden="true" />
                <h2 className="text-base font-black text-white">Coaches y alumnos</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
                Revisa carga por coach y abre el detalle para reasignar alumnos desde mobile.
            </p>

            <div className="mt-4 space-y-3">
                {coaches.map((coach) => {
                    const coachClients = assignedClients.filter((client) => client.coach_id === coach.id)
                    return (
                        <Sheet key={coach.id}>
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="truncate text-sm font-black text-white">{coach.name}</h3>
                                        <p className="mt-1 truncate text-xs text-zinc-500">
                                            {coach.slug ?? 'coach enterprise'}
                                        </p>
                                    </div>
                                    <span className={`rounded-full border px-2 py-1 text-xs font-bold ${capacityTone(coach.load)}`}>
                                        {coach.load}%
                                    </span>
                                </div>

                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
                                    <div
                                        className={coach.load >= 100 ? 'h-full bg-red-400' : coach.load >= 80 ? 'h-full bg-amber-400' : 'h-full bg-emerald-400'}
                                        style={{ width: `${Math.min(coach.load, 100)}%` }}
                                    />
                                </div>

                                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                    {[
                                        ['Alumnos', coach.count],
                                        ['Cupos', coach.available],
                                        ['Meta', targetClientsPerCoach],
                                    ].map(([label, value]) => (
                                        <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-2">
                                            <p className="text-base font-black text-white">{value}</p>
                                            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-500">{label}</p>
                                        </div>
                                    ))}
                                </div>

                                <SheetTrigger className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 text-xs font-black text-sky-200">
                                    Ver alumnos
                                </SheetTrigger>
                            </div>

                            <SheetContent
                                side="bottom"
                                className="max-h-[88dvh] overflow-y-auto rounded-t-2xl border-zinc-800 bg-zinc-950 pb-safe pl-safe pr-safe text-zinc-100"
                            >
                                <SheetHeader className="border-zinc-800 bg-zinc-900/80 p-4">
                                    <SheetTitle className="text-base normal-case tracking-normal text-white">
                                        {coach.name}
                                    </SheetTitle>
                                    <SheetDescription className="text-xs leading-5 text-zinc-400">
                                        {coach.count}/{targetClientsPerCoach} alumnos activos · {coach.available} cupos
                                    </SheetDescription>
                                </SheetHeader>

                                <div className="grid gap-2 p-4">
                                    {coachClients.length > 0 ? (
                                        coachClients.map((client) => (
                                            <div
                                                key={client.id}
                                                className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3"
                                            >
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-xs font-black text-zinc-300">
                                                    {initials(client.full_name)}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-semibold text-zinc-100">{client.full_name ?? 'Sin nombre'}</p>
                                                    <p className="truncate text-[11px] text-zinc-500">{client.email ?? 'Sin email'}</p>
                                                </div>
                                                {coaches.length >= 2 && client.coach_id && (
                                                    <ReassignClientSelect
                                                        orgSlug={orgSlug}
                                                        clientId={client.id}
                                                        currentCoachId={client.coach_id}
                                                        coaches={coaches.map((item) => ({ id: item.id, name: item.name }))}
                                                    />
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-500">
                                            Este coach no tiene alumnos asignados.
                                        </div>
                                    )}
                                </div>
                            </SheetContent>
                        </Sheet>
                    )
                })}
            </div>
        </section>
    )
}
