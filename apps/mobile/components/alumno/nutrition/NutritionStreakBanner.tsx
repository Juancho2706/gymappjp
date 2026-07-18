import { Text, View } from 'react-native'
import { Flame } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useEvaMotion } from '../../../lib/motion'
import { FONT } from '../../../lib/typography'
import { AnimatedNumber } from '../../AnimatedNumber'
import { EMBER_500, EMBER_700 } from './types'
import type { StreakResult } from './streak'

/**
 * NutritionStreakBanner (E4-05/06) — re-skin DS del banner de racha, espejo del
 * web `NutritionStreakBanner`. Purga el banner inline con Montserrat legacy del
 * monolito. Dos estados: racha viva (ember, count≥2) y día de gracia (ámbar).
 * La racha llega ya computada por el motor único (`computeNutritionStreak`).
 */

const AMBER_500 = '#F59E0B'
const AMBER_700 = '#B45309'

export function NutritionStreakBanner({ streak }: { streak: StreakResult }) {
  const motion = useEvaMotion()
  const { count, atRisk, priorCount } = streak

  if (atRisk) {
    const frame = priorCount <= 7 ? `${priorCount} de 7 días` : `${priorCount} días`
    return (
      <MotiView
        from={{ opacity: 0, translateY: -10 }}
        animate={motion.reduced ? { opacity: 1, translateY: 0 } : { opacity: 1, translateY: 0, scale: [1, 1.025, 1] }}
        transition={{ type: 'timing', duration: motion.reduced ? 200 : 550 }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderWidth: 1,
          borderColor: AMBER_500 + '40',
          backgroundColor: AMBER_500 + '1A',
          borderRadius: 20,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <Flame size={20} color={AMBER_500} strokeWidth={2.25} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: FONT.uiExtra, fontSize: 14, color: AMBER_700 }}>
            Tu racha sigue viva · {frame}
          </Text>
          <Text className="text-muted" style={{ fontFamily: FONT.ui, fontSize: 11, marginTop: 2 }}>
            Registra tus comidas de hoy para mantenerla.
          </Text>
        </View>
      </MotiView>
    )
  }

  if (count < 2) return null

  const frame = count <= 7 ? `${count} de 7 días` : `${count} días`
  const sub =
    count >= 7 ? '¡Semana perfecta! Sigue así.' : count >= 3 ? 'Vas muy bien, sigue así.' : 'Buen comienzo, mantén el ritmo.'

  return (
    <MotiView
      from={{ opacity: 0, translateY: -10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 380 }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderColor: EMBER_500 + '38',
        backgroundColor: EMBER_500 + '1A',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: EMBER_500 }}>
        <Flame size={20} color="#FFFFFF" strokeWidth={2.25} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: FONT.uiExtra, fontSize: 14, color: EMBER_700 }}>{frame} de racha</Text>
        <Text numberOfLines={1} style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: EMBER_700, opacity: 0.8, marginTop: 2 }}>
          {sub}
        </Text>
      </View>
      <AnimatedNumber
        value={count}
        style={{ fontFamily: FONT.displayBlack, fontSize: 25, letterSpacing: -0.6, fontVariant: ['tabular-nums'], color: EMBER_700 }}
      />
    </MotiView>
  )
}
