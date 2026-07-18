import { StyleSheet, Text, View } from 'react-native'
import { Flame } from 'lucide-react-native'
import { cssInterop } from 'nativewind'
import { MotiView } from 'moti'
import { LinearGradient } from 'expo-linear-gradient'
import { Easing } from 'react-native-reanimated'
import { useTheme } from '../../../context/ThemeContext'
import { useEvaMotion } from '../../../lib/motion'
import { FONT } from '../../../lib/typography'
import { AnimatedNumber } from '../../AnimatedNumber'
import { EMBER_500 } from './types'

// className→color del glyph Flame: deja que el token dark-aware `text-ember-700`
// (que FLIPEA en dark, igual que el web `text-ember-700`) coloree el trazo. Sin
// este registro por-icono, lucide-react-native ignora className y cae a
// currentColor≈negro (patron DS del repo: WeightWidget/RecentWorkouts).
cssInterop(Flame, { className: { target: 'style', nativeStyleToProp: { color: true } } })

/**
 * §3 StreakRibbon (web `streak/StreakRibbon.tsx`): protagonista de retencion.
 * `streak` = RPC `get_client_current_streak` (MISMA fuente/regla que el web). El
 * diseno no tiene "record" real → se degrada al proximo HITO (7/14/30/60/100/
 * 180/365) por encima de la racha, con copy motivacional + barra al hito. Llama
 * de fondo pulsante (reduced-motion aware), numero grande con count-up.
 *
 * Color: fondo/borde/textos ember via clases-token (bg-ember-100, border-ember-200,
 * text-ember-700) que FLIPEAN en dark (P0 ola0: las constantes EMBER_* fijas dejaban
 * texto naranja ilegible y fondo sub-tinteado). ember-500 (halo/barra) NO flipea en
 * ningun tema (mismo valor que el web) → se conserva como constante.
 */
const MILESTONES = [7, 14, 30, 60, 100, 180, 365]

function nextMilestone(n: number): number {
  for (const m of MILESTONES) if (m > n) return m
  return Math.ceil((n + 1) / 365) * 365
}

export function StreakRibbon({ streak }: { streak: number }) {
  const motion = useEvaMotion()
  const { theme } = useTheme()

  // Mount-anim del shell (paridad idiomatica; el web es server-render sin entrada) →
  // condicionada a reduce (ola0 P2): reducido arranca en el estado final.
  const mountFrom = motion.reduced ? { opacity: 1, translateY: 0 } : { opacity: 0, translateY: 10 }

  if (streak <= 0) {
    return (
      <MotiView from={mountFrom} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 380 }}>
        <View
          className="rounded-card border border-ember-200 bg-ember-100 dark:bg-ember-100/20"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: EMBER_500 + '26' }}>
            <Flame className="text-ember-700" size={24} strokeWidth={2.25} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="text-strong" style={{ fontFamily: FONT.displayBlack, fontSize: 15 }}>
              Empieza tu racha hoy
            </Text>
            <Text numberOfLines={1} className="text-ember-700" style={{ fontFamily: FONT.uiSemibold, fontSize: 12, marginTop: 2, opacity: 0.9 }}>
              Entrena hoy y enciende la primera llama
            </Text>
          </View>
        </View>
      </MotiView>
    )
  }

  const goal = nextMilestone(streak)
  const toGoal = Math.max(0, goal - streak)
  const pct = Math.min(100, Math.round((streak / goal) * 100))

  return (
    <MotiView from={mountFrom} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 380 }}>
      <View
        className="rounded-card border border-ember-200 bg-ember-100 dark:bg-ember-100/20"
        style={{ overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 14 }}
      >
        {/* Sheen ~118° que distingue el estado con-racha del vacio (web `:67` gradiente
            ember-100 → mezcla surface-card). RN: overlay alpha sobre ember-500 (ya
            constante DS); works en ambos temas sobre la base token. start/end ≈ 118°. */}
        <LinearGradient
          colors={[EMBER_500 + '14', 'transparent']}
          start={{ x: 0, y: 0.24 }}
          end={{ x: 1, y: 0.76 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }}>
            <MotiView
              from={{ scale: 1, opacity: 0.18 }}
              animate={motion.reduced ? { scale: 1, opacity: 0.18 } : { scale: [1, 1.12, 1], opacity: [0.18, 0.28, 0.18] }}
              transition={motion.reduced ? undefined : { type: 'timing', duration: 2600, loop: true }}
              style={{ position: 'absolute', inset: 0, borderRadius: 23, backgroundColor: EMBER_500 }}
            />
            <Flame className="text-ember-700" size={26} strokeWidth={2.25} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <AnimatedNumber
                value={streak}
                duration={1000}
                style={{ fontFamily: FONT.displayBlack, fontSize: 30, lineHeight: 32, letterSpacing: -1, fontVariant: ['tabular-nums'], color: theme.foreground }}
              />
              <Text className="text-ember-700" style={{ fontFamily: FONT.uiExtra, fontSize: 14 }}>días de racha</Text>
            </View>
            <Text numberOfLines={1} className="text-ember-700" style={{ fontFamily: FONT.uiSemibold, fontSize: 12, marginTop: 4, opacity: 0.9 }}>
              {toGoal === 0 ? '¡Alcanzaste el hito! Sigue así.' : `Te ${toGoal === 1 ? 'falta' : 'faltan'} ${toGoal} para los ${goal} días`}
            </Text>
          </View>
        </View>
        <View style={{ height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 12, backgroundColor: EMBER_500 + '2E' }}>
          <MotiView
            from={{ width: '0%' }}
            animate={{ width: `${pct}%` }}
            transition={{ type: 'timing', duration: motion.reduced ? 0 : 1000, easing: Easing.bezier(0.16, 1, 0.3, 1) }}
            style={{ height: 6, borderRadius: 999, backgroundColor: EMBER_500 }}
          />
        </View>
      </View>
    </MotiView>
  )
}
