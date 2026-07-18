import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Skeleton } from '../../Skeleton'
import { FONT, textStyle } from '../../../lib/typography'

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
          style={textStyle('2xl', FONT.displayBlack, { lh: 'snug', ls: 'tighter' })}
        >
          {greeting}
        </Text>
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
