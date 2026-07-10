import { Text, View } from 'react-native'
import { Flame } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import { useEvaMotion } from '../../../lib/motion'
import { FONT } from '../../../lib/typography'
import { AnimatedNumber } from '../../AnimatedNumber'
import { EMBER_500, EMBER_600, EMBER_700 } from './types'

/**
 * §3 StreakRibbon (web `streak/StreakRibbon.tsx`): protagonista de retencion.
 * `streak` = RPC `get_client_current_streak` (MISMA fuente/regla que el web). El
 * diseno no tiene "record" real → se degrada al proximo HITO (7/14/30/60/100/
 * 180/365) por encima de la racha, con copy motivacional + barra al hito. Llama
 * de fondo pulsante (reduced-motion aware), numero grande con count-up.
 */
const MILESTONES = [7, 14, 30, 60, 100, 180, 365]

function nextMilestone(n: number): number {
  for (const m of MILESTONES) if (m > n) return m
  return Math.ceil((n + 1) / 365) * 365
}

export function StreakRibbon({ streak }: { streak: number }) {
  const motion = useEvaMotion()
  const { theme } = useTheme()

  if (streak <= 0) {
    return (
      <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 380 }}>
        <View
          className="rounded-card"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: EMBER_500 + '38', backgroundColor: EMBER_500 + '1A', paddingHorizontal: 16, paddingVertical: 14 }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: EMBER_500 + '26' }}>
            <Flame size={24} color={EMBER_700} strokeWidth={2.25} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="text-strong" style={{ fontFamily: FONT.displayBlack, fontSize: 15 }}>
              Empieza tu racha hoy
            </Text>
            <Text numberOfLines={1} style={{ fontFamily: FONT.uiSemibold, fontSize: 12, color: EMBER_700, marginTop: 2 }}>
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
    <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 380 }}>
      <View
        className="rounded-card"
        style={{ overflow: 'hidden', borderWidth: 1, borderColor: EMBER_500 + '38', backgroundColor: EMBER_500 + '1A', paddingHorizontal: 16, paddingVertical: 14 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }}>
            <MotiView
              from={{ scale: 1, opacity: 0.18 }}
              animate={motion.reduced ? { scale: 1, opacity: 0.18 } : { scale: [1, 1.12, 1], opacity: [0.18, 0.28, 0.18] }}
              transition={motion.reduced ? undefined : { type: 'timing', duration: 2600, loop: true }}
              style={{ position: 'absolute', inset: 0, borderRadius: 23, backgroundColor: EMBER_500 }}
            />
            <Flame size={26} color={EMBER_700} strokeWidth={2.25} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <AnimatedNumber
                value={streak}
                style={{ fontFamily: FONT.displayBlack, fontSize: 30, lineHeight: 32, letterSpacing: -1, fontVariant: ['tabular-nums'], color: theme.foreground }}
              />
              <Text style={{ fontFamily: FONT.uiExtra, fontSize: 14, color: EMBER_700 }}>días de racha</Text>
            </View>
            <Text numberOfLines={1} style={{ fontFamily: FONT.uiSemibold, fontSize: 12, color: EMBER_600, marginTop: 4 }}>
              {toGoal === 0 ? '¡Alcanzaste el hito! Seguí así.' : `Te ${toGoal === 1 ? 'falta' : 'faltan'} ${toGoal} para los ${goal} días`}
            </Text>
          </View>
        </View>
        <View style={{ height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 12, backgroundColor: EMBER_500 + '2E' }}>
          <MotiView
            from={{ width: '0%' }}
            animate={{ width: `${pct}%` }}
            transition={{ type: 'timing', duration: motion.reduced ? 0 : 900 }}
            style={{ height: 6, borderRadius: 999, backgroundColor: EMBER_500 }}
          />
        </View>
      </View>
    </MotiView>
  )
}
