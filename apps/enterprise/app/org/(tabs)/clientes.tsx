import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  TextInput,
  RefreshControl,
  Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useOrg } from '../../../context/OrgContext'
import {
  getOrgClients,
  getOrgCoaches,
  assignClientToCoach,
  type OrgClient,
  type OrgCoach,
} from '../../../lib/org-admin'

export default function ClientesScreen() {
  const { org } = useOrg()
  const [clients, setClients] = useState<OrgClient[]>([])
  const [coaches, setCoaches] = useState<OrgCoach[]>([])
  const [filtered, setFiltered] = useState<OrgClient[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [assignTarget, setAssignTarget] = useState<OrgClient | null>(null)

  async function load() {
    if (!org) return
    const [c, coaches] = await Promise.all([
      getOrgClients(org.orgId),
      getOrgCoaches(org.orgId),
    ])
    setClients(c)
    setCoaches(coaches)
    setFiltered(c)
    setLoading(false)
  }

  useEffect(() => { if (org) load() }, [org])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(clients.filter((c) =>
      c.fullName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    ))
  }, [search, clients])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function handleAssign(client: OrgClient, coach: OrgCoach) {
    await assignClientToCoach(client.id, coach.userId)
    setAssignTarget(null)
    load()
  }

  const renderItem = useCallback(({ item }: { item: OrgClient }) => (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.fullName.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{item.fullName}</Text>
        <Text style={styles.cardEmail}>{item.email}</Text>
        <Text style={[styles.cardCoach, !item.coachName && styles.cardCoachEmpty]}>
          {item.coachName ? `Coach: ${item.coachName}` : 'Sin coach asignado'}
        </Text>
      </View>
      <View style={styles.cardRight}>
        <View style={[styles.activeBadge, { backgroundColor: item.isActive ? '#D1FAE5' : '#F3F4F6' }]}>
          <Text style={[styles.activeText, { color: item.isActive ? '#059669' : '#9CA3AF' }]}>
            {item.isActive ? 'Activo' : 'Inactivo'}
          </Text>
        </View>
        <TouchableOpacity style={styles.assignBtn} onPress={() => setAssignTarget(item)}>
          <Text style={styles.assignBtnText}>Asignar</Text>
        </TouchableOpacity>
      </View>
    </View>
  ), [])

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Clientes</Text>
        <Text style={styles.count}>{clients.length} total</Text>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Buscar cliente..."
        placeholderTextColor="#9CA3AF"
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No hay clientes en esta organización.</Text>
        }
      />

      <Modal visible={!!assignTarget} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Asignar coach</Text>
            {assignTarget && (
              <Text style={styles.modalSub}>para {assignTarget.fullName}</Text>
            )}
            {coaches.map((coach) => (
              <TouchableOpacity
                key={coach.id}
                style={[
                  styles.coachOption,
                  assignTarget?.coachId === coach.userId && styles.coachOptionActive,
                ]}
                onPress={() => assignTarget && handleAssign(assignTarget, coach)}
              >
                <Text style={styles.coachOptionName}>{coach.fullName}</Text>
                <Text style={styles.coachOptionSub}>{coach.clientCount} clientes</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setAssignTarget(null)}
            >
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  count: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
  search: {
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  list: { paddingHorizontal: 12, gap: 8, paddingBottom: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  cardEmail: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  cardCoach: { fontSize: 12, color: '#007AFF', marginTop: 2, fontWeight: '600' },
  cardCoachEmpty: { color: '#F59E0B' },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  activeText: { fontSize: 11, fontWeight: '700' },
  assignBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  assignBtnText: { color: '#2563EB', fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#9CA3AF', padding: 32 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  modalSub: { fontSize: 14, color: '#6B7280', marginBottom: 8 },
  coachOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  coachOptionActive: { borderColor: '#007AFF', backgroundColor: '#EFF6FF' },
  coachOptionName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  coachOptionSub: { fontSize: 13, color: '#6B7280' },
  modalCancel: {
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  modalCancelText: { color: '#EF4444', fontWeight: '700', fontSize: 15 },
})
