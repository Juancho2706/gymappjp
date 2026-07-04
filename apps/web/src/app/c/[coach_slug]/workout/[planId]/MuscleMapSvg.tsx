'use client'

import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { muscleGroupsToRegionIntensity, type MuscleRegion } from './muscle-map'
import { BODY_SHAPES, BODY_VIEWBOX, type BodyShape } from './body-anatomy'

/**
 * Mapa muscular anatomico del resumen post-entreno.
 *
 * Reemplaza la silueta de "bloques redondeados" por paths anatomicos organicos
 * (frente + espalda) vendoreados de react-native-body-highlighter (MIT — ver
 * `body-anatomy.ts`). Cada region de EVA se tinta con la rampa del tema segun la
 * intensidad relativa de trabajo (0..1). Se alimenta del trabajo por grupo que el
 * overlay ya tiene en memoria (fuerza kg + proxy movilidad/roller, cardio excluido)
 * — cero queries. Contrato de props intacto.
 *
 * Intensidad: 4 niveles sobre `rgba(var(--theme-primary-rgb), a)`. El nivel maximo
 * ademas lleva stroke marcado (accesibilidad: no solo color). Cuerpo base gris
 * neutro theme-aware. Leyenda de niveles + aria-label por region con el nivel.
 */

const REGION_LABEL: Record<MuscleRegion, string> = {
    pecho: 'Pecho',
    espalda: 'Espalda',
    hombros: 'Hombros',
    brazos: 'Brazos',
    core: 'Core',
    gluteos: 'Glúteos',
    cuadriceps: 'Cuádriceps',
    isquios: 'Isquios',
    gemelos: 'Gemelos',
}

// Alfa por nivel de intensidad (1 = menos, 4 = mas). Base del tema via --theme-primary-rgb.
const TIER_ALPHA: Record<1 | 2 | 3 | 4, number> = { 1: 0.18, 2: 0.38, 3: 0.62, 4: 0.92 }

/** Nivel discreto 0..4 a partir de la intensidad relativa continua 0..1. */
function tierOf(t: number): 0 | 1 | 2 | 3 | 4 {
    if (t <= 0) return 0
    if (t <= 0.25) return 1
    if (t <= 0.5) return 2
    if (t <= 0.75) return 3
    return 4
}

// Agrupa los shapes vendoreados por region una sola vez (BODY_SHAPES es estatico).
const NEUTRAL_SHAPES: BodyShape[] = BODY_SHAPES.filter((s) => s.region === null)
const REGION_SHAPES: Record<MuscleRegion, BodyShape[]> = (() => {
    const acc = {} as Record<MuscleRegion, BodyShape[]>
    for (const r of Object.keys(REGION_LABEL) as MuscleRegion[]) acc[r] = []
    for (const s of BODY_SHAPES) {
        if (s.region) acc[s.region].push(s)
    }
    return acc
})()

const REGION_ORDER = Object.keys(REGION_LABEL) as MuscleRegion[]

export interface MuscleMapSvgProps {
    /**
     * Trabajo por grupo muscular (ES) — el overlay ya lo calcula. Combina volumen de fuerza (kg) con
     * el proxy de movilidad/roller (cardio excluido), de modo que la intensidad es RELATIVA, no kg.
     */
    groups: { group: string; vol: number }[]
    reducedMotion?: boolean | null
}

