'use client'

import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { muscleGroupsToRegionIntensity, type MuscleRegion } from './muscle-map'

/**
 * Silueta humana estilizada (frente + espalda) para el resumen post-entreno (Fase M5).
 * Pinta las regiones trabajadas hoy en la rampa `--sport` según intensidad relativa por
 * volumen. Dark-inmersivo, trazos on-dark (NO theme-aware, decisión firme). NO anatómica:
 * bloques redondeados por región. Se alimenta del desglose de volumen que el overlay ya
 * tiene en memoria — cero queries.
 */

type Shape = {
    region: MuscleRegion
    /** Rect redondeado (x,y = esquina; en unidades del viewBox). */
    x: number
    y: number
    w: number
    h: number
    rx: number
}

// viewBox 0 0 232 214. Frente centrada en x≈58, espalda en x≈162.
const FRONT_SHAPES: Shape[] = [
    // Hombros
    { region: 'hombros', x: 37, y: 34, w: 13, h: 12, rx: 6 },
    { region: 'hombros', x: 66, y: 34, w: 13, h: 12, rx: 6 },
    // Pecho
    { region: 'pecho', x: 44, y: 47, w: 13, h: 13, rx: 4 },
    { region: 'pecho', x: 59, y: 47, w: 13, h: 13, rx: 4 },
    // Brazos (bíceps + antebrazo, ambos lados)
    { region: 'brazos', x: 30, y: 46, w: 9, h: 26, rx: 4 },
    { region: 'brazos', x: 28, y: 73, w: 8, h: 20, rx: 4 },
    { region: 'brazos', x: 77, y: 46, w: 9, h: 26, rx: 4 },
    { region: 'brazos', x: 80, y: 73, w: 8, h: 20, rx: 4 },
    // Core / abdomen
    { region: 'core', x: 48, y: 61, w: 20, h: 24, rx: 5 },
    // Cuádriceps
    { region: 'cuadriceps', x: 46, y: 92, w: 13, h: 34, rx: 6 },
    { region: 'cuadriceps', x: 57, y: 92, w: 13, h: 34, rx: 6 },
    // Gemelos (frente)
    { region: 'gemelos', x: 47, y: 130, w: 11, h: 30, rx: 5 },
    { region: 'gemelos', x: 58, y: 130, w: 11, h: 30, rx: 5 },
]

const BACK_SHAPES: Shape[] = [
    // Brazos (tríceps + antebrazo, ambos lados)
    { region: 'brazos', x: 134, y: 46, w: 9, h: 26, rx: 4 },
    { region: 'brazos', x: 132, y: 73, w: 8, h: 20, rx: 4 },
    { region: 'brazos', x: 181, y: 46, w: 9, h: 26, rx: 4 },
    { region: 'brazos', x: 184, y: 73, w: 8, h: 20, rx: 4 },
    // Espalda (trapecios / dorsales / lumbar)
    { region: 'espalda', x: 146, y: 33, w: 32, h: 13, rx: 6 },
    { region: 'espalda', x: 148, y: 48, w: 28, h: 24, rx: 5 },
    { region: 'espalda', x: 152, y: 73, w: 20, h: 12, rx: 4 },
    // Glúteos
    { region: 'gluteos', x: 150, y: 88, w: 13, h: 16, rx: 6 },
    { region: 'gluteos', x: 161, y: 88, w: 13, h: 16, rx: 6 },
    // Isquios
    { region: 'isquios', x: 150, y: 106, w: 13, h: 32, rx: 6 },
    { region: 'isquios', x: 161, y: 106, w: 13, h: 32, rx: 6 },
    // Gemelos (espalda)
    { region: 'gemelos', x: 151, y: 142, w: 11, h: 30, rx: 5 },
    { region: 'gemelos', x: 162, y: 142, w: 11, h: 30, rx: 5 },
]

const ALL_SHAPES = [...FRONT_SHAPES, ...BACK_SHAPES]

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

/** Head + neck neutrales (no son región muscular) — sostienen la lectura de "cuerpo". */
function NeutralBody() {
    return (
        <g fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.08)" strokeWidth={1}>
            {/* Frente */}
            <circle cx={58} cy={18} r={11} />
            <rect x={53} y={27} width={10} height={7} rx={3} />
            {/* Espalda */}
            <circle cx={162} cy={18} r={11} />
            <rect x={157} y={27} width={10} height={7} rx={3} />
        </g>
    )
}

export interface MuscleMapSvgProps {
    /** Desglose de volumen por grupo muscular (ES) — el overlay ya lo calcula. */
    groups: { group: string; vol: number }[]
    reducedMotion?: boolean | null
}

export function MuscleMapSvg({ groups, reducedMotion }: MuscleMapSvgProps) {
    const intensity = useMemo(() => muscleGroupsToRegionIntensity(groups), [groups])

    const workedRegions = useMemo(
        () =>
            (Object.keys(REGION_LABEL) as MuscleRegion[])
                .filter((r) => intensity[r] > 0)
                .sort((a, b) => intensity[b] - intensity[a]),
        [intensity],
    )

    const ariaLabel =
        workedRegions.length > 0
            ? `Músculos trabajados: ${workedRegions.map((r) => REGION_LABEL[r]).join(', ')}`
            : 'Músculos trabajados'

    // Delay incremental solo para las regiones que se encienden (pintado con stagger tenue).
    let litIndex = 0

    return (
        <svg
            viewBox="0 0 232 214"
            className="w-full h-auto max-h-[220px]"
            role="img"
            aria-label={ariaLabel}
        >
            <NeutralBody />
            {ALL_SHAPES.map((s, i) => {
                const t = intensity[s.region]
                const worked = t > 0
                if (!worked) {
                    return (
                        <rect
                            key={i}
                            x={s.x}
                            y={s.y}
                            width={s.w}
                            height={s.h}
                            rx={s.rx}
                            fill="rgba(255,255,255,0.045)"
                            stroke="rgba(255,255,255,0.08)"
                            strokeWidth={1}
                        />
                    )
                }
                const targetOpacity = 0.24 + 0.72 * t
                const delay = reducedMotion ? 0 : 0.18 + 0.045 * litIndex++
                return (
                    <motion.rect
                        key={i}
                        x={s.x}
                        y={s.y}
                        width={s.w}
                        height={s.h}
                        rx={s.rx}
                        fill="var(--sport-500)"
                        stroke="var(--sport-400)"
                        strokeWidth={1}
                        style={{ transformOrigin: `${s.x + s.w / 2}px ${s.y + s.h / 2}px` }}
                        initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }}
                        animate={{ opacity: targetOpacity, scale: 1 }}
                        transition={reducedMotion ? { duration: 0 } : { duration: 0.34, delay }}
                    />
                )
            })}
            <g
                fill="var(--on-dark-muted, rgba(255,255,255,0.55))"
                fontSize={9}
                fontWeight={700}
                textAnchor="middle"
                style={{ letterSpacing: '0.08em' }}
            >
                <text x={58} y={206}>FRENTE</text>
                <text x={162} y={206}>ESPALDA</text>
            </g>
        </svg>
    )
}
