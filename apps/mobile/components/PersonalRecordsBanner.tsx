import { useEffect, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { Trophy } from 'lucide-react-native'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import { getPersonalRecords } from '../lib/history.queries'
import { useTheme } from '../context/ThemeContext'

interface PR {
  exerciseId: string
  exerciseName: string
  weightKg: number
  achievedAt: string
}

interface Props {
  clientId: string
}

export function PersonalRecordsBanner({ clientId }: Props) {
  const { theme } = useTheme()
  const [prs, setPrs] = useState<PR[]>([])

  useEffect(() => {
    getPersonalRecords(clientId).then((data) => {
      if (data.length > 0) {
        setPrs(data)
        const recent24h = data.some(
          (pr) => Date.now() - new Date(pr.achievedAt).getTime() < 86400000
        )
        if (recent24h) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        }
      }
    })
  }, [clientId])

  if (prs.length === 0) return null

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>
        🏆 Récords personales
      </Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={prs}
        keyExtractor={(pr) => pr.exerciseId}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <MotiView
            from={{ scale: 0, rotate: '-10deg' }}
            animate={{ scale: 1, rotate: '0deg' }}
            transition={{ type: 'spring', damping: 12, delay: index * 80 }}
          >
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: '#F59E0B' + '18',
                  borderColor: '#F59E0B' + '50',
                  borderRadius: theme.radius.xl,
                },
              ]}
            >
              <Trophy size={14} color="#F59E0B" strokeWidth={2} />
              <View style={styles.badgeText}>
                <Text style={[styles.exerciseName, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]} numberOfLines={1}>
                  {item.exerciseName}
                </Text>
                <Text style={[styles.weight, { color: '#F59E0B', fontFamily: 'Archivo_800ExtraBold' }]}>
                  {item.weightKg} kg
                </Text>
              </View>
            </View>
          </MotiView>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  title: { fontSize: 14, paddingHorizontal: 0 },
  list: { gap: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 130,
  },
  badgeText: { gap: 2 },
  exerciseName: { fontSize: 12, maxWidth: 110 },
  weight: { fontSize: 15, letterSpacing: -0.3 },
})