export function MuscleMapSvg({ groups, reducedMotion }: MuscleMapSvgProps) {
    const intensity = useMemo(() => muscleGroupsToRegionIntensity(groups), [groups])

    const workedRegions = useMemo(
        () => REGION_ORDER.filter((r) => intensity[r] > 0).sort((a, b) => intensity[b] - intensity[a]),
        [intensity],
    )

    const ariaLabel =
        workedRegions.length > 0
            ? `Músculos trabajados: ${workedRegions.map((r) => REGION_LABEL[r]).join(', ')}`
            : 'Músculos trabajados'

    let litIndex = 0

    return (
        <div className="eva-muscle-map">
            {/* Neutro theme-aware para el cuerpo base (dark-inmersivo por defecto, light si el
                overlay se reusa en tema claro). Los musculos trabajados usan la rampa del tema. */}
            <style>{`
                .eva-muscle-map {
                    --mm-neutral-fill: rgba(255,255,255,0.055);
                    --mm-neutral-stroke: rgba(255,255,255,0.10);
                }
                @media (prefers-color-scheme: light) {
                    .eva-muscle-map {
                        --mm-neutral-fill: rgba(15,23,42,0.06);
                        --mm-neutral-stroke: rgba(15,23,42,0.14);
                    }
                }
                :root[data-theme='dark'] .eva-muscle-map {
                    --mm-neutral-fill: rgba(255,255,255,0.055);
                    --mm-neutral-stroke: rgba(255,255,255,0.10);
                }
                :root[data-theme='light'] .eva-muscle-map {
                    --mm-neutral-fill: rgba(15,23,42,0.06);
                    --mm-neutral-stroke: rgba(15,23,42,0.14);
                }
            `}</style>

            <svg
                viewBox={BODY_VIEWBOX}
                className="w-full h-auto max-h-[260px]"
                role="img"
                aria-label={ariaLabel}
            >
                {/* Cuerpo base neutro (cuello / cabeza / manos / rodillas / tobillos / pies). */}
                <g fill="var(--mm-neutral-fill)" stroke="var(--mm-neutral-stroke)" strokeWidth={2}>
                    {NEUTRAL_SHAPES.map((s, i) => (
                        <path key={`n${i}`} d={s.d} />
                    ))}
                </g>

                {/* Una <g> por region, tintada segun intensidad. Regiones sin trabajo = neutro. */}
                {REGION_ORDER.map((region) => {
                    const t = intensity[region]
                    const tier = tierOf(t)
                    const worked = tier > 0
                    const shapes = REGION_SHAPES[region]

                    if (!worked) {
                        return (
                            <g
                                key={region}
                                fill="var(--mm-neutral-fill)"
                                stroke="var(--mm-neutral-stroke)"
                                strokeWidth={2}
                            >
                                {shapes.map((s, i) => (
                                    <path key={i} d={s.d} />
                                ))}
                            </g>
                        )
                    }

                    const litTier = tier as 1 | 2 | 3 | 4 // worked ⇒ tier ∈ 1..4
                    const fill = `rgba(var(--theme-primary-rgb), ${TIER_ALPHA[litTier]})`
                    // Nivel maximo: stroke marcado del tema (canal no-cromatico de accesibilidad).
                    const isMax = litTier === 4
                    const stroke = isMax
                        ? 'rgba(var(--theme-primary-rgb), 1)'
                        : 'rgba(var(--theme-primary-rgb), 0.45)'
                    const strokeWidth = isMax ? 6 : 2
                    const delay = reducedMotion ? 0 : 0.16 + 0.05 * litIndex++

                    return (
                        <motion.g
                            key={region}
                            role="img"
                            aria-label={`${REGION_LABEL[region]}, intensidad ${litTier} de 4`}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                            initial={reducedMotion ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={reducedMotion ? { duration: 0 } : { duration: 0.36, delay }}
                        >
                            {shapes.map((s, i) => (
                                <path key={i} d={s.d} />
                            ))}
                        </motion.g>
                    )
                })}

                <g
                    fill="var(--on-dark-muted, rgba(255,255,255,0.55))"
                    fontSize={44}
                    fontWeight={700}
                    textAnchor="middle"
                    style={{ letterSpacing: '0.08em' }}
                >
                    <text x={362} y={1440}>FRENTE</text>
                    <text x={1086} y={1440}>ESPALDA</text>
                </g>
            </svg>

            {/* Leyenda de niveles (menos → mas). El ultimo lleva anillo = nivel maximo (stroke). */}
            <div className="mt-1 flex items-center justify-center gap-2 text-[10px] text-on-dark-muted">
                <span className="uppercase tracking-widest">Menos</span>
                <div className="flex items-center gap-1" aria-hidden="true">
                    {([1, 2, 3, 4] as const).map((lvl) => (
                        <span
                            key={lvl}
                            className="h-3 w-4 rounded-[3px]"
                            style={{
                                backgroundColor: `rgba(var(--theme-primary-rgb), ${TIER_ALPHA[lvl]})`,
                                boxShadow:
                                    lvl === 4 ? 'inset 0 0 0 1.5px rgba(var(--theme-primary-rgb), 1)' : 'none',
                            }}
                        />
                    ))}
                </div>
                <span className="uppercase tracking-widest">Más</span>
            </div>
        </div>
    )
}
