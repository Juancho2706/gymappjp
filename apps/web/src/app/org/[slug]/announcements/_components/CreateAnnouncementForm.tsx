'use client'

import { useRef, useState, useTransition } from 'react'
import { CalendarClock, Loader2, Send } from 'lucide-react'
import { createAnnouncementAction } from '../_actions/announcements.actions'

interface Props {
    orgSlug: string
    audienceCount: number
}

export function CreateAnnouncementForm({ orgSlug, audienceCount }: Props) {
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [pending, start] = useTransition()
    const formRef = useRef<HTMLFormElement>(null)

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
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
        <form ref={formRef} onSubmit={handleSubmit} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <Send className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                        <h2 className="text-lg font-black text-white">Nueva novedad</h2>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                        Publicacion simple para alumnos enterprise. Mantenerla corta reduce soporte y confusion.
                    </p>
                </div>
                <span className="shrink-0 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-xs font-bold text-cyan-300">
                    {audienceCount} alumnos
                </span>
            </div>

            <div className="mt-5 space-y-3">
                <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Titulo</label>
                    <input
                        name="title"
                        maxLength={120}
                        required
                        className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-300"
                        placeholder="Ej: Horarios especiales de feriado"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Mensaje</label>
                    <textarea
                        name="body"
                        maxLength={1000}
                        required
                        rows={4}
                        className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none transition focus:border-cyan-300"
                        placeholder="Mensaje para alumnos enterprise..."
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Activo hasta</label>
                    <div className="relative">
                        <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                        <input
                            name="active_until"
                            type="datetime-local"
                            className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-9 pr-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-300"
                        />
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-zinc-500">Opcional. Recomendado para evitar mensajes antiguos.</p>
                </div>
            </div>

            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            {success && <p className="mt-3 text-sm text-emerald-400">Novedad publicada</p>}

            <button
                type="submit"
                disabled={pending}
                className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 text-sm font-black text-zinc-950 transition hover:bg-cyan-200 disabled:opacity-50"
            >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                {pending ? 'Publicando...' : 'Publicar'}
            </button>
        </form>
    )
}
