import { StyleSheet, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import type { OrgAnnouncement } from '../../../lib/org-announcements'

// info-* es una rampa DS FIJA (nunca white-label). Valores verbatim de global.css.
const INFO = {
  light: { bg: '#E8F1FF', border: 'rgba(38,128,255,0.30)', fg: '#1462DC' },
  dark: { bg: 'rgba(38,128,255,0.18)', border: 'rgba(38,128,255,0.30)', fg: '#7FB0FF' },
}

interface Props {
  announcements: OrgAnnouncement[]
}

/** §1 dashboard alumno — avisos activos de la org. Espejo de web OrgAnnouncementBanner. */
export function OrgAnnouncementBanner({ announcements }: Props) {
  const { resolvedScheme } = useTheme()
  if (announcements.length === 0) return null
  const c = INFO[resolvedScheme]

  return (
    <MotiView
      testID="org-announcement-banner"
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 380 }}
      style={styles.stack}
    >
      {announcements.map((a) => (
        <View key={a.id} style={[styles.card, { backgroundColor: c.bg, borderColor: c.border }]}>
          <Text className="font-sans-bold text-[13.5px]" style={{ color: c.fg }}>{a.title}</Text>
          <Text className="font-sans text-[13px]" style={[styles.body, { color: c.fg }]}>{a.body}</Text>
        </View>
      ))}
    </MotiView>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  card: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
  body: { marginTop: 2, lineHeight: 18 },
})
