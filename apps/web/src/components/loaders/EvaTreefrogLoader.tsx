'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'
import styles from './EvaTreefrogLoader.module.css'

export type EvaTreefrogLoaderProps = {
    /** Texto secundario bajo las letras (p. ej. en shells de carga) */
    subtitle?: string
    /** Tamaño reducido para la franja superior híbrida */
    compact?: boolean
    /** Solo en demo: párrafo con enlace a uiverse (MIT) */
    showAttribution?: boolean
    className?: string
}

/**
 * Variante EVA del loader tipo uiverse (SelfMadeSystem / pretty-treefrog-77).
 * Tres SVG: E, V y A con la misma animación dash (sin rotar la V).
 * Atribución MIT/uiverse: comentario en este archivo y en el CSS module; UI vía `showAttribution`.
 */
export function EvaTreefrogLoader({
    subtitle,
    compact = false,
    showAttribution = false,
    className,
}: EvaTreefrogLoaderProps) {
    const uid = useId().replace(/:/g, '')
    const gradB = `evaTreefrogGradB-${uid}`
    const gradC = `evaTreefrogGradC-${uid}`
    const gradD = `evaTreefrogGradD-${uid}`

    return (
        <div
            className={cn(styles.wrapper, compact && styles.compact, className)}
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-label="Cargando EVA"
        >
            {showAttribution ? (
                <p className="text-sm text-muted-foreground text-center max-w-md">
                    Prueba de animación (no indexar). Basado en{' '}
                    <a
                        href="https://uiverse.io/SelfMadeSystem/pretty-treefrog-77"
                        className="text-primary underline-offset-2 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                    >
                        uiverse.io/SelfMadeSystem/pretty-treefrog-77
                    </a>{' '}
                    (MIT) — letras redibujadas para EVA.
                </p>
            ) : null}
            <svg height={0} width={0} viewBox="0 0 64 64" className={styles.absolute} aria-hidden>
                <defs xmlns="http://www.w3.org/2000/svg">
                    <linearGradient id={gradB} gradientUnits="userSpaceOnUse" y2={2} x2={0} y1={62} x1={0}>
                        <stop stopColor="#973BED" />
                        <stop stopColor="#007CFF" offset={1} />
                    </linearGradient>
                    <linearGradient id={gradC} gradientUnits="userSpaceOnUse" y2={0} x2={0} y1={64} x1={0}>
                        <stop stopColor="#FFC800" />
                        <stop stopColor="#F0F" offset={1} />
                        <animateTransform
                            repeatCount="indefinite"
                            keySplines=".42,0,.58,1;.42,0,.58,1;.42,0,.58,1;.42,0,.58,1;.42,0,.58,1;.42,0,.58,1;.42,0,.58,1;.42,0,.58,1"
                            keyTimes="0; 0.125; 0.25; 0.375; 0.5; 0.625; 0.75; 0.875; 1"
                            dur="8s"
                            values="0 32 32;-270 32 32;-270 32 32;-540 32 32;-540 32 32;-810 32 32;-810 32 32;-1080 32 32;-1080 32 32"
                            type="rotate"
                            attributeName="gradientTransform"
                        />
                    </linearGradient>
                    <linearGradient id={gradD} gradientUnits="userSpaceOnUse" y2={2} x2={0} y1={62} x1={0}>
                        <stop stopColor="#00E0ED" />
                        <stop stopColor="#00DA72" offset={1} />
                    </linearGradient>
                </defs>
            </svg>

            <div className={styles.loader}>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 64 64"
                    height={64}
                    width={64}
                    className={styles.inlineBlock}
                    aria-hidden
                >
                    <path
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        strokeWidth={8}
                        stroke={`url(#${gradB})`}
                        className={styles.dash}
                        pathLength={360}
                        d="M 14 10 L 14 54 M 14 10 L 50 10 M 14 32 L 44 32 M 14 54 L 50 54"
                    />
                </svg>

                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 64 64"
                    height={64}
                    width={64}
                    className={styles.inlineBlock}
                    aria-hidden
                >
                    <path
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        strokeWidth={10}
                        stroke={`url(#${gradC})`}
                        className={styles.dash}
                        pathLength={360}
                        d="M 12 12 L 32 52 L 52 12"
                    />
                </svg>

                <div className={styles.spacer} aria-hidden />

                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 64 64"
                    height={64}
                    width={64}
                    className={styles.inlineBlock}
                    aria-hidden
                >
                    <path
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        strokeWidth={8}
                        stroke={`url(#${gradD})`}
                        className={styles.dash}
                        pathLength={360}
                        d="M 12 50 L 32 10 L 52 50 M 18 36 L 46 36"
                    />
                </svg>
            </div>

            {subtitle ? (
                <p className="text-muted-foreground text-center text-sm font-medium max-w-xs">{subtitle}</p>
            ) : null}
        </div>
    )
}
