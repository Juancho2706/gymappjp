'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { ChevronsRight, Monitor, Smartphone, Sparkles } from 'lucide-react'
import { LOTTIE_CLIPBOARD_LIST_URL } from '@/lib/lottie-assets'
import { cn } from '@/lib/utils'

const LottiePlayer = dynamic(
    () =>
        import('@lottiefiles/react-lottie-player').then((m) => m.Player),
    {
        ssr: false,
        loading: () => (
            <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted/40"
                aria-hidden
            />
        ),
    }
)

/**
 * V1 franja compacta (plan §4.2) + acento V4 Lottie cuando el sistema no pide reduced motion.
 * UI esquemática ficticia (§4.6); no datos reales de alumnos.
 */
export function OnboardingCompactLoopStrip() {
    const [motionPrefs, setMotionPrefs] = useState<{ ready: boolean; reduced: boolean }>({
        ready: false,
        reduced: false,
    })

    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
        setMotionPrefs({ ready: true, reduced: mq.matches })
        const onChange = () => setMotionPrefs({ ready: true, reduced: mq.matches })
        mq.addEventListener('change', onChange)
        return () => mq.removeEventListener('change', onChange)
    }, [])

    return (
        <section
            className="mt-5 overflow-hidden rounded-2xl border border-[color:var(--theme-primary)]/20 bg-gradient-to-br from-muted/30 via-background to-[color:var(--theme-primary)]/10 p-4 sm:p-5"
            aria-label="Esquema ficticio: tu panel de coach conectado con la app del alumno"
        >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between lg:gap-6">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:flex-nowrap sm:justify-center sm:gap-3 lg:flex-1 lg:justify-start">
                    <div
                        className="relative flex h-[4.5rem] w-[6.75rem] shrink-0 flex-col rounded-lg border border-border/80 bg-card/90 p-2 shadow-sm"
                        aria-hidden
                    >
                        <div className="flex items-center gap-1 border-b border-border/60 pb-1">
                            <Monitor className="h-3 w-3 text-[color:var(--theme-primary)]" />
                            <span className="text-[8px] font-bold uppercase tracking-wide text-muted-foreground">
                                Panel
                            </span>
                        </div>
                        <div className="mt-1.5 flex flex-1 flex-col gap-1">
                            <div className="h-1 rounded-full bg-[color:var(--theme-primary)]/35" />
                            <div className="h-1 w-[80%] rounded-full bg-muted-foreground/20" />
                            <div className="h-1 w-[60%] rounded-full bg-muted-foreground/15" />
                        </div>
                    </div>

                    <ChevronsRight
                        className={cn(
                            'h-6 w-6 shrink-0 text-[color:var(--theme-primary)]/85',
                            'motion-safe:opacity-90 motion-safe:animate-pulse'
                        )}
                        aria-hidden
                    />

                    <div
                        className="relative flex h-[5.25rem] w-[3.25rem] shrink-0 flex-col rounded-[0.65rem] border-2 border-[color:var(--theme-primary)]/40 bg-gradient-to-b from-card to-muted/30 p-1 shadow-inner"
                        aria-hidden
                    >
                        <div className="mx-auto mt-0.5 h-1 w-6 rounded-full bg-foreground/15" />
                        <div className="mt-1 flex flex-1 flex-col gap-0.5 rounded-md bg-[color:var(--theme-primary)]/10 p-1">
                            <Smartphone className="mx-auto mt-0.5 h-4 w-4 text-[color:var(--theme-primary)]" />
                            <div className="mt-auto h-1 w-full rounded-full bg-emerald-500/35" />
                        </div>
                    </div>
                </div>

                <div className="min-w-0 flex-1 text-center lg:text-left">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--theme-primary)]">
                        Tu circuito en un vistazo
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-snug text-foreground sm:text-base">
                        Configurás en tu panel; tus alumnos entrenan en su app con tu marca.
                    </p>
                </div>

                <div className="flex shrink-0 items-center justify-center lg:w-[5.5rem]">
                    {!motionPrefs.ready ? (
                        <div className="h-16 w-16 shrink-0 rounded-xl bg-muted/35" aria-hidden />
                    ) : motionPrefs.reduced ? (
                        <Sparkles
                            className="h-10 w-10 text-[color:var(--theme-primary)]/70"
                            aria-hidden
                        />
                    ) : (
                        <div className="flex h-16 w-16 items-center justify-center" aria-hidden>
                            <LottiePlayer
                                autoplay
                                loop
                                src={LOTTIE_CLIPBOARD_LIST_URL}
                                style={{ height: 64, width: 64 }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}
