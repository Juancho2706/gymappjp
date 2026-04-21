'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

export function ForgeFaq() {
    const reduce = useReducedMotion()
    const [open, setOpen] = useState<number | null>(0)
    const faqs = useMemo(
        () => [
            {
                q: '¿Esta página es el producto oficial?',
                a: 'Es una vitrina de diseño FORGE. El producto completo vive en eva-app.cl con el mismo login y registro.',
            },
            {
                q: '¿Los precios son reales?',
                a: 'Sí: se calculan con la misma lógica que /pricing en CLP y ciclos permitidos por tier.',
            },
            {
                q: '¿Dónde veo la interfaz coach o alumno?',
                a: 'Usá los enlaces “Demo coach” y “Demo alumno” en la barra superior: son maquetas públicas sin datos reales.',
            },
        ],
        []
    )

    return (
        <section id="faq" className="w-full border-t border-[var(--forge-border)] bg-[var(--forge-bg)] py-16 md:py-24">
            <div className="mx-auto max-w-3xl px-5 md:px-12 lg:px-20">
                <header className="forge-section-hd">
                    <span className="forge-section-marker">Intel</span>
                    <h2 className="forge-font-display min-w-0 flex-1 text-2xl font-black tracking-tight text-[var(--forge-ink)] sm:text-3xl">
                        Preguntas rápidas
                    </h2>
                </header>
            <div className="mt-8 space-y-2">
                {faqs.map((item, idx) => {
                    const isOpen = open === idx
                    return (
                        <div
                            key={item.q}
                            className="overflow-hidden rounded-[12px] border border-[var(--forge-border)] bg-[var(--forge-surface)]"
                        >
                            <button
                                type="button"
                                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left text-sm font-semibold text-[var(--forge-ink)]"
                                onClick={() => setOpen(isOpen ? null : idx)}
                                aria-expanded={isOpen}
                            >
                                {item.q}
                                <span className="forge-font-mono text-[var(--forge-muted)]">{isOpen ? '−' : '+'}</span>
                            </button>
                            <AnimatePresence initial={false}>
                                {isOpen ? (
                                    <motion.div
                                        initial={reduce ? false : { height: 0, opacity: 0 }}
                                        animate={reduce ? undefined : { height: 'auto', opacity: 1 }}
                                        exit={reduce ? undefined : { height: 0, opacity: 0 }}
                                        transition={{ duration: 0.25 }}
                                        className="border-t border-[var(--forge-border)]"
                                    >
                                        <p className="px-4 py-3 text-sm leading-relaxed text-[var(--forge-ink-2)]">{item.a}</p>
                                    </motion.div>
                                ) : null}
                            </AnimatePresence>
                        </div>
                    )
                })}
            </div>
            </div>
        </section>
    )
}
