import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useOrg } from '../../../context/OrgContext'

interface CoachDetail {
  id: string
  fullName: string
  email: string
  brandName: string
  slug: string
  subscriptionStatus: string
  maxClients: number
  activeClientsCount: number
}

const STATUS_LABELS: Record<string, string> = {
  trialing: 'En prueba',
  active: 'Activo',
  past_due: 'Pago vencido',
  canceled: 'Cancelado',
  inactive: 'Inactivo',
}

const STATUS_COLORS: Record<string, string> = {
  trialing: '#F59E0B',
  active: '#10B981',
  past_due: '#EF4444',
  canceled: '#6B7280',
  inactive: '#6B7280',
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

export default function CoachDetailScreen() {
  const { coachId } = useLocalSearchParams<{ coachId: string }>()
  const { org } = useOrg()
  const [coach, setCoach] = useState<CoachDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!coachId) return
    load()
  }, [coachId])

  async function load() {
    const [coachRes, countRes] = await Promise.all([
      supabase
        .from('coaches')
        .select('id, full_name, email, brand_name, slug, subscription_status, max_clients')
        .eq('id', coachId)
        .single(),
      supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coachId)
        .eq('is_active', true),
    ])

    if (coachRes.data) {
      setCoach({
        id: coachRes.data.id,
        fullName: coachRes.data.full_name,
        email: coachRes.data.email ?? '',
        brandName: coachRes.data.brand_name ?? coachRes.data.full_name,
        slug: coachRes.data.slug,
        subscriptionStatus: coachRes.data.subscription_status ?? 'inactive',
        maxClients: coachRes.data.max_clients ?? 0,
        activeClientsCount: countRes.count ?? 0,
      })
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </SafeAreaView>
    )
  }

  if (!coach) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>Coach no encontrado.</Text>
      </SafeAreaView>
    )
  }

  const statusColor = STATUS_COLORS[coach.subscriptionStatus] ?? '#6B7280'
  const statusLabel = STATUS_LABELS[coach.subscriptionStatus] ?? coach.subscriptionStatus

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>← Coaches</Text>
      </TouchableOpacity>

      <ScrollView>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{coach.fullName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.heroName}>{coach.fullName}</Text>
          <Text style={styles.heroEmail}>{coach.email}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Información</Text>
        <View style={styles.section}>
          <InfoRow label="Marca" value={coach.brandName} />
          <InfoRow label="Slug" value={`/c/${coach.slug}`} />
          <InfoRow
            label="Clientes activos"
            value={`${coach.activeClientsCount} / ${coach.maxClients}`}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backBtn: { paddingHorizontal: 16, paddingVertical: 12 },
  backText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  hero: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    gap: 6,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 30 },
  heroName: { fontSize: 22, fontWeight: '800', color: '#111827' },
  heroEmail: { fontSize: 14, color: '#6B7280' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginTop: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 24,
    marginHorizontal: 16,
    marginBottom: 6,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  infoLabel: { fontSize: 14, color: '#6B7280' },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1, textAlign: 'right' },
  errorText: { color: '#EF4444', fontSize: 16 },
})
