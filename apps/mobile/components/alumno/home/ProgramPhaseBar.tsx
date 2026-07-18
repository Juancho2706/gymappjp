import { Text, View } from 'react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import { resolveSportRamp } from '../../../lib/theme'
import { useEvaMotion } from '../../../lib/motion'
import { FONT } from '../../../lib/typography'
import type { ProgramPhase } from './types'

/**
 * E1-05 ProgramPhaseBar (web `program/ProgramPhaseBar.tsx`): sin fases → barra de
 * progreso simple (sport, pct = semana/total). Con fases → segmentos por estado
 * (actual sport-500, pasada sport-200, futura sunken) + fila de nombres debajo
 * (actual en negrita sport-600), anchos proporcionales a `weeks`.
 */
export function ProgramPhaseBar({
  phases,
  currentWeek,
  totalWeeks,
}: {
  phases: ProgramPhase[] | null
  currentWeek: number
  totalWeeks: number
}) {
  const { branding } = useTheme()
  const motion = useEvaMotion()
  const pct = totalWeeks > 0 ? Math.min(100, (currentWeek / totalWeeks) * 100) : 0
  // Relleno = --sport-500 (marca cruda, scheme-independiente igual que web
  // `bg-sport-500`), resuelto imperativo para el backgroundColor del MotiView
  // (className no lo maneja en el componente animado). `theme.primary` divergía:
  // es el accent clampeado que flipea light/dark, cosa que web no hace.
  const sportFill = resolveSportRamp(branding?.primaryColor).sport500

  // Guard con Array.isArray: un objeto truthy con `length` undefined pasaría el
  // check previo y crashearía en `phases.map` (paridad web ProgramPhaseBar.tsx:24).
  if (!phases || !Array.isArray(phases) || phases.length === 0) {
    return (
      <View className="bg-track dark:bg-track/10" style={{ height: 8, borderRadius: 999, overflow: 'hidden' }}>
        <MotiView
          from={{ width: '0%' }}
          animate={{ width: `${pct}%` }}
          // Spring lazy (stiffness 80 / damping 20) = web `springs.lazy`; en
          // reduce-motion colapsa a timing 0 (sin movimiento espacial).
          transition={motion.reduced ? { type: 'timing', duration: 0 } : { type: 'spring', stiffness: 80, damping: 20 }}
          style={{ height: 8, borderRadius: 999, backgroundColor: sportFill }}
        />
      </View>
    )
  }

  const segs = phases.map((p, i) => {
    const before = phases.slice(0, i).reduce((a, ph) => a + ph.weeks, 0)
    const isCurrent = currentWeek > before && currentWeek <= before + p.weeks
    const isPast = before + p.weeks < currentWeek
    return { ...p, isCurrent, isPast }
  })

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {segs.map((p, i) => (
          <View
            key={`${p.name}-${i}`}
            className={p.isCurrent ? 'bg-sport-500' : p.isPast ? 'bg-sport-200' : 'bg-surface-sunken'}
            style={{ height: 8, borderRadius: 999, flexGrow: p.weeks, flexBasis: 0 }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        {segs.map((p, i) => (
          <Text
            key={`${p.name}-label-${i}`}
            className={p.isCurrent ? 'text-sport-600' : 'text-subtle'}
            numberOfLines={1}
            style={{ fontSize: 10, fontFamily: p.isCurrent ? FONT.uiExtra : FONT.uiSemibold }}
          >
            {p.name}
          </Text>
        ))}
      </View>
    </View>
  )
}
