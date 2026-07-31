import { StyleSheet, Text, View } from 'react-native'
import { Check, Flame } from 'lucide-react-native'
import { cssInterop } from 'nativewind'
import { MotiView } from 'moti'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../../../context/ThemeContext'
import { useEvaMotion } from '../../../lib/motion'
import { FONT } from '../../../lib/typography'
import type { WeeklyStreak, WeekDotState } from '../workout/v3/weekly-streak'
import { EMBER_400, EMBER_500 } from './types'

// className→color del glyph: deja que el token dark-aware `text-ember-700` (que FLIPEA en
// dark, igual que el web) coloree el trazo. Sin este registro por-icono, lucide-react-native
// ignora className y cae a currentColor≈negro (patron DS del repo: StreakRibbon/WeightWidget).
cssInterop(Flame, { className: { target: 'style', nativeStyleToProp: { color: true } } })

/**
 * §3 "Tu semana" — rediseño Mock C (CEO 2026-07-30). REEMPLAZA a `StreakRibbon`: en vez de
 * un número grande de racha con barra al hito, la card cuenta la SEMANA (7 dots Lun→Dom con
 * el MISMO estado que las day-cards del programa) y degrada la racha a un chip discreto.
 *
 * Dos fuentes, ninguna re-derivada aquí:
 *   · `week` = `deriveWeeklyStreak` (helper puro compartido con el ejecutor V3), alimentado
 *     desde `home.tsx` con los MISMOS insumos que las day-cards (atribución greedy por plan).
 *   · `streak` = RPC `get_client_current_streak` (misma fuente/regla que el web: días
 *     ASIGNADOS hechos, día sin asignación neutro — migración 20260723110000). El diseño no
 *     tiene "record" real → se degrada al próximo HITO (7/14/30/60/100/180/365).
 *
 * Color: fondo/borde/textos ember via clases-token (bg-ember-100, border-ember-200,
 * text-ember-700) que FLIPEAN en dark. `EMBER_400/500` son la rampa DS FIJA (nunca
 * white-label, mismo valor en ambos temas) y solo pintan fills/bordes del dot.
 */
const MILESTONES = [7, 14, 30, 60, 100, 180, 365]

function nextMilestone(n: number): number {
  for (const m of MILESTONES) if (m > n) return m
  return Math.ceil((n + 1) / 365) * 365
}

/** Tinta del check sobre el fill ember (rampa FIJA, NO marca): cálida y oscura para
 *  contraste alto sobre EMBER_400→EMBER_500 en ambos esquemas. */
const EMBER_INK = '#3B1104'

const DOT = 26

