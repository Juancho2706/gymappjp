'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Camera, Dumbbell, MessageCircle, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

function digitsForWhatsApp(phone: string) {
    const d = phone.replace(/\D/g, '')
    if (d.length >= 10) return d
    return null
}

type ProfileFloatingActionsProps = {
    clientId: string
    coachSlug?: string | null
    clientPhone?: string | null
}

export function ProfileFloatingActions({
    clientId,
    coachSlug,
    clientPhone,
}: ProfileFloatingActionsProps) {
    const [open, setOpen] = useState(false)
    const reduceMotion = useReducedMotion()

    const waDigits = clientPhone ? digitsForWhatsApp(clientPhone) : null
    const waHref = waDigits ? `https://wa.me/${waDigits}` : null
    const checkInHref = coachSlug ? `/c/${coachSlug}/check-in` : null
    const builderHref = `/coach/builder/${clientId}`

    const itemMotion = reduceMotion
        ? {}
        : {
              initial: { opacity: 0, y: 12, scale: 0.92 },
              animate: { opacity: 1, y: 0, scale: 1 },
              exit: { opacity: 0, y: 8, scale: 0.92 },
              transition: { type: 'spring' as const, stiffness: 420, damping: 28 },
          }

    return (
        <div
            className={cn(
                'print:hidden md:hidden',
                'fixed right-4 z-40 flex flex-col items-end gap-3',
                'bottom-24'
            )}
        >
            <AnimatePresence>
                {open && (
                    <>
                        {waHref ? (
                            <motion.a
                                href={waHref}
                                target="_blank"
                                rel="noreferrer"
                                {...itemMotion}
                                className="flex h-12 items-center gap-2 rounded-full border border-border/60 bg-background/95 px-4 text-[10px] font-black uppercase tracking-widest text-foreground shadow-lg backdrop-blur-md dark:border-white/15 dark:bg-zinc-950/90"
                                onClick={() => setOpen(false)}
                            >
                                <MessageCircle className="h-4 w-4 text-emerald-500" />
                                WhatsApp
                            </motion.a>
                        ) : null}
                        {checkInHref ? (
                            <motion.div {...itemMotion}>
                                <Link
                                    href={checkInHref}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => setOpen(false)}
                                    className="flex h-12 items-center gap-2 rounded-full border border-border/60 bg-background/95 px-4 text-[10px] font-black uppercase tracking-widest text-foreground shadow-lg backdrop-blur-md dark:border-white/15 dark:bg-zinc-950/90"
                                >
                                    <Camera className="h-4 w-4 text-primary" />
                                    Check-in alumno
                                </Link>
                            </motion.div>
                        ) : null}
                        <motion.div {...itemMotion}>
                            <Link
                                href={builderHref}
                                onClick={() => setOpen(false)}
                                className="flex h-12 items-center gap-2 rounded-full border border-border/60 bg-background/95 px-4 text-[10px] font-black uppercase tracking-widest text-foreground shadow-lg backdrop-blur-md dark:border-white/15 dark:bg-zinc-950/90"
                            >
                                <Dumbbell className="h-4 w-4 text-primary" />
                                Builder
                            </Link>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <motion.button
                type="button"
                aria-expanded={open}
                aria-label={open ? 'Cerrar acciones rápidas' : 'Acciones rápidas'}
                whileTap={reduceMotion ? undefined : { scale: 0.94 }}
                onClick={() => setOpen((o) => !o)}
                className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-[0_8px_30px_-6px_rgba(0,122,255,0.55)]"
                style={{ backgroundColor: 'var(--theme-primary, #007AFF)', color: 'var(--primary-foreground, #fff)' }}
            >
                {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
            </motion.button>
        </div>
    )
}
