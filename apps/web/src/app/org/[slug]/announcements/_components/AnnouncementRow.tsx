'use client'

import { useTransition } from 'react'
import { toggleAnnouncementAction, deleteAnnouncementAction } from '../_actions/announcements.actions'

interface Props {
    orgSlug: string
    announcement: {
        id: string
        title: string
        body: string
        is_active: boolean
        active_until: string | null
        created_at: string
    }
}

export function AnnouncementRow({ orgSlug, announcement: a }: Props) {
    const [pending, start] = useTransition()

    const toggle = () => start(async () => {
        await toggleAnnouncementAction(orgSlug, a.id, !a.is_active)
    })

    const remove = () => {
        if (!confirm('¿Eliminar esta novedad?')) return
        start(async () => { await deleteAnnouncementAction(orgSlug, a.id) })
    }

    const expiredAt = a.active_until ? new Date(a.active_until) : null
    const isExpired = expiredAt ? expiredAt < new Date() : false

    return (
        <div className={`rounded-xl border p-4 ${a.is_active && !isExpired ? 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950' : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900'}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{a.title}</p>
                        {a.is_active && !isExpired && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">Activo</span>
                        )}
                        {isExpired && (
                            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-700">Expirado</span>
                        )}
                        {!a.is_active && !isExpired && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">Inactivo</span>
                        )}
                    </div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">{a.body}</p>
                    <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                        {new Date(a.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {expiredAt && ` · vence ${expiredAt.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={toggle}
                        disabled={pending}
                        className="text-xs font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-100"
                    >
                        {a.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                        onClick={remove}
                        disabled={pending}
                        className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                        Eliminar
                    </button>
                </div>
            </div>
        </div>
    )
}
