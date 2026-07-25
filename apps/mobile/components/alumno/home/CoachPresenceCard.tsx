import { Text, View } from 'react-native'
import { MotiView } from 'moti'
import { FONT } from '../../../lib/typography'
import { Avatar } from '../../Avatar'
import { Card } from '../../Card'

/**
 * §6 CoachPresenceCard (web `coach/CoachPresenceCard.tsx`): tarjeta INFORMATIVA
 * (NO navega — no promete mensajeria). Avatar del coach (ring ember) + nombre +
 * badge "Tu coach" + nota (welcome_message o linea de acompanamiento fija).
 */
export function CoachPresenceCard({ brandName, note }: { brandName: string | null; note: string | null }) {
  const displayName = brandName || 'Tu coach'
  const noteText = note || 'Estoy atento a tu progreso. ¡Seguimos!'
  return (
    <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 360, delay: 60 }}>
      <Card padding="md" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={displayName} size="md" ring="ember" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text className="text-strong" numberOfLines={1} style={{ flexShrink: 1, minWidth: 0, fontFamily: FONT.uiExtra, fontSize: 13.5 }}>
              {displayName}
            </Text>
            {/* Pill local con metricas exactas del span web (CoachPresenceCard.tsx:38
                `rounded-pill bg-ember-100 px-1.5 py-px text-[10px] font-bold text-ember-700`);
                el Badge DS sm (h20/px8/fs11) quedaba mas grande que el web. */}
            <View className="rounded-pill bg-ember-100 dark:bg-ember-100/20" style={{ flexShrink: 0, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text className="text-ember-700" numberOfLines={1} style={{ fontFamily: FONT.uiBold, fontSize: 10 }}>
                Tu coach
              </Text>
            </View>
          </View>
          <Text className="text-muted font-sans" numberOfLines={2} style={{ fontSize: 12, lineHeight: 16, marginTop: 2 }}>
            {noteText}
          </Text>
        </View>
      </Card>
    </MotiView>
  )
}
