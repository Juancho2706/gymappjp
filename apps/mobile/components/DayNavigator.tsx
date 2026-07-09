import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { FONT } from '../lib/typography'
import { formatRelativeDate, getTodayInSantiago, isoDateAddDays } from '../lib/date-utils'

interface Props {
  selectedDate: string
  onDateChange: (d: string) => void
  adherenceDates?: Set<string>
  isLoading?: boolean
}

export function DayNavigator({ selectedDate, onDateChange, adherenceDates, isLoading }: Props) {
  const { theme } = useTheme()
  const todayIso = getTodayInSantiago().iso
  const isToday = selectedDate === todayIso
  const hasAdherence = adherenceDates?.has(selectedDate) ?? false

  function prev() {
    onDateChange(isoDateAddDays(selectedDate, -1))
  }

  function next() {
    if (!isToday) onDateChange(isoDateAddDays(selectedDate, 1))
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
      <TouchableOpacity onPress={prev} style={styles.arrow} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <ChevronLeft size={22} color={theme.foreground} strokeWidth={2} />
      </TouchableOpacity>

      <View style={styles.center}>
        {isLoading ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : (
          <>
            <Text style={[styles.dateText, { color: theme.foreground, fontFamily: FONT.uiBold }]}>
              {formatRelativeDate(selectedDate, todayIso)}
            </Text>
            {!isToday && (
              <Text style={[styles.dateSub, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
                {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
              </Text>
            )}
            {hasAdherence && (
              <View style={[styles.dot, { backgroundColor: '#FF6A3D' }]} />
            )}
          </>
        )}
      </View>

      <TouchableOpacity
        onPress={next}
        style={[styles.arrow, isToday && styles.arrowDisabled]}
        activeOpacity={isToday ? 1 : 0.7}
        disabled={isToday}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <ChevronRight size={22} color={isToday ? theme.mutedForeground : theme.foreground} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowDisabled: { opacity: 0.3 },
  center: { flex: 1, alignItems: 'center', gap: 2 },
  dateText: { fontSize: 15 },
  dateSub: { fontSize: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
})
