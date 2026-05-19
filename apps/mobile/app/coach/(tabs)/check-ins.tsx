import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { useTheme } from '../../../context/ThemeContext'

interface CheckIn {
  id: string
  client_id: string
  date: string
  weight: number | null
  energy_level: number | null
  front_photo_url: string | null
  notes: string | null
  clients: { full_name: string } | null
}

function energyColor(level: number | null): string {
  if (level == null) return '#9CA3AF'
  if (level <= 3) return '#EF4444'
  if (level <= 6) return '#F59E0B'
  return '#10B981'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CheckInsScreen() {
  const { theme } = useTheme()
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const coach = await getCoachProfile()
    if (!coach) { setLoading(false); return }

    const { data: clientRows } = await supabase
      .from('clients')
      .select('id')
      .eq('coach_id', coach.id)
      .eq('is_archived', false)

    const clientIds = (clientRows ?? []).map((c) => c.id)
    if (!clientIds.length) { setLoading(false); return }

    const { data } = await supabase
      .from('check_ins')
      .select('id, client_id, date, weight, energy_level, front_photo_url, notes, clients ( full_name )')
      .in('client_id', clientIds)
      .order('date', { ascending: false })
      .limit(40)

    const rows = (data ?? []).map((row) => ({
      ...row,
      clients: Array.isArray(row.clients) ? row.clients[0] ?? null : row.clients,
    }))
    setCheckIns(rows as CheckIn[])
    setLoading(false)
  }

  function renderCheckIn({ item }: { item: CheckIn }) {
    const eColor = energyColor(item.energy_level)
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl },
        ]}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardLeft}>
            <Text
              style={[styles.clientName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}
              numberOfLines={1}
            >
              {item.clients?.full_name ?? '—'}
            </Text>
            <Text style={[styles.dateText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {formatDate(item.date)}
            </Text>
          </View>
          <View style={styles.cardRight}>
            {item.weight != null && (
              <Text style={[styles.weight, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                {item.weight} kg
              </Text>
            )}
            {item.energy_level != null && (
              <View
                style={[styles.energyBadge, { backgroundColor: eColor + '22', borderRadius: theme.radius.sm }]}
              >
                <Text style={[styles.energyText, { color: eColor, fontFamily: 'Montserrat_700Bold' }]}>
                  {item.energy_level}/10
                </Text>
              </View>
            )}
          </View>
        </View>

        {item.energy_level != null && (
          <View style={[styles.energyBarBg, { backgroundColor: theme.muted }]}>
            <View
              style={[
                styles.energyBarFill,
                { width: `${item.energy_level * 10}%`, backgroundColor: eColor },
              ]}
            />
          </View>
        )}

        {item.front_photo_url && (
          <Text style={[styles.photoIndicator, { color: theme.primary, fontFamily: theme.fontSans }]}>
            📷 Foto adjunta
          </Text>
        )}
        {item.notes ? (
          <Text
            style={[styles.notes, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}
            numberOfLines={2}
          >
            {item.notes}
          </Text>
        ) : null}
      </View>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          Check-ins
        </Text>
        {!loading && (
          <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            {checkIns.length} {checkIns.length === 1 ? 'reciente' : 'recientes'}
          </Text>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      ) : checkIns.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            Sin check-ins aún
          </Text>
          <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Cuando tus alumnos registren su check-in semanal aparecerá acá.
          </Text>
        </View>
      ) : (
        <FlatList
          data={checkIns}
          keyExtractor={(c) => c.id}
          renderItem={renderCheckIn}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: { fontSize: 28, letterSpacing: -0.5 },
  subtitle: { fontSize: 13 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  card: { padding: 16, borderWidth: 1, gap: 10 },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardLeft: { gap: 3, flex: 1, minWidth: 0 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  clientName: { fontSize: 15 },
  dateText: { fontSize: 12 },
  weight: { fontSize: 15 },
  energyBadge: { paddingHorizontal: 8, paddingVertical: 3 },
  energyText: { fontSize: 11, letterSpacing: 0.3 },
  energyBarBg: { height: 4, borderRadius: 2, overflow: 'hidden' },
  energyBarFill: { height: 4, borderRadius: 2 },
  photoIndicator: { fontSize: 12, fontWeight: '500' },
  notes: { fontSize: 13, lineHeight: 18 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 17, marginBottom: 8 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
})
