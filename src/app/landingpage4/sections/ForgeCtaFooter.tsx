'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { ForgeBrandLogo } from '../ForgeBrandLogo'
import { ForgeWordmark } from '../ForgeWordmark'

const quickLinks = [
    { href: '#rutinas', label: 'Producto' },
    { href: '#planes', label: 'Planes' },
    { href: '#faq', label: 'FAQ' },
    { href: '/landingpage4/pruebavistacoach', label: 'Demo coach' },
    { href: '/landingpage4/pruebavistaalumno', label: 'Demo alumno' },
] as const

const footerLinks: { href: string; label: string }[] = [
    { href: '/legal', label: 'Legal' },
    { href: '/privacidad', label: 'Privacidad' },
    { href: '/pricing', label: 'Precios' },
    { href: '/', label: 'Sitio principal' },
    { href: '/landingpage4/pruebavistacoach', label: 'Demo coach' },
    { href: '/landingpage4/pruebavistaalumno', label: 'Demo alumno' },
    { href: '#faq', label: 'Preguntas' },
]

export function ForgeCtaFooter() {
    const reduce = useReducedMotion()

    return (
        <>
            <section id="cta" className="mx-auto w-full max-w-7xl px-5 pb-10 md:px-12 lg:px-20">
                <motion.div
                    initial={reduce ? false : { opacity: 0, scale: 0.97 }}
                    whileInView={reduce ? undefined : { opacity: 1, scale: 1 }}
                    viewport={{ once: true, margin: '-10%' }}
                    transition={{ duration: 0.45 }}
                    className="forge-brutal-shadow rounded-[12px] border-2 border-[var(--forge-ink)] bg-[var(--forge-surface)] p-6 sm:p-10"
                >
                    <div className="flex flex-col items-center gap-6 text-center md:flex-row md:text-left">
                        <ForgeBrandLogo variant="footer" className="shrink-0" />
                        <div className="flex-1">
                            <h3 className="forge-font-display text-xl font-black text-[var(--forge-ink)] sm:text-2xl">Listo para desplegar</h3>
                            <p className="mt-2 text-sm text-[var(--forge-ink-2)]">
                                Registrate o probá las vitrinas de interfaz sin cuenta.
                            </p>
                            <ul className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-[var(--forge-muted)] md:justify-start">
                                {['Rutinas', 'Nutrición por plan', 'Check-ins', 'PWA'].map((x) => (
                                    <li key={x} className="flex items-center gap-1.5">
                                        <Check className="size-3.5 shrink-0 text-[var(--forge-accent)]" />
                                        {x}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:w-auto">
                            <Link
                                href="/register?tier=pro&cycle=monthly"
                                className={cn(
                                    buttonVariants({ size: 'lg' }),
                                    'forge-font-mono justify-center bg-[var(--forge-accent)] text-white hover:bg-[var(--forge-accent-dark)]'
                                )}
                            >
                                Registrar
                            </Link>
                            <Link
                                href="/login"
                                className={cn(
                                    buttonVariants({ variant: 'outline', size: 'lg' }),
                                    'forge-font-mono justify-center border-[var(--forge-border)] text-[var(--forge-ink)]'
                                )}
                            >
                                Login coach
                            </Link>
                        </div>
                    </div>

                    <nav
                        className="forge-font-mono mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-[var(--forge-border)] pt-6 text-[11px] uppercase tracking-wider md:justify-start"
                        aria-label="Atajos de la vitrina"
                    >
                        {quickLinks.map((l) => (
                            <Link
                                key={l.href}
                                href={l.href}
                                className="text-[var(--forge-muted)] underline-offset-4 transition-colors hover:text-[var(--forge-accent)] hover:underline"
                            >
                                {l.label}
                            </Link>
                        ))}
                    </nav>
                </motion.div>
            </section>

            <footer className="border-t border-[var(--forge-border)] px-5 py-10 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-12 lg:px-20">
                <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
                    <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
                        <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-center sm:gap-4">
                            <ForgeWordmark size="footer" withSubtitle={false} />
                            <p className="max-w-md text-sm leading-snug text-[var(--forge-ink-2)]">
                                EVA · plataforma para coaches y alumnos. Cobro al coach; el alumno usa tu app con tu marca.
                            </p>
                        </div>
                        <p className="forge-font-mono text-[10px] uppercase tracking-wider text-[var(--forge-muted)]">
                            Vitrina FORGE · Three.js ·{' '}
                            <Link href="/landingpage4" className="text-[var(--forge-accent)] hover:underline">
                                /landingpage4
                            </Link>
                        </p>
                    </div>

                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-[var(--forge-border)] pt-6 sm:justify-between">
                        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-[var(--forge-muted)]">
                            {footerLinks.map((l) => (
                                <Link key={l.href} href={l.href} className="hover:text-[var(--forge-ink)]">
                                    {l.label}
                                </Link>
                            ))}
                            <a href="mailto:contacto@eva-app.cl" className="hover:text-[var(--forge-ink)]">
                                contacto@eva-app.cl
                            </a>
                        </div>
                    </div>
                </div>
            </footer>
        </>
    )
}
