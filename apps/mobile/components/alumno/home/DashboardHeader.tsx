import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../../context/ThemeContext'
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
  const { theme } = useTheme()
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
            style={{ fontFamily: FONT.uiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4 }}
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
