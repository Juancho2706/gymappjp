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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useOrg } from '../../../context/OrgContext'
import { getOrgCoaches, removeCoachFromOrg, type OrgCoach } from '../../../lib/org-admin'
import { supabase } from '../../../lib/supabase'

const ROLE_LABELS: Record<string, string> = {
  org_owner: 'Dueño',
  org_admin: 'Admin',
  coach: 'Coach',
}

const ROLE_COLORS: Record<string, string> = {
  org_owner: '#7C3AED',
  org_admin: '#2563EB',
  coach: '#059669',
}

export default function CoachesScreen() {
  const { org } = useOrg()
  const [coaches, setCoaches] = useState<OrgCoach[]>([])
  const [filtered, setFiltered] = useState<OrgCoach[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [showInvite, setShowInvite] = useState(false)

  async function load() {
    if (!org) return
    const data = await getOrgCoaches(org.orgId)
    setCoaches(data)
    setFiltered(data)
    setLoading(false)
  }

  useEffect(() => { if (org) load() }, [org])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(coaches.filter((c) =>
      c.fullName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    ))
  }, [search, coaches])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function handleInvite() {
    if (!inviteEmail.trim() || !org) return
    setInviting(true)

    const { error } = await supabase
      .from('organization_invites')
      .insert({
        organization_id: org.orgId,
        email: inviteEmail.trim().toLowerCase(),
        role: 'coach',
        invited_by: org.userId,
      })

    setInviting(false)

    if (error) {
      Alert.alert('Error', error.code === '23505' ? 'Este email ya fue invitado.' : error.message)
      return
    }

    setInviteEmail('')
    setShowInvite(false)
    Alert.alert('Invitación enviada', `Se envió un email a ${inviteEmail.trim()}.`)
  }

  async function handleRemove(coach: OrgCoach) {
    if (coach.role === 'org_owner') {
      Alert.alert('No permitido', 'No puedes remover al dueño de la organización.')
      return
    }
    Alert.alert(
      'Remover coach',
      `¿Remover a ${coach.fullName} de la organización? Sus clientes quedarán sin coach asignado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            await removeCoachFromOrg(org!.orgId, coach.id)
            load()
          },
        },
      ]
    )
  }

  const renderItem = useCallback(({ item }: { item: OrgCoach }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/org/coach/${item.userId}`)}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.fullName.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{item.fullName}</Text>
        <Text style={styles.cardEmail}>{item.email}</Text>
        <Text style={styles.cardSub}>{item.clientCount} clientes activos</Text>
      </View>
      <View style={styles.cardRight}>
        <View style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[item.role] + '20' }]}>
          <Text style={[styles.roleText, { color: ROLE_COLORS[item.role] }]}>
            {ROLE_LABELS[item.role]}
          </Text>
        </View>
        {item.role !== 'org_owner' && org?.orgRole === 'org_owner' && (
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => handleRemove(item)}
          >
            <Text style={styles.removeBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  ), [org])

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
        <Text style={styles.title}>Coaches</Text>
        <TouchableOpacity style={styles.inviteBtn} onPress={() => setShowInvite(!showInvite)}>
          <Text style={styles.inviteBtnText}>{showInvite ? 'Cancelar' : '+ Invitar'}</Text>
        </TouchableOpacity>
      </View>

      {showInvite && (
        <View style={styles.inviteBox}>
          <TextInput
            style={styles.inviteInput}
            placeholder="email del coach"
            placeholderTextColor="#9CA3AF"
            value={inviteEmail}
            onChangeText={setInviteEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity
            style={[styles.sendBtn, inviting && styles.sendBtnDisabled]}
            onPress={handleInvite}
            disabled={inviting}
          >
            {inviting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>Enviar invitación</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <TextInput
        style={styles.search}
        placeholder="Buscar coach..."
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
          <Text style={styles.empty}>No hay coaches en esta organización.</Text>
        }
      />
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
  inviteBtn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  inviteBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  inviteBox: {
    backgroundColor: '#fff',
    padding: 16,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  inviteInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#111827',
  },
  sendBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
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
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  cardEmail: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  cardSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  roleText: { fontSize: 11, fontWeight: '700' },
  removeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtnText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#9CA3AF', padding: 32 },
})
