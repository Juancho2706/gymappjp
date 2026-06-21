'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'
import type { LoaderVariant } from '@/lib/brand-loaders'
import styles from './loader-variants.module.css'

export type LoaderVariantProps = {
    brandName?: string
    iconSrc?: string
    subtitle?: string
    /** Tamaño del wordmark/ícono. */
    size?: 'md' | 'lg'
}

const WORD = 'text-3xl sm:text-4xl'
const WORD_MD = 'text-2xl sm:text-3xl'

function Wordmark({ brandName, size }: { brandName?: string; size?: 'md' | 'lg' }) {
    const text = (brandName?.trim() || 'EVA').toUpperCase()
    return (
        <span className={cn(styles.wordmark, 'font-display', size === 'md' ? WORD_MD : WORD)}>{text}</span>
    )
}

function Icon({ iconSrc, px = 48 }: { iconSrc?: string; px?: number }) {
    if (!iconSrc) return null
    return (
        <Image src={iconSrc} alt="" width={px} height={px} priority={false} className={styles.icon} style={{ width: px, height: px }} />
    )
}

function Caption({ subtitle }: { subtitle?: string }) {
    if (!subtitle) return null
    return <p className={styles.caption}>{subtitle}</p>
}

/* ── 01 · progreso ── */
function ProgresoLoader({ brandName, iconSrc, subtitle, size }: LoaderVariantProps) {
    return (
        <div className={styles.wrap}>
            <div className={styles.ringBox}>
                <svg viewBox="0 0 120 120" className={cn(styles.absSvg, styles.spinSlow)} aria-hidden>
                    <circle cx="60" cy="60" r="54" fill="none" stroke="rgb(var(--ld-rgb) / 0.18)" strokeWidth="1.5" strokeDasharray="2 7" strokeLinecap="round" />
                </svg>
                <Icon iconSrc={iconSrc} />
            </div>
            <div className="flex flex-col items-center gap-3">
                <Wordmark brandName={brandName} size={size} />
                <div className={styles.bar}><div className={styles.barFill} /></div>
                <Caption subtitle={subtitle} />
            </div>
        </div>
    )
}

/* ── 02 · anillo ── */
function AnilloLoader({ brandName, iconSrc, subtitle, size }: LoaderVariantProps) {
    return (
        <div className={styles.wrap}>
            <div className={styles.ringBox}>
                <svg viewBox="0 0 120 120" className={cn(styles.absSvg, styles.spin)} aria-hidden>
                    <circle cx="60" cy="60" r="50" fill="none" stroke="rgb(var(--ld-rgb) / 0.12)" strokeWidth="5" />
                    <circle className={styles.dash} cx="60" cy="60" r="50" fill="none" stroke="var(--ld-brand)" strokeWidth="5" strokeLinecap="round" strokeDasharray="314" />
                </svg>
                <Icon iconSrc={iconSrc} />
            </div>
            <Wordmark brandName={brandName} size={size} />
            <Caption subtitle={subtitle} />
        </div>
    )
}

/* ── 03 · radar ── */
function RadarLoader({ brandName, iconSrc, subtitle, size }: LoaderVariantProps) {
    return (
        <div className={styles.wrap}>
            <div className={styles.ringBox}>
                <span className={styles.ping} />
                <span className={cn(styles.ping, styles.ping2)} />
                <span className={cn(styles.ping, styles.ping3)} />
                <span className={styles.radarCore}><Icon iconSrc={iconSrc} px={28} /></span>
            </div>
            <Wordmark brandName={brandName} size={size} />
            <Caption subtitle={subtitle} />
        </div>
    )
}

/* ── 04 · cometa ── */
function CometaLoader({ brandName, iconSrc, subtitle, size }: LoaderVariantProps) {
    return (
        <div className={styles.wrap}>
            <div className={styles.ringBox}>
                <div className={styles.conic} />
                <Icon iconSrc={iconSrc} />
            </div>
            <Wordmark brandName={brandName} size={size} />
            <Caption subtitle={subtitle} />
        </div>
    )
}

/* ── 05 · ritmo ── */
function RitmoLoader({ brandName, subtitle, size }: LoaderVariantProps) {
    return (
        <div className={styles.wrap}>
            <div className={styles.eq}>
                {[0, 0.18, 0.36, 0.54, 0.72].map((d, i) => (
                    <span key={i} className={styles.eqBar} style={{ animationDelay: `${d}s` }} />
                ))}
            </div>
            <Wordmark brandName={brandName} size={size} />
            <Caption subtitle={subtitle} />
        </div>
    )
}

/* ── 06 · orbitas ── */
function OrbitasLoader({ brandName, iconSrc, subtitle, size }: LoaderVariantProps) {
    return (
        <div className={styles.wrap}>
            <div className={styles.ringBox}>
                <svg viewBox="0 0 120 120" className={cn(styles.absSvg, styles.arcA)} aria-hidden>
                    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--ld-brand)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="82 245" />
                </svg>
                <svg viewBox="0 0 120 120" className={cn(styles.absSvg, styles.arcB)} aria-hidden>
                    <circle cx="60" cy="60" r="40" fill="none" stroke="rgb(var(--ld-rgb) / 0.45)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="63 188" />
                </svg>
                <Icon iconSrc={iconSrc} px={40} />
            </div>
            <Wordmark brandName={brandName} size={size} />
            <Caption subtitle={subtitle} />
        </div>
    )
}

const REGISTRY: Record<Exclude<LoaderVariant, 'eva'>, (p: LoaderVariantProps) => React.ReactElement> = {
    progreso: ProgresoLoader,
    anillo: AnilloLoader,
    radar: RadarLoader,
    cometa: CometaLoader,
    ritmo: RitmoLoader,
    orbitas: OrbitasLoader,
}

/** Renderiza la variante elegida. `eva` (default) lo maneja el caller (EvaRouteLoader actual). */
export function LoaderVariantView({ variant, ...props }: LoaderVariantProps & { variant: Exclude<LoaderVariant, 'eva'> }) {
    const Cmp = REGISTRY[variant]
    return <Cmp {...props} />
}
