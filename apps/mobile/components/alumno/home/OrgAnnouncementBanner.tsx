import { StyleSheet, Text, View } from 'react-native'
import { MotiView } from 'moti'
import type { OrgAnnouncement } from '../../../lib/org-announcements'

interface Props {
  announcements: OrgAnnouncement[]
}

/** §1 dashboard alumno — avisos activos de la org. Espejo de web OrgAnnouncementBanner. */
export function OrgAnnouncementBanner({ announcements }: Props) {
  if (announcements.length === 0) return null

  return (
    <MotiView
      testID="org-announcement-banner"
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 380 }}
      style={styles.stack}
    >
      {announcements.map((a) => (
        // info-* es rampa DS FIJA (nunca white-label). Tokens espejan web:
        // borde info-500/30, fondo info-100 (dark tinta el -100 al 18% == web --info-100 dark).
        <View
          key={a.id}
          className="rounded-card border border-info-500/30 bg-info-100 dark:bg-info-100/[0.18]"
          style={styles.card}
        >
          <Text className="font-sans-bold text-sm text-info-600">{a.title}</Text>
          <Text className="font-sans text-sm text-info-600" style={styles.body}>
            {a.body}
          </Text>
        </View>
      ))}
    </MotiView>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  card: { paddingHorizontal: 16, paddingVertical: 12 },
  body: { marginTop: 2, lineHeight: 18 },
})
