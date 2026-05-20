import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronRight, Search, Users } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, EmptyState, ScreenHeader } from '../../../components'

interface Client {
  id: string
  full_name: string
  email: string
  is_active: boolean | null
  phone: string | null
  created_at: string
}

export default function ClientesScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [filtered, setFiltered] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(
      q ? clients.filter((c) => c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) : clients
    )
  }, [search, clients])

  async function load() {
    setLoading(true)
    const coach = await getCoachProfile()
    if (!coach) { setLoading(false); return }

    const { data } = await supabase
      .from('clients')
      .select('id, full_name, email, is_active, phone, created_at')
      .eq('coach_id', coach.id)
      .eq('is_archived', false)
      .order('full_name')

    setClients(data ?? [])
    setFiltered(data ?? [])
    setLoading(false)
  }

  function renderClient({ item, index }: { item: Client; index: number }) {
    return (
      <MotiView
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 350, delay: Math.min(index * 50, 400) }}
      >
        <TouchableOpacity
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              borderRadius: theme.radius.xl,
            },
          ]}
          onPress={() => router.push(`/coach/cliente/${item.id}`)}
          activeOpacity={0.75}
        >
          <View style={styles.cardLeft}>
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: theme.primary + '1A',
                  borderColor: theme.primary + '33',
                  borderRadius: theme.radius.lg,
                },
              ]}
            >
              <Text
                style={[styles.avatarText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}
              >
                {item.full_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.cardInfo}>
              <Text
                style={[styles.name, { color: theme.foreground, fontFamily: theme.fontSans }]}
                numberOfLines={1}
              >
                {item.full_name}
              </Text>
              <Text
                style={[styles.email, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}
                numberOfLines={1}
              >
                {item.email}
              </Text>
            </View>
          </View>
          <View style={styles.cardRight}>
            <Badge
              label={item.is_active ? 'Activo' : 'Inactivo'}
              tone={item.is_active ? 'success' : 'muted'}
            />
            <ChevronRight size={18} color={theme.mutedForeground} />
          </View>
        </TouchableOpacity>
      </MotiView>
    )
  }

  const activeCount = clients.filter((c) => c.is_active).length

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Alumnos"
        subtitle={`${activeCount} activo${activeCount !== 1 ? 's' : ''} · ${clients.length} total`}
      />

      <View
        style={[
          styles.searchWrap,
          {
            backgroundColor: theme.secondary,
            borderColor: theme.border,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <Search size={16} color={theme.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]}
          placeholder="Buscar alumno..."
          placeholderTextColor={theme.mutedForeground}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? 'Sin resultados' : 'Sin alumnos aún'}
          subtitle={
            search
              ? 'Probá con otro término de búsqueda.'
              : 'Los alumnos que crees en el panel web aparecerán acá.'
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          renderItem={renderClient}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: { flex: 1, height: 44, fontSize: 15 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  card: {
    padding: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarText: { fontSize: 17 },
  cardInfo: { flex: 1, gap: 2, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '600' },
  email: { fontSize: 12 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
