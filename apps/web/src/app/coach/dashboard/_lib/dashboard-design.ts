import type { AttentionFlag } from '../_data/types'

/**
 * Short flag labels matching the EVA design source (coach-dashboard.jsx FLAG_LABEL).
 * The risk card subtitle uses these compact strings (not the verbose query labels).
 */
export const FLAG_LABEL: Record<AttentionFlag, string> = {
    SIN_CHECKIN_1M: 'Sin check-in en 1 mes',
    SIN_EJERCICIO_7D: 'Sin ejercicio en 7 días',
    NUTRICION_RIESGO: 'Nutrición en riesgo',
    PROGRAMA_VENCIDO: 'Programa vencido',
    PROGRAMA_POR_VENCER: 'Programa por vencer',
    FUERZA_CAYENDO: 'Fuerza cayendo',
}

export function flagLabel(flag: AttentionFlag | undefined): string {
    return flag ? FLAG_LABEL[flag] : 'Seguimiento recomendado'
}

export interface RiskBand {
    label: string
    color: string
}

/**
 * P5 — risk band: label + color (not color alone). Fixed on-dark colors because the
 * priority card is always inverse (dark), so we don't use theme-flipping tokens.
 * Verbatim from coach-dashboard.jsx riskBand().
 */
export function riskBand(score: number): RiskBand {
    if (score >= 80) return { label: 'Riesgo alto', color: '#FF7C97' }
    if (score >= 50) return { label: 'Riesgo medio', color: '#FFC861' }
    return { label: 'Seguimiento', color: 'var(--text-on-dark-muted)' }
}

/** Capitalized, localized "weekday, day month" — matches the design header date. */
export function todayLabel(): string {
    const s = new Date().toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    })
    return s.charAt(0).toUpperCase() + s.slice(1)
}