export function WeekStrip({
  week,
  streak,
  todayIso,
}: {
  week: WeeklyStreak
  streak: number
  /** Fecha ISO de HOY (Santiago) — resalta el label del día actual. */
  todayIso: string
}) {
  const motion = useEvaMotion()
  // Mount-anim del shell (paridad idiomatica; el web es server-render sin entrada) →
  // condicionada a reduce: reducido arranca en el estado final.
  const mountFrom = motion.reduced ? { opacity: 1, translateY: 0 } : { opacity: 0, translateY: 10 }

  // Vacio honesto: sin plan, sin sesiones y sin racha no hay nada que contar → se conserva
  // el espiritu del vacio del viejo StreakRibbon con el estilo nuevo de card.
  if (!week.hasSignal && streak <= 0) {
    return (
      <MotiView from={mountFrom} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 380 }}>
        <View
          accessible
          accessibilityLabel="Tu semana: sin sesiones todavía. Empieza tu racha hoy."
          className="rounded-card border border-ember-200 bg-ember-100 dark:bg-ember-100/20"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: EMBER_500 + '26',
            }}
          >
            <Flame className="text-ember-700" size={24} strokeWidth={2.25} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="text-strong" style={{ fontFamily: FONT.displayBlack, fontSize: 15 }}>
              Empieza tu racha hoy
            </Text>
            <Text
              numberOfLines={1}
              className="text-ember-700"
              style={{ fontFamily: FONT.uiSemibold, fontSize: 12, marginTop: 2, opacity: 0.9 }}
            >
              Entrena hoy y enciende la primera llama
            </Text>
          </View>
        </View>
      </MotiView>
    )
  }

  const goal = nextMilestone(streak)
  const dayWord = streak === 1 ? 'día' : 'días'
  const weekPart =
    week.plannedCount > 0
      ? `${week.doneCount} de ${week.plannedCount} completados`
      : week.doneCount > 0
        ? `${week.doneCount} completados`
        : 'sin sesiones'
  const a11yLabel = `Tu semana: ${weekPart}. Racha ${streak} ${dayWord}, próxima meta ${goal}.`

  return (
    <MotiView from={mountFrom} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 380 }}>
      <View
        accessible
        accessibilityLabel={a11yLabel}
        className="rounded-card border border-ember-200 bg-ember-100 dark:bg-ember-100/20"
        style={{ overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 14 }}
      >
        {/* Sheen ~118° heredado del ribbon (web `StreakRibbon.tsx:67`): overlay alpha sobre
            EMBER_500, funciona en ambos temas sobre la base token. */}
        <LinearGradient
          colors={[EMBER_500 + '14', EMBER_500 + '00']}
          start={{ x: 0, y: 0.24 }}
          end={{ x: 1, y: 0.76 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text className="text-strong" numberOfLines={1} style={{ fontFamily: FONT.displayBlack, fontSize: 13.5 }}>
            Tu semana
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <Flame className="text-ember-700" size={13} strokeWidth={2.5} />
            <Text
              className="text-ember-700"
              numberOfLines={1}
              style={{ fontFamily: FONT.uiExtra, fontSize: 12, fontVariant: ['tabular-nums'] }}
            >
              {streak} {dayWord}
            </Text>
            <Text
              className="text-ember-700"
              numberOfLines={1}
              style={{ fontFamily: FONT.uiSemibold, fontSize: 12, opacity: 0.75 }}
            >
              · meta {goal}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
          {week.dots.map((d) => (
            <View key={d.iso} style={{ alignItems: 'center', gap: 5 }}>
              <Dot state={d.state} />
              <Text
                className={d.iso === todayIso ? 'text-ember-700' : 'text-subtle'}
                style={{ fontFamily: FONT.uiBold, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.6 }}
              >
                {d.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </MotiView>
  )
}

/**
 * Dot de 26px. Estados (mismos que las day-cards, `WeekDotState`):
 *   · done        — círculo LLENO con degradado ember (EMBER_400→EMBER_500) + check oscuro.
 *   · in_progress — círculo MITAD (borde ember + mitad inferior rellena): sesión empezada
 *                   sin cerrar (1–99%). Inconfundible respecto de `done`.
 *   · today       — borde ember con un punto ember pequeño al centro (hoy, aún sin sesión).
 *   · pending     — borde sutil, vacío (día asignado sin hacer; sin culpa).
 *   · rest        — borde punteado sutil con un "·" apagado al centro (día sin asignación).
 *                   El punto va como View: el `borderStyle: 'dashed'` con radio no se
 *                   respeta en todos los Android, así que el centro es el diferenciador real.
 */
function Dot({ state }: { state: WeekDotState }) {
  const { theme } = useTheme()
  const base = {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }

  if (state === 'done') {
    return (
      <View style={[base, { overflow: 'hidden' }]}>
        <LinearGradient
          colors={[EMBER_400, EMBER_500]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Check size={14} strokeWidth={3.25} color={EMBER_INK} />
      </View>
    )
  }

  if (state === 'in_progress') {
    return (
      <View style={[base, { overflow: 'hidden', borderWidth: 2, borderColor: EMBER_500 }]}>
        <LinearGradient
          colors={[EMBER_500 + '00', EMBER_500 + '00', EMBER_500, EMBER_500]}
          locations={[0, 0.5, 0.5, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    )
  }

  if (state === 'today') {
    return (
      <View style={[base, { borderWidth: 2, borderColor: EMBER_500 }]}>
        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: EMBER_500 }} />
      </View>
    )
  }

  if (state === 'rest') {
    return (
      <View className="border-subtle" style={[base, { borderWidth: 1.5, borderStyle: 'dashed' }]}>
        {/* El "·" va como View (no glyph): centrado exacto en RN sin depender de la métrica
            de la fuente. Color = neutro del tema (dark-aware), nunca de marca. */}
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.mutedForeground, opacity: 0.55 }} />
      </View>
    )
  }

  // pending — día asignado sin hacer (pasado o futuro): borde sutil, vacío.
  return <View className="border-subtle" style={[base, { borderWidth: 1.5 }]} />
}
