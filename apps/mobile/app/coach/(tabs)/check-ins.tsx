import { useEffect, useState } from 'react'
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { Activity, Calendar, Camera, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { useTheme } from '../../../context/ThemeContext'
import { EmptyState, ScreenHeader } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'

interface CheckIn {
  id: string
  client_id: string
  date: string
  weight: number | null
  energy_level: number | null
  front_photo_url: string | null
  back_photo_url: string | null
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
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)

  useEffect(() => {
    load().catch(() => setLoading(false))
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
      .select('id, client_id, date, weight, energy_level, front_photo_url, back_photo_url, notes, clients ( full_name )')
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

  function renderCheckIn({ item, index }: { item: CheckIn; index: number }) {
    const eColor = energyColor(item.energy_level)
    return (
      <MotiView
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 350, delay: Math.min(index * 50, 400) }}
      >
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
                {item.clients?.full_name ?? '-'}
              </Text>
              <View style={styles.metaRow}>
                <Calendar size={13} color={theme.mutedForeground} />
                <Text style={[styles.dateText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  {formatDate(item.date)}
                </Text>
              </View>
            </View>
            <View style={styles.cardRight}>
              {item.weight != null && (
                <Text style={[styles.weight, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                  {item.weight} kg
                </Text>
              )}
              {item.energy_level != null && (
                <View style={[styles.energyBadge, { backgroundColor: eColor + '22', borderRadius: theme.radius.sm }]}>
                  <Activity size={12} color={eColor} />
                  <Text style={[styles.energyText, { color: eColor, fontFamily: 'Montserrat_700Bold' }]}>
                    {item.energy_level}/10
                  </Text>
                </View>
              )}
            </View>
          </View>

          {item.energy_level != null && (
            <View style={[styles.energyBarBg, { backgroundColor: theme.muted }]}>
              <View style={[styles.energyBarFill, { width: `${item.energy_level * 10}%`, backgroundColor: eColor }]} />
            </View>
          )}

          {(item.front_photo_url || item.back_photo_url) ? (
            <View style={styles.photoThumbs}>
              {([item.front_photo_url, item.back_photo_url].filter(Boolean) as string[]).map((url, i) => (
                <TouchableOpacity key={i} onPress={() => setViewerUrl(url)} activeOpacity={0.85}>
                  <Image source={{ uri: url }} style={[styles.thumb, { borderColor: theme.border }]} contentFit="cover" transition={150} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          {item.notes ? (
            <Text style={[styles.notes, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={2}>
              {item.notes}
            </Text>
          ) : null}
        </View>
      </MotiView>
    )
  }

  return (
    <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader
        title="Check-ins"
        subtitle={!loading ? `${checkIns.length} ${checkIns.length === 1 ? 'reciente' : 'recientes'}` : undefined}
      />

      {loading ? (
        <EvaLoaderScreen subtitle="Cargando check-ins..." />
      ) : checkIns.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="Sin check-ins aun"
          subtitle="Cuando tus alumnos registren su check-in semanal apareceran aca."
        />
      ) : (
        <FlatList
          data={checkIns}
          keyExtractor={(c) => c.id}
          renderItem={renderCheckIn}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={!!viewerUrl} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setViewerUrl(null)}>
        <Pressable style={styles.viewerOverlay} onPress={() => setViewerUrl(null)}>
          {viewerUrl ? <Image source={{ uri: viewerUrl }} style={styles.viewerImg} contentFit="contain" transition={150} /> : null}
          <View style={styles.viewerClose}><X size={24} color="#fff" /></View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  card: { padding: 16, borderWidth: 1, gap: 10 },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardLeft: { gap: 4, flex: 1, minWidth: 0 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  clientName: { fontSize: 15 },
  dateText: { fontSize: 12 },
  weight: { fontSize: 15 },
  energyBadge: { paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 },
  energyText: { fontSize: 11, letterSpacing: 0.3 },
  energyBarBg: { height: 4, borderRadius: 2, overflow: 'hidden' },
  energyBarFill: { height: 4, borderRadius: 2 },
  photoThumbs: { flexDirection: 'row', gap: 8 },
  thumb: { width: 64, height: 80, borderRadius: 10, borderWidth: 1 },
  notes: { fontSize: 13, lineHeight: 18 },
  viewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '82%' },
  viewerClose: { position: 'absolute', top: 48, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
})
