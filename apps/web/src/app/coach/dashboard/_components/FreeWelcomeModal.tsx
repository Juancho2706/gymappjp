'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Sparkles, Users, Palette, Zap, CheckCircle2, XCircle } from 'lucide-react'
import Link from 'next/link'

const STORAGE_KEY = 'eva_free_welcome_seen'

export function FreeWelcomeModal() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    const [open, setOpen] = useState(false)

    useEffect(() => {
        if (searchParams.get('welcome') !== 'free') return
        if (typeof window === 'undefined') return
        if (localStorage.getItem(STORAGE_KEY)) return
        setOpen(true)
    }, [searchParams])

    function dismiss() {
        if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, '1')
        }
        setOpen(false)
        // Remove ?welcome=free from URL without push to history
        const params = new URLSearchParams(searchParams.toString())
        params.delete('welcome')
        const next = params.size > 0 ? `${pathname}?${params.toString()}` : pathname
        router.replace(next)
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && dismiss()}>
            <DialogContent className="bg-surface-card border border-subtle text-body max-w-sm rounded-card shadow-2xl p-0 overflow-hidden">
                {/* Header gradient */}
                <div className="bg-gradient-to-br from-[var(--sport-100)] to-transparent border-b border-subtle px-6 pt-8 pb-6 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-control bg-[var(--sport-100)] border border-[var(--sport-500)]/30">
                        <Sparkles className="h-8 w-8 text-[var(--sport-600)]" />
                    </div>
                    <h2 className="font-display text-xl font-extrabold tracking-[-0.02em] text-strong">¡Bienvenido a EVA!</h2>
                    <p className="mt-1.5 text-sm text-muted">
                        Tu plan gratuito está activo. Podés empezar ahora mismo.
                    </p>
                </div>

                {/* Steps */}
                <div className="px-6 py-5 space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted">Primeros pasos</p>
                    <ul className="space-y-3">
                        <li className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-[var(--sport-100)]">
                                <Users className="h-3.5 w-3.5 text-[var(--sport-600)]" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-strong">Agregá tu primer alumno</p>
                                <p className="text-xs text-muted">Hasta 3 alumnos en el plan Free</p>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-[var(--ember-100)]">
                                <Zap className="h-3.5 w-3.5 text-[var(--ember-700)]" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-strong">Creá tu primera rutina</p>
                                <p className="text-xs text-muted">Constructor de programas sin límites</p>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-[var(--success-100)]">
                                <Palette className="h-3.5 w-3.5 text-[var(--success-600)]" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-strong">Personalizá tu app con Pro</p>
                                <p className="text-xs text-muted">Tu logo y colores desde $29.990/mes</p>
                            </div>
                        </li>
                    </ul>
                </div>

                {/* Plan limits */}
                <div className="px-6 pb-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-2.5">Tu plan Free incluye</p>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                        {[
                            { ok: true,  text: '3 alumnos activos' },
                            { ok: true,  text: 'Entrenos ilimitados' },
                            { ok: true,  text: 'App para tus alumnos' },
                            { ok: true,  text: 'Check-ins' },
                            { ok: false, text: 'Marca personalizada' },
                            { ok: false, text: 'Nutrición' },
                        ].map(({ ok, text }) => (
                            <div key={text} className={`flex items-center gap-1.5 ${ok ? 'text-muted' : 'text-subtle opacity-70'}`}>
                                {ok
                                    ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[var(--success-600)]" />
                                    : <XCircle className="w-3.5 h-3.5 shrink-0 text-[var(--text-subtle)] opacity-50" />
                                }
                                {text}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div className="px-6 pb-6 flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={dismiss}
                        className="w-full h-11 rounded-control bg-sport-500 text-sm font-bold text-white hover:bg-sport-600 transition-colors"
                    >
                        Empezar ahora →
                    </button>
                    <Link
                        href="/coach/subscription"
                        onClick={dismiss}
                        className="w-full h-9 flex items-center justify-center rounded-control text-xs font-medium text-muted hover:text-strong transition-colors"
                    >
                        Ver todos los planes
                    </Link>
                </div>
            </DialogContent>
        </Dialog>
    )
}
