'use client'

import { InfoTooltip } from '@/components/ui/info-tooltip'

/**
 * GLOSARIO ÚNICO de explicabilidad (key → texto en lenguaje llano).
 *
 * Fuente de verdad de "qué significa esta métrica" para toda la app coach.
 * Se consume vía <MetricInfo term="..." />. Añade nuevas keys aquí (y su título
 * en TERM_TITLES) — NO dupliques copys sueltos en cada pantalla.
 */
export const METRIC_GLOSSARY = {
    e1rm: '1RM estimado por fórmula Epley a partir de tus series.',
    rir: 'Reps en reserva: cuántas te quedaban antes del fallo; 0 = al fallo.',
    rpe: 'Esfuerzo percibido, escala 6-10; 10 = máximo.',
    tempo: 'Ritmo del movimiento en 4 dígitos: excéntrica-pausa-concéntrica-pausa, en segundos.',
    tonelaje: 'Volumen de carga = suma de peso × reps.',
    volumen: 'Suma de peso × reps por grupo muscular.',
    regresion: 'Ritmo de cambio estimado por regresión lineal sobre tus pesos.',
    proyeccion: 'Extrapolación lineal; una estimación, no una promesa.',
    imc: 'Índice de masa corporal = peso / altura².',
    tdee: 'Gasto energético total estimado (fórmula Mifflin-St Jeor).',
    adherencia: '% de cumplimiento; el de 30 días cuenta los días sin registro como 0.',
    score: 'Puntaje interno de atención; a mayor número, más urgente.',
} as const

export type MetricTerm = keyof typeof METRIC_GLOSSARY

/** Título corto que encabeza el popover (opcional, mejora el escaneo). */
const TERM_TITLES: Record<MetricTerm, string> = {
    e1rm: '1RM estimado',
    rir: 'RIR',
    rpe: 'RPE',
    tempo: 'Tempo',
    tonelaje: 'Tonelaje',
    volumen: 'Volumen',
    regresion: 'Regresión lineal',
    proyeccion: 'Proyección',
    imc: 'IMC',
    tdee: 'TDEE',
    adherencia: 'Adherencia',
    score: 'Score',
}

type MetricInfoProps = {
    /** Key del GLOSARIO. Renderiza el ícono de ayuda con la explicación llana. */
    term: MetricTerm
    className?: string
    iconClassName?: string
}

/**
 * Ícono de ayuda tappable (tap en touch, hover en desktop — reusa InfoTooltip,
 * que NO es hover-only) que muestra la explicación llana de una métrica.
 *
 *   <MetricInfo term="e1rm" />
 */
export function MetricInfo({ term, className, iconClassName }: MetricInfoProps) {
    return (
        <InfoTooltip
            title={TERM_TITLES[term]}
            content={METRIC_GLOSSARY[term]}
            className={className}
            iconClassName={iconClassName}
        />
    )
}
