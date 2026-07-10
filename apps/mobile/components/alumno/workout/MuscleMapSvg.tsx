import { useEffect, useMemo, useRef } from 'react'
import { Animated, View, Text } from 'react-native'
import Svg, { G, Path, Text as SvgText } from 'react-native-svg'
import {
  BODY_SHAPES,
  BODY_VIEWBOX,
  muscleGroupsToRegionIntensity,
  MUSCLE_REGIONS,
  type BodyShape,
  type MuscleRegion,
} from '@eva/workout-engine'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'

/**
 * MuscleMapSvg (mobile) — mapa muscular anatómico del resumen post-entreno.
 *
 * Port RN del `MuscleMapSvg` web (react-native-svg en vez de <svg>). Los paths + viewBox salen del
 * paquete compartido `@eva/workout-engine` (`body-anatomy`), así que web y mobile pintan EXACTAMENTE
 * la misma silueta sin duplicar los ~180 paths vendoreados. La intensidad relativa por región
 * (0..1) se calcula con `muscleGroupsToRegionIntensity` (misma lógica pura que web) a partir del
 * trabajo por grupo que el overlay ya tiene en memoria (fuerza kg + proxy movilidad/roller, cardio
 * excluido) — cero queries.
 *
 * Canvas SIEMPRE oscuro (1:1 con el overlay sobre ink-950): neutros = alfas de blanco fijos; las
 * regiones trabajadas usan la rampa de MARCA del coach (`theme.primary`) por 4 niveles de alfa. El
 * nivel máximo lleva stroke marcado (accesibilidad: canal no-cromático).
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

const REGION_ORDER = Object.keys(REGION_LABEL) as MuscleRegion[]
const REGION_INDEX = Object.fromEntries(REGION_ORDER.map((r, i) => [r, i])) as Record<MuscleRegion, number>

// <G> animable para el fade escalonado de cada región encendida (paridad con el web framer-motion).
const AnimatedG = Animated.createAnimatedComponent(G)

// Alfa por nivel de intensidad (1 = menos, 4 = más) — mismos valores que el web.
const TIER_ALPHA: Record<1 | 2 | 3 | 4, number> = { 1: 0.18, 2: 0.38, 3: 0.62, 4: 0.92 }

const NEUTRAL_FILL = 'rgba(255,255,255,0.055)'
const NEUTRAL_STROKE = 'rgba(255,255,255,0.10)'
const LABEL_FILL = 'rgba(255,255,255,0.55)'

/** Nivel discreto 0..4 a partir de la intensidad relativa continua 0..1 (idéntico a web). */
function tierOf(t: number): 0 | 1 | 2 | 3 | 4 {
  if (t <= 0) return 0
  if (t <= 0.25) return 1
  if (t <= 0.5) return 2
  if (t <= 0.75) return 3
  return 4
}

