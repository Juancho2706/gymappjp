'use client'

import { useRef, useState, useTransition } from 'react'
import { CalendarClock, Clock, Loader2, Plus, Send, X } from 'lucide-react'
import { createAnnouncementAction } from '../_actions/announcements.actions'

interface Props {
    orgSlug: string
    audienceCount: number
}

function AnnouncementForm({ orgSlug, audienceCount, onSuccess, compact = false }: Props & { onSuccess?: () => void; compact?: boolean }) {
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
                if (onSuccess) setTimeout(onSuccess, 800)
            }
        })
    }

    return (
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
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
                    rows={compact ? 3 : 4}
                    className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none transition focus:border-cyan-300"
                    placeholder="Mensaje para tu organización..."
                />
            </div>
            <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Destinatarios</label>
                <div className="grid grid-cols-3 gap-2">
                    {([
                        { value: 'all', label: 'Todos', desc: 'Coaches + alumnos' },
                        { value: 'coaches', label: 'Coaches', desc: 'Solo coaches' },
                        { value: 'clients', label: 'Alumnos', desc: 'Solo alumnos' },
                    ] as const).map(opt => (
                        <label key={opt.value} className="cursor-pointer">
                            <input type="radio" name="audience" value={opt.value} defaultChecked={opt.value === 'all'} className="peer sr-only" />
                            <div className="rounded-xl border border-zinc-700 p-2 text-center transition peer-checked:border-cyan-400/50 peer-checked:bg-cyan-400/10">
                                <p className="text-xs font-bold text-zinc-200">{opt.label}</p>
                                <p className="mt-0.5 text-[10px] text-zinc-500 hidden sm:block">{opt.desc}</p>
                            </div>
                        </label>
                    ))}
                </div>
            </div>
            {/* Scheduling section */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                        <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Publicar el (opcional)
                        </span>
                    </label>
                    <input
                        name="published_at"
                        type="datetime-local"
                        className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-300"
                    />
                    <p className="mt-0.5 text-[10px] text-zinc-500">Vacío = publicar ahora</p>
                </div>
                <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
                        <span className="flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" />
                            Activo hasta
                        </span>
                    </label>
                    <input
                        name="active_until"
                        type="datetime-local"
                        className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-300"
                    />
                    <p className="mt-0.5 text-[10px] text-zinc-500">Vacío = sin vencimiento</p>
                </div>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            {success && <p className="text-sm text-emerald-400">Novedad publicada ✓</p>}

            <button
                type="submit"
                disabled={pending}
                className="w-full inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 text-sm font-black text-zinc-950 transition hover:bg-cyan-200 disabled:opacity-50"
            >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {pending ? 'Guardando...' : `Publicar para ${audienceCount} miembros`}
            </button>
        </form>
    )
}

/**
 * Desktop: inline form card.
 * Mobile (<md): FAB button + bottom sheet with same form.
 */
export function AnnouncementComposerSheet({ orgSlug, audienceCount }: Props) {
    const [sheetOpen, setSheetOpen] = useState(false)

    return (
        <>
            {/* Desktop: always visible inline */}
            <div className="hidden md:block rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Send className="h-4 w-4 text-cyan-300" />
                    <h2 className="text-lg font-black text-white">Nueva novedad</h2>
                    <span className="ml-auto shrink-0 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-xs font-bold text-cyan-300">
                        {audienceCount} miembros
                    </span>
                </div>
                <AnnouncementForm orgSlug={orgSlug} audienceCount={audienceCount} />
            </div>

            {/* Mobile: FAB button */}
            <button
                onClick={() => setSheetOpen(true)}
                className="md:hidden fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-300 text-zinc-950 shadow-lg shadow-cyan-900/30 hover:bg-cyan-200 transition-colors pb-safe"
                aria-label="Nueva novedad"
            >
                <Plus className="h-6 w-6" />
            </button>

            {/* Mobile: Bottom sheet */}
            {sheetOpen && (
                <div
                    className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
                    onClick={e => { if (e.target === e.currentTarget) setSheetOpen(false) }}
                >
                    <div className="rounded-t-2xl border-t border-zinc-700 bg-zinc-900 p-5 pb-safe space-y-4 max-h-[90dvh] overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-black text-white">Nueva novedad</h2>
                            <button onClick={() => setSheetOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <AnnouncementForm
                            orgSlug={orgSlug}
                            audienceCount={audienceCount}
                            compact
                            onSuccess={() => setSheetOpen(false)}
                        />
                    </div>
                </div>
            )}
        </>
    )
}
