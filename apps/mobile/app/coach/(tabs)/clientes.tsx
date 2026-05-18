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
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { useTheme } from '../../../context/ThemeContext'

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

  function renderClient({ item }: { item: Client }) {
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => router.push(`/coach/cliente/${item.id}`)}
        activeOpacity={0.75}
      >
        <View style={styles.cardLeft}>
          <View style={styles.avatar}>
            <Text style={[styles.avatarText, { color: theme.primary }]}>
              {item.full_name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.cardInfo}>
            <Text style={[styles.name, { color: theme.text }]}>{item.full_name}</Text>
            <Text style={[styles.email, { color: theme.muted }]}>{item.email}</Text>
          </View>
        </View>
        <View style={[
          styles.badge,
          { backgroundColor: item.is_active ? theme.success + '22' : theme.muted + '22' },
        ]}>
          <Text style={[styles.badgeText, { color: item.is_active ? theme.success : theme.muted }]}>
            {item.is_active ? 'Activo' : 'Inactivo'}
          </Text>
        </View>
      </TouchableOpacity>
    )
  }

  const activeCount = clients.filter((c) => c.is_active).length

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Clientes</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          {activeCount} activo{activeCount !== 1 ? 's' : ''} · {clients.length} total
        </Text>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Buscar cliente..."
          placeholderTextColor={theme.muted}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.muted }]}>
            {search ? 'Sin resultados' : 'Sin clientes aún'}
          </Text>
        </View>
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
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 2 },
  searchWrap: { marginHorizontal: 16, marginBottom: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  searchInput: { height: 42, fontSize: 15 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#007AFF22', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700' },
  cardInfo: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600' },
  email: { fontSize: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15 },
})
