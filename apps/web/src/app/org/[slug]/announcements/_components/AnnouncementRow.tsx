'use client'

import { useTransition } from 'react'
import { CalendarClock, CheckCircle2, EyeOff, Loader2, Power, Trash2 } from 'lucide-react'
import { deleteAnnouncementAction, toggleAnnouncementAction } from '../_actions/announcements.actions'

const AUDIENCE_LABEL: Record<string, string> = {
    all: 'Coaches + Alumnos',
    coaches: 'Solo coaches',
    clients: 'Solo alumnos',
}
const AUDIENCE_COLOR: Record<string, string> = {
    all: 'border-zinc-700 text-zinc-400',
    coaches: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
    clients: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
}

interface Props {
    orgSlug: string
    announcement: {
        id: string
        title: string
        body: string
        is_active: boolean
        active_until: string | null
        created_at: string
        audience?: string
    }
}

function formatDate(value: string) {
    return new Date(value).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function AnnouncementRow({ orgSlug, announcement }: Props) {
    const [pending, start] = useTransition()

    const expiredAt = announcement.active_until ? new Date(announcement.active_until) : null
    const isExpired = expiredAt ? expiredAt < new Date() : false
    const isLive = announcement.is_active && !isExpired

    const toggle = () => start(async () => {
        await toggleAnnouncementAction(orgSlug, announcement.id, !announcement.is_active)
    })

    const remove = () => {
        if (!confirm('Eliminar esta novedad?')) return
        start(async () => {
            await deleteAnnouncementAction(orgSlug, announcement.id)
        })
    }

    return (
        <article className={`rounded-2xl border p-4 ${
            isLive
                ? 'border-cyan-400/25 bg-cyan-400/10'
                : isExpired
                    ? 'border-zinc-800 bg-zinc-950/60'
                    : 'border-amber-400/20 bg-amber-400/10'
        }`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-black text-white">{announcement.title}</p>
                        {announcement.audience && announcement.audience !== 'all' && (
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${AUDIENCE_COLOR[announcement.audience] ?? AUDIENCE_COLOR.all}`}>
                                {AUDIENCE_LABEL[announcement.audience]}
                            </span>
                        )}
                        {isLive && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-xs font-bold text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                Activo
                            </span>
                        )}
                        {isExpired && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs font-bold text-zinc-400">
                                <EyeOff className="h-3 w-3" aria-hidden="true" />
                                Expirado
                            </span>
                        )}
                        {!announcement.is_active && !isExpired && (
                            <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-xs font-bold text-amber-300">
                                Inactivo
                            </span>
                        )}
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-400">{announcement.body}</p>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-zinc-500">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                        {announcement.created_at ? formatDate(announcement.created_at) : 'Sin fecha'}
                        {expiredAt && ` / vence ${expiredAt.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`}
                    </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                        onClick={toggle}
                        disabled={pending}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-xs font-bold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
                    >
                        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Power className="h-3.5 w-3.5" aria-hidden="true" />}
                        {announcement.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                        onClick={remove}
                        disabled={pending}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-red-400/20 px-3 text-xs font-bold text-red-300 transition hover:bg-red-400/10 disabled:opacity-50"
                    >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Eliminar
                    </button>
                </div>
            </div>
        </article>
    )
}
