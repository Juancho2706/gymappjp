'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { formatWeightEsCl, type PrKind } from '@eva/workout-engine'

/**
 * Ejecutor V3 (E4.2) — PR EN VIVO. Traducción del mockup `concepto-a-v32-momentos` (pantalla "PR en
 * vivo"): banner inline con medalla + micro-confetti dorado de UNA oleada + chip "Anterior" tachado con
 * flecha arriba. NO es un modal y NO corta el flujo: la fila sigue debajo, el banner se auto-descarta
 * (~1,5 s, lo controla el padre `LogSetForm`). El dorado es un token PROPIO del PR (`--exec-pr`), no la
 * marca del coach ni el acento de zona.
 *
 * reduced-motion: sin confetti ni overshoot — sólo un fade del banner (contrato `motion-tokens`). El eje
 * (`kind`) viene del engine (`detectPR` vía `pr-adapter`) y sólo matiza el rótulo (récord de peso vs 1RM).
 */

/** Oleada única de confetti dorado (posiciones fijas, decorativo — off en reduced-motion). */
const PR_CONFETTI = [
    { x: -30, y: -22, c: 'var(--exec-pr)', d: 0 },
    { x: 34, y: -20, c: '#ffe08a', d: 0.08 },
    { x: 62, y: -14, c: 'var(--exec-pr)', d: 0.16 },
    { x: -12, y: -30, c: '#fff3cf', d: 0.04 },
    { x: 14, y: -28, c: 'var(--exec-pr)', d: 0.2 },
    { x: -52, y: -10, c: '#ffe08a', d: 0.12 },
    { x: 48, y: -26, c: 'var(--exec-pr)', d: 0.24 },
]

export interface PrCelebrationProps {
    /** Peso del PR (kg) — encabeza el banner "¡PR! {kg} kg — tu mejor marca". */
    kg: number
    /** Mejor marca anterior (kg) — chip "Anterior {prev} kg" tachado con flecha arriba. */
    prevKg: number
    /** Eje del récord del engine (weight/e1rm). Sólo matiza el rótulo. */
    kind: PrKind
}

export function PrCelebration({ kg, prevKg, kind }: PrCelebrationProps) {
    const reducedMotion = useReducedMotion()
    return (
        <motion.div
            className="exec-pr-cel"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            transition={reducedMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 460, damping: 26 }}
            role="status"
            aria-live="polite"
        >
            {!reducedMotion && (
                <span className="exec-pr-confetti" aria-hidden>
                    {PR_CONFETTI.map((c, i) => (
                        <span
                            key={i}
                            className="exec-pr-conf"
                            style={
                                {
                                    '--cx': `${c.x}px`,
                                    '--cy': `${c.y}px`,
                                    '--cd': `${c.d}s`,
                                    background: c.c,
                                } as React.CSSProperties
                            }
                        />
                    ))}
                </span>
            )}

            <span className="exec-pr-banner">
                <span className="exec-pr-medal" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                        <path d="M12 2.2l2.72 5.51 6.08.88-4.4 4.29 1.04 6.05L12 16.09l-5.44 2.83 1.04-6.05-4.4-4.29 6.08-.88z" />
                    </svg>
                </span>
                <span className="exec-pr-txt">
                    <span className="exec-pr-k">¡PR! {kind === 'e1rm' ? 'Mejor 1RM' : 'Nuevo récord'}</span>
                    <span className="exec-pr-v tabular-nums">
                        {formatWeightEsCl(kg)} kg <small>— tu mejor marca</small>
                    </span>
                </span>
            </span>

            <span className="exec-pr-prev">
                <span className="exec-pr-prev-l">Anterior</span>
                <span className="exec-pr-prev-r tabular-nums">{formatWeightEsCl(prevKg)} kg</span>
                <span className="exec-pr-up" aria-hidden />
                <span className="exec-pr-sup">Superado</span>
            </span>
        </motion.div>
    )
}
