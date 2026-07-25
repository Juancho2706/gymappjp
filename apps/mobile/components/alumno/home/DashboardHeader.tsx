import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import { Skeleton } from '../../Skeleton'
import { useEvaMotion } from '../../../lib/motion'
import { FONT, textStyle } from '../../../lib/typography'

// Spring "snappy" del web (`animation-presets.ts:4` stiffness 400 / damping 30) —
// mismo resorte para el fade del dateLabel y el stagger palabra-por-palabra.
const SPRING_SNAPPY = { type: 'spring', stiffness: 400, damping: 30 } as const

/**
 * §2 DashboardHeader (web `DashboardHeader.tsx`): eyebrow con `brandName`, saludo
 * `{timeGreeting}, {firstName}` (display), fecha larga Santiago y `welcome_message`
 * opcional. En RN se monta como PRIMER hijo del ScrollView (full-bleed) para que
 * SCROLLEE con el contenido — paridad con el header web md (el CEO marco el header
 * fijo como divergencia). Superficie `surface-app`, `pt-safe` y borde inferior sutil.
 */
export function DashboardHeader({
  greeting,
  dateLabel,
  brandName,
  welcomeMessage,
}: {
  greeting: string
  dateLabel: string
  brandName?: string | null
  welcomeMessage?: string | null
}) {
  const insets = useSafeAreaInsets()
  const motion = useEvaMotion()
  const greetingStyle = textStyle('2xl', FONT.displayBlack, { lh: 'snug', ls: 'tighter' })
  return (
    <View
      className="bg-surface-app border-b border-subtle"
      style={{ paddingTop: insets.top, paddingHorizontal: 16, zIndex: 40 }}
    >
      <View style={{ minHeight: 56, justifyContent: 'center', paddingVertical: 8 }}>
        {brandName ? (
          <Text
            className="text-subtle"
            numberOfLines={1}
            style={{ fontFamily: FONT.uiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}
          >
            {brandName}
          </Text>
        ) : null}
        {motion.reduced ? (
          // Rama estatica = web ClientGreeting.tsx:14-21 (reduced motion sin animacion).
          <>
            <Text
              className="text-muted"
              numberOfLines={1}
              style={{ fontFamily: FONT.uiSemibold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}
            >
              {dateLabel}
            </Text>
            <Text
              className="text-strong"
              numberOfLines={1}
              style={greetingStyle}
            >
              {greeting}
            </Text>
          </>
        ) : (
          // Entrada animada del saludo (web ClientGreeting.tsx:24-43): dateLabel fade-in
          // spring snappy + saludo con stagger palabra-por-palabra (staggerContainer(0.04)
          // → delay 40ms/palabra; fadeSlideUp opacity 0/y16 → 1/0). Re-dispara al cambiar
          // el dia via `key={dateLabel}` (espejo del `key={iso}` web DashboardHeader.tsx:27).
          // Adaptacion RN: las palabras van en un row con overflow hidden (no hay ellipsis
          // por-palabra como el `truncate` web).
          <View key={dateLabel}>
            <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={SPRING_SNAPPY}>
              <Text
                className="text-muted"
                numberOfLines={1}
                style={{ fontFamily: FONT.uiSemibold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}
              >
                {dateLabel}
              </Text>
            </MotiView>
            <View style={{ flexDirection: 'row', flexWrap: 'nowrap', overflow: 'hidden' }}>
              {greeting.split(' ').map((w, i) => (
                <MotiView
                  key={`${w}-${i}`}
                  from={{ opacity: 0, translateY: 16 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ ...SPRING_SNAPPY, delay: i * 40 }}
                >
                  <Text className="text-strong" numberOfLines={1} style={[greetingStyle, { marginRight: 4 }]}>
                    {w}
                  </Text>
                </MotiView>
              ))}
            </View>
          </View>
        )}
        {welcomeMessage ? (
          <Text className="text-muted" numberOfLines={1} style={{ marginTop: 2, fontSize: 11, fontFamily: FONT.ui }}>
            {welcomeMessage}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/**
 * Skeleton del header para el estado loading (paridad con `DashboardHeaderSkeleton`
 * web, `dashboard-skeletons.tsx:19-28`): MISMA superficie/borde/insets que el header
 * real pero con barras `Skeleton` en vez de TEXTO de saludo. Critico para el P0-3:
 * durante la carga NO se pinta ningun saludo placeholder ("Hola"/"Buenas tardes")
 * → el saludo textual aparece UNA sola vez, ya con el nombre final, al terminar la
 * carga (elimina el swap que se leia como duplicado/marquee).
 */
export function DashboardHeaderSkeleton() {
  const insets = useSafeAreaInsets()
  return (
    <View
      className="bg-surface-app border-b border-subtle"
      style={{ paddingTop: insets.top, paddingHorizontal: 16, zIndex: 40 }}
    >
      <View style={{ minHeight: 56, justifyContent: 'center', paddingVertical: 8, gap: 6 }}>
        <Skeleton width={110} height={10} radius={4} />
        <Skeleton width={200} height={24} radius={6} />
      </View>
    </View>
  )
}
