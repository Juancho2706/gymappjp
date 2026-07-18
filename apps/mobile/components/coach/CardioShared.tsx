import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ChevronLeft, HeartPulse } from 'lucide-react-native'
import type { HrZoneRange } from '@eva/cardio'
import { useTheme } from '../../context/ThemeContext'
import type { Theme } from '../../lib/theme'
import { FONT } from '../../lib/typography'
import { Badge } from '../Badge'

/**
 * Piezas compartidas del modulo Cardio (E6-03): identidad de zona Z1-Z5, la lista de
 * zonas resultantes y el header con tile de marca + badge "Modulo". Reutilizadas por el
 * hub (`/coach/cardio`) y el perfil del alumno (`/coach/cardio/[clientId]`) — 1:1 con el
 * ZONE_META de la web (recuperacion aqua → VO2max danger; Z3 Tempo sigue la marca).
 */

/** Nombre es-neutro de cada zona (identico a la web). */
export const ZONE_NAME: Record<number, string> = {
  1: 'Recuperación',
  2: 'Base aeróbica',
  3: 'Tempo',
  4: 'Umbral',
  5: 'VO₂ max',
}

/**
 * Color de identidad de la zona. Z3 (Tempo) usa la marca (theme.primary), espejo de
 * `var(--sport-500)` que se rederiva al color del coach en white-label; el resto son
 * tonos semanticos fijos del DS (aqua / success / warning / danger).
 */
export function zoneColor(zone: number, theme: Theme): string {
  switch (zone) {
    case 1:
      return theme.cyan // --aqua-500
    case 2:
      return theme.success // --success-500
    case 3:
      return theme.primary // --sport-500 (marca)
    case 4:
      return '#F5A524' // --warning-500
    case 5:
      return theme.destructive // --danger-500
    default:
      return theme.primary
  }
}

/** Lista de zonas Z1-Z5: cuadro de color + nombre + rango de bpm en mono. */
export function CardioZoneList({ zones }: { zones: HrZoneRange[] }) {
  const { theme } = useTheme()
  return (
    <View>
      {zones.map((z, i) => (
        <View
          key={z.zone}
          style={[
            styles.zoneRow,
            i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border } : null,
          ]}
        >
          <View style={[styles.zoneChip, { backgroundColor: zoneColor(z.zone, theme) }]}>
            <Text style={styles.zoneChipTxt}>Z{z.zone}</Text>
          </View>
          <Text style={[styles.zoneName, { color: theme.foreground, fontFamily: FONT.uiSemibold }]} numberOfLines={1}>
            {ZONE_NAME[z.zone]}
          </Text>
          <Text style={[styles.zoneRange, { color: theme.textSecondary, fontFamily: FONT.monoBold }]}>
            {z.minBpm}–{z.maxBpm}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** Header del modulo: back + tile de marca (HeartPulse) + titulo/subtitulo + badge "Modulo". */
export function CardioHeader({
  title,
  subtitle,
  onBack,
  showBadge = false,
}: {
  title: string
  subtitle: string
  onBack: () => void
  showBadge?: boolean
}) {
  const { theme } = useTheme()
  return (
    <View style={styles.header}>
      <TouchableOpacity
        testID="cardio-back"
        onPress={onBack}
        activeOpacity={0.8}
        style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
      >
        <ChevronLeft size={20} color={theme.foreground} />
      </TouchableOpacity>
      <View className="bg-sport-100" style={styles.iconTile}>
        <HeartPulse size={18} color={theme.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.hTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.hSub, { color: theme.mutedForeground, fontFamily: FONT.ui }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {showBadge ? (
        <Badge tone="sport" variant="soft" size="sm">
          Módulo
        </Badge>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hTitle: { fontSize: 19, letterSpacing: -0.4 },
  hSub: { fontSize: 12.5, marginTop: 1 },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  zoneChip: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneChipTxt: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: FONT.displayBold,
  },
  zoneName: { flex: 1, fontSize: 14 },
  zoneRange: { fontSize: 13, letterSpacing: -0.2 },
})
