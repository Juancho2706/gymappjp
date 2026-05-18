'use client'

import { useId, useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'

export type CalloutItem = {
    titleKey: string
    bodyKey: string
}

type LandingCalloutShowcaseProps = {
    id?: string
    eyebrowKey: string
    titleKey: string
    left: CalloutItem[]
    right: CalloutItem[]
    /** Paths en viewBox 0 0 100 100 (stroke en “unidades” del viewBox) */
    svgPaths: string[]
    children: React.ReactNode
    className?: string
}

export type CalloutShowcaseBodyProps = {
    left: CalloutItem[]
    right: CalloutItem[]
    svgPaths: string[]
    children: React.ReactNode
    /** Espaciado superior del bloque mock + callouts (p. ej. en pestañas) */
    className?: string
}

function CalloutPanel({
    item,
    align,
    active,
    onActivate,
    onDeactivate,
}: {
    item: CalloutItem
    align: 'left' | 'right'
    active: boolean
    onActivate: () => void
    onDeactivate: () => void
}) {
    const { t } = useTranslation()
    return (
        <div
            role="group"
            tabIndex={0}
            onMouseEnter={onActivate}
            onMouseLeave={onDeactivate}
            onFocus={onActivate}
            onBlur={onDeactivate}
            className={cn(
                'rounded-xl border bg-card/95 p-4 shadow-sm transition-all duration-200 dark:bg-card/90',
                align === 'left' && 'text-left',
                align === 'right' && 'text-right',
                active ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border'
            )}
        >
            <h3 className="text-sm font-bold text-foreground">{t(item.titleKey)}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t(item.bodyKey)}</p>
        </div>
    )
}

export function CalloutShowcaseBody({ left, right, svgPaths, children, className }: CalloutShowcaseBodyProps) {
    const uid = useId()
    const { t } = useTranslation()
    const [activeIdx, setActiveIdx] = useState<number | null>(null)

    const mobileItems = [...left.map((c) => ({ ...c, side: 'left' as const })), ...right.map((c) => ({ ...c, side: 'right' as const }))]

    return (
        <div className={cn('w-full', className)}>
            <div className="lg:hidden">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="mx-auto mb-10 max-w-md px-1 sm:px-0"
                >
                    {children}
                </motion.div>
                <ul className="mx-auto max-w-xl space-y-5 px-1 sm:px-2">
                    {mobileItems.map((item, i) => (
                        <li key={`${item.titleKey}-${i}`} className="border-l-2 border-primary/35 py-0.5 pl-4">
                            <h3 className="text-sm font-bold text-foreground">{t(item.titleKey)}</h3>
                            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t(item.bodyKey)}</p>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="relative hidden min-h-[380px] lg:grid lg:grid-cols-[minmax(220px,1fr)_minmax(320px,480px)_minmax(220px,1fr)] lg:items-center lg:gap-6">
                <svg
                    className="pointer-events-none absolute inset-0 z-0 h-full w-full text-muted-foreground/45 dark:text-muted-foreground/35"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden
                >
                    {svgPaths.map((d, i) => (
                        <path
                            key={`${uid}-${i}`}
                            d={d}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="0.5"
                            vectorEffect="non-scaling-stroke"
                            className={cn(
                                'transition-opacity duration-300',
                                activeIdx === null || activeIdx === i ? 'opacity-100' : 'opacity-[0.35]'
                            )}
                        />
                    ))}
                </svg>

                <div className="relative z-10 flex flex-col justify-center gap-8 py-4">
                    {left.map((item, i) => (
                        <CalloutPanel
                            key={item.titleKey}
                            item={item}
                            align="left"
                            active={activeIdx === i}
                            onActivate={() => setActiveIdx(i)}
                            onDeactivate={() => setActiveIdx(null)}
                        />
                    ))}
                </div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true, margin: '-20px' }}
                    transition={{ duration: 0.45 }}
                    className="relative z-10 mx-auto w-full max-w-[480px]"
                >
                    {children}
                </motion.div>

                <div className="relative z-10 flex flex-col justify-center gap-8 py-4">
                    {right.map((item, i) => (
                        <CalloutPanel
                            key={item.titleKey}
                            item={item}
                            align="right"
                            active={activeIdx === left.length + i}
                            onActivate={() => setActiveIdx(left.length + i)}
                            onDeactivate={() => setActiveIdx(null)}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}

export function LandingCalloutShowcase({
    id,
    eyebrowKey,
    titleKey,
    left,
    right,
    svgPaths,
    children,
    className,
}: LandingCalloutShowcaseProps) {
    const { t } = useTranslation()

    return (
        <section
            id={id}
            className={cn(
                'scroll-mt-28 border-t border-border/50 py-16 sm:py-20 lg:py-24',
                'landing-section-alt w-full',
                className
            )}
        >
            <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6">
                <motion.header
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    className="mb-10 max-w-2xl"
                >
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {t(eyebrowKey)}
                    </span>
                    <h2 className="font-display text-2xl font-black tracking-tight text-foreground sm:text-3xl md:text-4xl">
                        {t(titleKey)}
                    </h2>
                </motion.header>

                <CalloutShowcaseBody left={left} right={right} svgPaths={svgPaths}>
                    {children}
                </CalloutShowcaseBody>
            </div>
        </section>
    )
}
