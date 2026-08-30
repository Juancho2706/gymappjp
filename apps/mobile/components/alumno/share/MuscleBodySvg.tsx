import { useMemo } from 'react'
import Svg, { G, Path, Text as SvgText } from 'react-native-svg'
import {
    BODY_SHAPES,
    BODY_VIEWBOX,
    MUSCLE_REGIONS,
    type BodyShape,
    type MuscleRegion,
} from '@eva/workout-engine'

/**
 * MuscleBodySvg — silueta anatómica STANDALONE para el card de compartir (Share Entreno F2).
 *
 * Por qué no reusar `MuscleMapSvg` directamente: ese componente es del resumen post-entreno y trae
 * tres cosas que el card NO puede tener — animación de entrada (view-shot capturaría un frame a
 * medio fade), leyenda "Menos → Más" (ruido en un card de 1080×1920) y dependencia de
 * `ThemeContext` para el acento (el card se rasteriza con el color de marca que le pasa el composer,
 * no con el tema vivo del device). Además necesita mostrar UNA sola cara (frente o espalda) según el
 * preset, cosa que el mapa del resumen nunca hizo.
 *
 * Lo que SÍ comparte con `MuscleMapSvg` — y es deliberado, para que el card y el resumen pinten la
 * misma silueta con la misma intensidad — son los paths vendoreados de `@eva/workout-engine`
 * (`body-anatomy`) y la escala de tiers/alfas (copiada abajo con su origen anotado).
 */

// ── Copiado de MuscleMapSvg.tsx (mismo contrato visual; ver cabecera) ────────────────────────────
/** Alfa por nivel de intensidad (1 = menos, 4 = más). Origen: MuscleMapSvg.tsx (Opción 1
 *  «Contorno firme» 30-08: piso «Leve» 30% — el 18% desaparecía en render nativo). */
const TIER_ALPHA: Record<1 | 2 | 3 | 4, number> = { 1: 0.3, 2: 0.48, 3: 0.68, 4: 0.92 }
/** Neutro del cuerpo base / regiones sin trabajar. Origen: MuscleMapSvg.tsx. Alfas de blanco
 *  FIJAS: el canvas del card es siempre oscuro-inmersivo, no sigue al esquema de la cuenta.
 *  Valores «Contorno firme» (30-08): 5.5%/10% eran invisibles sobre canvas oscuro en nativo. */
const NEUTRAL = { fill: 'rgba(255,255,255,0.11)', stroke: 'rgba(255,255,255,0.26)' }
/** Rótulos FRENTE/ESPALDA. Origen: MuscleMapSvg.tsx:60 (blanco 55%). */
const LABEL_FILL = 'rgba(255,255,255,0.55)'

/** Nivel discreto 0..4 desde la intensidad relativa continua 0..1. Origen: MuscleMapSvg.tsx:66. */
function tierOf(t: number): 0 | 1 | 2 | 3 | 4 {
    if (t <= 0) return 0
    if (t <= 0.25) return 1
    if (t <= 0.5) return 2
    if (t <= 0.75) return 3
    return 4
}

