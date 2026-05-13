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
            <DialogContent className="bg-card border border-border text-foreground max-w-sm rounded-2xl shadow-2xl p-0 overflow-hidden">
                {/* Header gradient */}
                <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-b border-border px-6 pt-8 pb-6 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 border border-emerald-500/30">
                        <Sparkles className="h-8 w-8 text-emerald-400" />
                    </div>
                    <h2 className="text-xl font-extrabold text-foreground">¡Bienvenido a EVA!</h2>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        Tu plan gratuito está activo. Podés empezar ahora mismo.
                    </p>
                </div>

                {/* Steps */}
                <div className="px-6 py-5 space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Primeros pasos</p>
                    <ul className="space-y-3">
                        <li className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/15">
                                <Users className="h-3.5 w-3.5 text-sky-400" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-foreground">Agregá tu primer alumno</p>
                                <p className="text-xs text-muted-foreground">Hasta 3 alumnos en el plan Free</p>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
                                <Zap className="h-3.5 w-3.5 text-violet-400" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-foreground">Creá tu primera rutina</p>
                                <p className="text-xs text-muted-foreground">Constructor de programas sin límites</p>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
                                <Palette className="h-3.5 w-3.5 text-amber-400" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-foreground">Personalizá tu app con Starter</p>
                                <p className="text-xs text-muted-foreground">Tu logo y colores desde $19.990/mes</p>
                            </div>
                        </li>
                    </ul>
                </div>

                {/* Plan limits */}
                <div className="px-6 pb-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">Tu plan Free incluye</p>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                        {[
                            { ok: true,  text: '3 alumnos activos' },
                            { ok: true,  text: 'Entrenos ilimitados' },
                            { ok: true,  text: 'App para tus alumnos' },
                            { ok: true,  text: 'Check-ins' },
                            { ok: false, text: 'Marca personalizada' },
                            { ok: false, text: 'Nutrición' },
                        ].map(({ ok, text }) => (
                            <div key={text} className={`flex items-center gap-1.5 ${ok ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
                                {ok
                                    ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                                    : <XCircle className="w-3.5 h-3.5 shrink-0 text-muted-foreground/40" />
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
                        className="w-full h-11 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                        Empezar ahora →
                    </button>
                    <Link
                        href="/coach/subscription"
                        onClick={dismiss}
                        className="w-full h-9 flex items-center justify-center rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Ver todos los planes
                    </Link>
                </div>
            </DialogContent>
        </Dialog>
    )
}
