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
                                className="flex h-12 items-center gap-2 rounded-pill border border-subtle bg-surface-card px-4 text-[10px] font-black tracking-widest text-strong uppercase shadow-[var(--shadow-md)]"
                                onClick={() => setOpen(false)}
                            >
                                <MessageCircle className="h-4 w-4 text-[#25D366]" />
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
                                    className="flex h-12 items-center gap-2 rounded-pill border border-subtle bg-surface-card px-4 text-[10px] font-black tracking-widest text-strong uppercase shadow-[var(--shadow-md)]"
                                >
                                    <Camera className="h-4 w-4 text-sport-600" />
                                    Check-in alumno
                                </Link>
                            </motion.div>
                        ) : null}
                        <motion.div {...itemMotion}>
                            <Link
                                href={builderHref}
                                onClick={() => setOpen(false)}
                                className="flex h-12 items-center gap-2 rounded-pill border border-subtle bg-surface-card px-4 text-[10px] font-black tracking-widest text-strong uppercase shadow-[var(--shadow-md)]"
                            >
                                <Dumbbell className="h-4 w-4 text-sport-600" />
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
                className="flex h-14 w-14 items-center justify-center rounded-full bg-sport-500 text-[var(--text-on-sport)] shadow-[var(--glow-sport)]"
            >
                {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
            </motion.button>
        </div>
    )
}
