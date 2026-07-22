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
 * Canvas dark-inmersivo (1:1 con el overlay sobre ink-950), pero el neutro del cuerpo base / regiones
 * sin trabajar es el ÚNICO bloque THEME-AWARE del mapa (spec §6/§8.3, web MuscleMapSvg.tsx:88-107):
 * dark = alfas de blanco, light = alfas de slate-950. Las regiones trabajadas usan la rampa de MARCA
 * del coach (`theme.primary`) por 4 niveles de alfa. El nivel máximo lleva stroke marcado
 * (accesibilidad: canal no-cromático).
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

// Neutro del cuerpo base / regiones sin trabajar — THEME-AWARE (el único bloque del mapa que flipea
// con el tema del sitio, spec §8.3). Espejo EXACTO del <style> inline web (MuscleMapSvg.tsx:88-107):
// dark = blanco 5.5%/10%, light = slate-950 rgba(15,23,42) 6%/14%. Se elige por `resolvedScheme`.
const NEUTRAL_DARK = { fill: 'rgba(255,255,255,0.055)', stroke: 'rgba(255,255,255,0.10)' }
const NEUTRAL_LIGHT = { fill: 'rgba(15,23,42,0.06)', stroke: 'rgba(15,23,42,0.14)' }
// Rótulos FRENTE/ESPALDA dentro del SVG: web usa `var(--on-dark-muted, rgba(255,255,255,0.55))`
// y --on-dark-muted NO está definida en globals.css → cae al fallback blanco 55% (MuscleMapSvg.tsx:174).
const LABEL_FILL = 'rgba(255,255,255,0.55)'
// Leyenda "Menos/Más": web usa el token real text-on-dark-muted (#939DAB), no el fallback blanco 55%
// (MuscleMapSvg.tsx:186). Valor del token --color-text-on-dark-muted (theme.ts:321 = 147 157 171).
const LEGEND_FILL = '#939DAB'

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
  /**
   * Formato de la leyenda. `'ramp'` (default) = rampa "Menos → Más" (V2, intacto). `'tiers'` = 3
   * niveles discretos "Fuerte / Medio / Leve" (mockup concepto-a-v2 `.a2-legend`, Final V3). Aditivo.
   */
  legendVariant?: 'ramp' | 'tiers'
}

export function MuscleMapSvg({ groups, reducedMotion, legendVariant = 'ramp' }: MuscleMapSvgProps) {
  const { theme, resolvedScheme } = useTheme()
  const brand = theme.primary
  // Neutro theme-aware: en tema CLARO del sitio el web pinta la silueta base en slate translúcido
  // (casi invisible sobre el velo ink-950), no en blanco — espejo del <style> web (MuscleMapSvg.tsx:88-107).
  const neutral = resolvedScheme === 'light' ? NEUTRAL_LIGHT : NEUTRAL_DARK
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
        <G fill={neutral.fill} stroke={neutral.stroke} strokeWidth={2}>
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
              <G key={region} fill={neutral.fill} stroke={neutral.stroke} strokeWidth={2}>
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
              // Web: <motion.g role="img" aria-label> (MuscleMapSvg.tsx:157-158). En RN, el tipo
              // GProps de react-native-svg (CommonPathProps→AccessibilityProps) NO expone
              // accessibilityRole, sólo accessibilityLabel/accessible/testID. Usamos `accessible`
              // para que el grupo se anuncie con su label de intensidad (misma lectura de VoiceOver).
              accessible
              accessibilityLabel={`${REGION_LABEL[region]}, intensidad ${litTier} de 4`}
            >
              {shapes.map((s, i) => (
                <Path key={i} d={s.d} />
              ))}
            </AnimatedG>
          )
        })}

        {/* letterSpacing 44*0.08 ≈ 3.5 (web fija letterSpacing:'0.08em' sobre el <g>, MuscleMapSvg.tsx:178). */}
        <SvgText x={362} y={1440} fill={LABEL_FILL} fontSize={44} fontWeight="700" textAnchor="middle" letterSpacing={3.5}>
          FRENTE
        </SvgText>
        <SvgText x={1086} y={1440} fill={LABEL_FILL} fontSize={44} fontWeight="700" textAnchor="middle" letterSpacing={3.5}>
          ESPALDA
        </SvgText>
      </Svg>

      {/* Leyenda. `tiers` (Final V3) = 3 niveles con rótulo Fuerte/Medio/Leve (mockup .a2-legend);
          `ramp` (default, V2) = rampa "Menos → Más" con anillo en el nivel máximo. */}
      {legendVariant === 'tiers' ? (
        <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          {([['Fuerte', 1], ['Medio', 0.52], ['Leve', 0.26]] as const).map(([label, alpha]) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ height: 10, width: 10, borderRadius: 3, backgroundColor: withAlpha(brand, alpha) }} />
              <Text style={{ fontFamily: FONT.ui, fontSize: 10, letterSpacing: 0.8, color: LEGEND_FILL, textTransform: 'uppercase' }}>{label}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Text style={{ fontFamily: FONT.ui, fontSize: 10, letterSpacing: 1, color: LEGEND_FILL, textTransform: 'uppercase' }}>Menos</Text>
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
          <Text style={{ fontFamily: FONT.ui, fontSize: 10, letterSpacing: 1, color: LEGEND_FILL, textTransform: 'uppercase' }}>Más</Text>
        </View>
      )}
    </View>
  )
}