/** "#rrggbb" + alfa → "rgba(r,g,b,a)". Origen: MuscleMapSvg.tsx:75. */
function withAlpha(hex: string, alpha: number): string {
    const h = hex.replace('#', '')
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    const r = parseInt(full.slice(0, 2), 16) || 0
    const g = parseInt(full.slice(2, 4), 16) || 0
    const b = parseInt(full.slice(4, 6), 16) || 0
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ViewBox por cara. El viewBox del paquete es COMBINADO (frente en x[0..724], espalda en
 * x[724..1448], `BODY_HALF_WIDTH` = 724): recortarlo por x es suficiente para aislar una cara sin
 * tocar ni un path — las coordenadas de los shapes ya viven en ese espacio.
 */
const VIEWBOX: Record<'front' | 'back' | 'both', string> = {
    front: '0 0 724 1448',
    back: '724 0 724 1448',
    both: BODY_VIEWBOX,
}

/** Aspect (w/h) de cada viewBox — de ahí sale el ancho a partir del `height` que pide el consumidor. */
const ASPECT: Record<'front' | 'back' | 'both', number> = {
    front: 724 / 1448,
    back: 724 / 1448,
    both: 1448 / 1448,
}

/** x del rótulo dentro del espacio nativo (el mismo del viewBox combinado). */
const LABEL_X = { front: 362, back: 1086 } as const

export interface MuscleBodySvgProps {
    view: 'front' | 'back' | 'both'
    /** Intensidad relativa 0..1 por región (`muscleGroupsToRegionIntensity`). */
    intensity: Record<MuscleRegion, number>
    /** Color de marca del coach. Llega por prop: el card NO lee ThemeContext (ver cabecera). */
    accent: string
    height: number
    /** Rótulos FRENTE/ESPALDA bajo la silueta. Off por defecto: en un card suelen sobrar. */
    showLabels?: boolean
}

export function MuscleBodySvg({ view, intensity, accent, height, showLabels = false }: MuscleBodySvgProps) {
    // Agrupamos por cara + región en cada cambio de `view`. BODY_SHAPES es estático (159 paths), así
    // que el costo real es el filtro, no el recorrido.
    const { neutralShapes, regionShapes } = useMemo(() => {
        const inView = (s: BodyShape) => view === 'both' || s.side === view
        const neutral: BodyShape[] = []
        const byRegion = {} as Record<MuscleRegion, BodyShape[]>
        for (const r of MUSCLE_REGIONS) byRegion[r] = []
        for (const s of BODY_SHAPES) {
            if (!inView(s)) continue
            if (s.region) byRegion[s.region].push(s)
            else neutral.push(s)
        }
        return { neutralShapes: neutral, regionShapes: byRegion }
    }, [view])

    const width = height * ASPECT[view]

    return (
        <Svg viewBox={VIEWBOX[view]} width={width} height={height} preserveAspectRatio="xMidYMid meet">
            {/* Cuerpo base neutro (cuello / cabeza / manos / rodillas / tobillos / pies).
                non-scaling-stroke: 1px físico a cualquier tamaño (antes ~0.36px sub-píxel). */}
            <G fill={NEUTRAL.fill} stroke={NEUTRAL.stroke} strokeWidth={1}>
                {neutralShapes.map((s, i) => (
                    <Path key={`n${i}`} d={s.d} vectorEffect="non-scaling-stroke" />
                ))}
            </G>

            {/* Una <G> por región, tintada según intensidad. Sin trabajo = neutro (la silueta se lee
                entera igual: el contraste ES la información). */}
            {MUSCLE_REGIONS.map((region) => {
                const shapes = regionShapes[region]
                if (shapes.length === 0) return null
                const tier = tierOf(intensity[region] ?? 0)
                if (tier === 0) {
                    return (
                        <G key={region} fill={NEUTRAL.fill} stroke={NEUTRAL.stroke} strokeWidth={1}>
                            {shapes.map((s, i) => (
                                <Path key={i} d={s.d} vectorEffect="non-scaling-stroke" />
                            ))}
                        </G>
                    )
                }
                const litTier = tier as 1 | 2 | 3 | 4
                const isMax = litTier === 4
                // El nivel máximo lleva stroke marcado: canal NO cromático, para que se distinga
                // también en un repost en blanco y negro o para daltónicos (igual que el resumen).
                return (
                    <G
                        key={region}
                        fill={withAlpha(accent, TIER_ALPHA[litTier])}
                        stroke={isMax ? withAlpha(accent, 1) : withAlpha(accent, 0.55)}
                        strokeWidth={isMax ? 2 : 1}
                    >
                        {shapes.map((s, i) => (
                            <Path key={i} d={s.d} vectorEffect="non-scaling-stroke" />
                        ))}
                    </G>
                )
            })}

            {showLabels && view !== 'back' ? (
                <SvgText x={LABEL_X.front} y={1440} fill={LABEL_FILL} fontSize={44} fontWeight="700" textAnchor="middle" letterSpacing={3.5}>
                    FRENTE
                </SvgText>
            ) : null}
            {showLabels && view !== 'front' ? (
                <SvgText x={LABEL_X.back} y={1440} fill={LABEL_FILL} fontSize={44} fontWeight="700" textAnchor="middle" letterSpacing={3.5}>
                    ESPALDA
                </SvgText>
            ) : null}
        </Svg>
    )
}
