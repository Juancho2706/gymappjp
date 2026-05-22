'use client'

import { useRef, useState, useTransition } from 'react'
import { createAnnouncementAction } from '../_actions/announcements.actions'

interface Props {
    orgSlug: string
}

export function CreateAnnouncementForm({ orgSlug }: Props) {
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [pending, start] = useTransition()
    const formRef = useRef<HTMLFormElement>(null)

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        setError(null)
        setSuccess(false)
        start(async () => {
            const result = await createAnnouncementAction(orgSlug, null, formData)
            if ('error' in result && result.error) {
                setError(result.error)
            } else {
                setSuccess(true)
                formRef.current?.reset()
            }
        })
    }

    return (
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Nueva novedad</h3>
            <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-500">Título</label>
                <input
                    name="title"
                    maxLength={120}
                    required
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    placeholder="Ej: Cambio de horarios semana santa"
                />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-500">Cuerpo</label>
                <textarea
                    name="body"
                    maxLength={1000}
                    required
                    rows={3}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    placeholder="Mensaje para todos los alumnos..."
                />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-500">Activo hasta (opcional)</label>
                <input
                    name="active_until"
                    type="datetime-local"
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Novedad publicada</p>}
            <button
                type="submit"
                disabled={pending}
                className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
                {pending ? 'Publicando...' : 'Publicar'}
            </button>
        </form>
    )
}
