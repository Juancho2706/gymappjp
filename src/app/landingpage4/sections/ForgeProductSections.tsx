'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { FORGE_PRODUCT_BLOCKS } from '../forge-product-copy'
import { ForgeProductVisual } from './ForgeProductVisual'

export function ForgeProductSections() {
    const reduce = useReducedMotion()

    return (
        <>
            {FORGE_PRODUCT_BLOCKS.map((b, sectionIdx) => {
                const visualFirst = sectionIdx % 2 === 1
                return (
                    <section
                        key={b.id}
                        id={b.id}
                        className={[
                            'w-full border-y border-[var(--forge-border)] py-24 md:py-32',
                            sectionIdx % 2 === 0 ? 'bg-[var(--forge-bg)]' : 'bg-[var(--forge-surface-alt)]/75',
                        ].join(' ')}
                    >
                        <motion.div
                            initial={reduce ? false : { opacity: 0, y: 28 }}
                            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: '-8% 0px' }}
                            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                            className="mx-auto w-full max-w-7xl px-5 md:px-12 lg:px-20"
                        >
                            <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-14">
                                <div className={visualFirst ? 'lg:order-2' : ''}>
                                    <header className="forge-section-hd">
                                        <span className="forge-section-marker">{b.marker}</span>
                                        <h2 className="forge-font-display min-w-0 flex-1 text-[clamp(1.85rem,4.5vw,3.15rem)] font-extrabold tracking-tight text-[var(--forge-ink)]">
                                            {b.title}
                                        </h2>
                                        <span className="forge-font-mono hidden max-w-[10rem] text-right text-[10px] uppercase tracking-wider text-[var(--forge-muted)] sm:block">
                                            {b.aside}
                                        </span>
                                    </header>
                                    <p className="forge-font-mono mb-8 text-[10px] uppercase tracking-wider text-[var(--forge-muted)] sm:hidden">{b.aside}</p>

                                    <ul className="space-y-4">
                                        {b.bullets.map((line, i) => (
                                            <motion.li
                                                key={line}
                                                initial={reduce ? false : { opacity: 0, x: -12 }}
                                                whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
                                                viewport={{ once: true, margin: '-5% 0px' }}
                                                transition={{ delay: i * 0.05, duration: 0.4 }}
                                                className="forge-block-card text-[15px] leading-relaxed text-[var(--forge-ink-2)] md:text-base"
                                            >
                                                {line}
                                            </motion.li>
                                        ))}
                                    </ul>
                                </div>

                                <div className={cn('flex flex-col', visualFirst ? 'lg:order-1' : '')}>
                                    <motion.div
                                        initial={reduce ? false : { opacity: 0, y: 16 }}
                                        whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                                        viewport={{ once: true, margin: '-6% 0px' }}
                                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                        className="min-h-[220px] rounded-[12px] border border-[var(--forge-border)] bg-[var(--forge-surface)] p-3 sm:min-h-[240px] sm:p-4"
                                    >
                                        <ForgeProductVisual visual={b.visual} className="min-h-0" />
                                    </motion.div>
                                    <p className="forge-font-mono mt-3 text-center text-[9px] uppercase tracking-wider text-[var(--forge-muted)] lg:text-left">
                                        {b.visualCaption}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    </section>
                )
            })}
        </>
    )
}