/** "#rrggbb" + alfa → "rgba(r,g,b,a)" (rampa de marca sobre el canvas oscuro). */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16) || 0
  const g = parseInt(full.slice(2, 4), 16) || 0
  const b = parseInt(full.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Agrupa los shapes vendoreados por región una sola vez (BODY_SHAPES es estático).
const NEUTRAL_SHAPES: BodyShape[] = BODY_SHAPES.filter((s) => s.region === null)
const REGION_SHAPES: Record<MuscleRegion, BodyShape[]> = (() => {
  const acc = {} as Record<MuscleRegion, BodyShape[]>
  for (const r of REGION_ORDER) acc[r] = []
  for (const s of BODY_SHAPES) {
    if (s.region) acc[s.region].push(s)
  }
  return acc
})()

export interface MuscleMapSvgProps {
  /**
   * Trabajo por grupo muscular (ES) — el overlay ya lo calcula. Combina volumen de fuerza (kg) con
   * el proxy de movilidad/roller (cardio excluido), de modo que la intensidad es RELATIVA, no kg.
   */
  groups: { group: string; vol: number }[]
  /** Salta el fade escalonado de entrada (accesibilidad; espejo del web). */
  reducedMotion?: boolean | null
}

export function MuscleMapSvg({ groups, reducedMotion }: MuscleMapSvgProps) {
  const { theme } = useTheme()
  const brand = theme.primary
  const intensity = useMemo(() => muscleGroupsToRegionIntensity(groups), [groups])

  // Una opacidad animada por región (9 fijas → hooks estables). Sólo las encendidas animan; las
  // neutras se dibujan siempre visibles. Delay escalonado 0.16s + 0.05s·litIndex en orden REGION_ORDER
  // (idéntico al `litIndex++` del web). Reduced-motion: opacidad 1 directa, sin timing.
  const opacities = useRef(REGION_ORDER.map(() => new Animated.Value(reducedMotion ? 1 : 0))).current

  const litRegions = useMemo(
    () => REGION_ORDER.filter((r) => tierOf(intensity[r]) > 0),
    [intensity],
  )

  useEffect(() => {
    if (reducedMotion) {
      litRegions.forEach((r) => opacities[REGION_INDEX[r]].setValue(1))
      return
    }
    const anims = litRegions.map((r, litIndex) => {
      const av = opacities[REGION_INDEX[r]]
      av.setValue(0)
      return Animated.timing(av, {
        toValue: 1,
        duration: 360,
        delay: (0.16 + 0.05 * litIndex) * 1000,
        useNativeDriver: false,
      })
    })
    Animated.parallel(anims).start()
  }, [litRegions, reducedMotion, opacities])

  const ariaLabel =
    litRegions.length > 0
      ? `Músculos trabajados: ${litRegions
          .slice()
          .sort((a, b) => intensity[b] - intensity[a])
          .map((r) => REGION_LABEL[r])
          .join(', ')}`
      : 'Músculos trabajados'

  return (
    <View testID="muscle-map" accessibilityRole="image" accessibilityLabel={ariaLabel}>
      <Svg viewBox={BODY_VIEWBOX} width="100%" height={260} preserveAspectRatio="xMidYMid meet">
        {/* Cuerpo base neutro (cuello / cabeza / manos / rodillas / tobillos / pies). */}
        <G fill={NEUTRAL_FILL} stroke={NEUTRAL_STROKE} strokeWidth={2}>
          {NEUTRAL_SHAPES.map((s, i) => (
            <Path key={`n${i}`} d={s.d} />
          ))}
        </G>

        {/* Una <G> por región, tintada según intensidad. Regiones sin trabajo = neutro. */}
        {REGION_ORDER.map((region) => {
          const tier = tierOf(intensity[region])
          const shapes = REGION_SHAPES[region]
          if (tier === 0) {
            return (
              <G key={region} fill={NEUTRAL_FILL} stroke={NEUTRAL_STROKE} strokeWidth={2}>
                {shapes.map((s, i) => (
                  <Path key={i} d={s.d} />
                ))}
              </G>
            )
          }
          const litTier = tier as 1 | 2 | 3 | 4
          const isMax = litTier === 4
          const fill = withAlpha(brand, TIER_ALPHA[litTier])
          const stroke = isMax ? withAlpha(brand, 1) : withAlpha(brand, 0.45)
          const strokeWidth = isMax ? 6 : 2
          return (
            <AnimatedG
              key={region}
              opacity={opacities[REGION_INDEX[region]]}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              accessibilityRole="image"
              accessibilityLabel={`${REGION_LABEL[region]}, intensidad ${litTier} de 4`}
            >
              {shapes.map((s, i) => (
                <Path key={i} d={s.d} />
              ))}
            </AnimatedG>
          )
        })}

        <SvgText x={362} y={1440} fill={LABEL_FILL} fontSize={44} fontWeight="700" textAnchor="middle">
          FRENTE
        </SvgText>
        <SvgText x={1086} y={1440} fill={LABEL_FILL} fontSize={44} fontWeight="700" textAnchor="middle">
          ESPALDA
        </SvgText>
      </Svg>

      {/* Leyenda de niveles (menos → más). El último lleva anillo = nivel máximo (stroke). */}
      <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Text style={{ fontFamily: FONT.ui, fontSize: 10, letterSpacing: 1, color: LABEL_FILL, textTransform: 'uppercase' }}>Menos</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {([1, 2, 3, 4] as const).map((lvl) => (
            <View
              key={lvl}
              style={{
                height: 12,
                width: 16,
                borderRadius: 3,
                backgroundColor: withAlpha(brand, TIER_ALPHA[lvl]),
                borderWidth: lvl === 4 ? 1.5 : 0,
                borderColor: withAlpha(brand, 1),
              }}
            />
          ))}
        </View>
        <Text style={{ fontFamily: FONT.ui, fontSize: 10, letterSpacing: 1, color: LABEL_FILL, textTransform: 'uppercase' }}>Más</Text>
      </View>
    </View>
  )
}
