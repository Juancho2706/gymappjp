'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { ForgeBrandLogo } from '../ForgeBrandLogo'
import { FORGE_HERO_PREFIX } from '../forge-typewriter-copy'
import { ForgeHeroAppShowcase } from './ForgeHeroAppShowcase'
import { ForgeTypewriterHeadline } from './ForgeTypewriterHeadline'

export function ForgeHero() {
    const reduce = useReducedMotion()

    return (
        <section
            id="top"
            className="forge-hero-surface relative w-full min-h-[min(100dvh,920px)] border-b border-[var(--forge-border)] px-4 py-12 sm:px-6 md:px-10 md:py-16 lg:px-16 lg:py-20"
        >
            <div className="relative z-[1] mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-12 lg:gap-12">
                <div className="flex flex-col lg:col-span-7">
                    <div className="forge-tag-strip">
                        {(['EVA', 'COACH', 'FORGE', 'v4'] as const).map((cell) => (
                            <span
                                key={cell}
                                className={cn(
                                    'forge-tag-cell',
                                    cell === 'v4' && 'forge-tag-cell-red',
                                    cell === 'FORGE' && 'forge-tag-cell-ink'
                                )}
                            >
                                {cell}
                            </span>
                        ))}
                    </div>

                    <motion.div
                        initial={reduce ? false : { opacity: 0, y: 20 }}
                        animate={reduce ? undefined : { opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="mt-8 flex flex-col items-center gap-6 sm:mt-10 sm:flex-row sm:items-start"
                    >
                        <ForgeBrandLogo variant="hero" priority className="forge-brutal-shadow sm:order-2 lg:order-none" />
                        <div className="min-w-0 flex-1 text-center sm:text-left">
                            <h1 className="forge-font-display text-balance text-[clamp(2.15rem,6.5vw,3.75rem)] font-black leading-[0.95] tracking-[-0.04em] text-[var(--forge-ink)]">
                                <span className="block">{FORGE_HERO_PREFIX}</span>
                                <span className="mt-2 block text-[clamp(1.35rem,4.2vw,2.35rem)] font-extrabold leading-tight">
                                    <ForgeTypewriterHeadline />
                                </span>
                            </h1>
                        </div>
                    </motion.div>

                    <motion.p
                        initial={reduce ? false : { opacity: 0, y: 12 }}
                        animate={reduce ? undefined : { opacity: 1, y: 0 }}
                        transition={{ delay: 0.06, duration: 0.45 }}
                        className="mt-6 max-w-2xl text-pretty text-[15px] leading-relaxed text-[var(--forge-ink-2)] sm:text-[17px]"
                    >
                        SaaS white-label para coaches en Chile y LATAM: programas, nutrición por tier, seguimiento de alumnos y app instalable con tu
                        marca — sin hojas de cálculo ni WhatsApp como único CRM.
                    </motion.p>

                    <motion.div
                        initial={reduce ? false : { opacity: 0, y: 10 }}
                        animate={reduce ? undefined : { opacity: 1, y: 0 }}
                        transition={{ delay: 0.12, duration: 0.4 }}
                        className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
                    >
                        <Link
                            href="/register?tier=pro&cycle=monthly"
                            className={cn(
                                buttonVariants({ size: 'lg' }),
                                'forge-font-mono inline-flex justify-center rounded-full bg-[var(--forge-accent)] px-8 text-sm font-bold uppercase tracking-wide text-white shadow-[0_8px_24px_rgba(255,59,31,0.32)] hover:bg-[var(--forge-accent-dark)]'
                            )}
                        >
                            Crear cuenta
                            <ArrowRight className="ms-2 size-4" />
                        </Link>
                        <Link
                            href="#rutinas"
                            className={cn(
                                buttonVariants({ variant: 'outline', size: 'lg' }),
                                'forge-font-mono inline-flex justify-center rounded-full border-[var(--forge-border-strong)] bg-[var(--forge-surface)] text-[var(--forge-ink)] hover:bg-[var(--forge-surface-alt)]'
                            )}
                        >
                            <Radio className="me-2 size-4 text-[var(--forge-accent)]" />
                            Ver producto
                        </Link>
                    </motion.div>
                </div>

                <div className="lg:col-span-5">
                    <ForgeHeroAppShowcase />
                </div>
            </div>
        </section>
    )
}
