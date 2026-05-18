import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useOrg } from '../../../context/OrgContext'
import { getOrgStats, type OrgStats } from '../../../lib/org-admin'

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

export default function DashboardScreen() {
  const { org, loading: orgLoading } = useOrg()
  const [stats, setStats] = useState<OrgStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    if (!org) return
    const s = await getOrgStats(org.orgId)
    setStats(s)
    setLoading(false)
  }

  useEffect(() => {
    if (org) load()
  }, [org])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  if (orgLoading || loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </SafeAreaView>
    )
  }

  if (!org) return null

  const roleLabels: Record<string, string> = {
    org_owner: 'Dueño',
    org_admin: 'Administrador',
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.orgName}>{org.orgName}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{roleLabels[org.orgRole] ?? org.orgRole}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Resumen</Text>

        <View style={styles.statsRow}>
          <StatCard label="Coaches" value={stats?.totalCoaches ?? 0} color="#007AFF" />
          <StatCard label="Clientes" value={stats?.totalClients ?? 0} color="#10B981" />
          <StatCard label="Activos" value={stats?.activeClients ?? 0} color="#F59E0B" />
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Gestión web disponible</Text>
          <Text style={styles.infoText}>
            Para configurar branding, facturación y opciones avanzadas, visita{' '}
            <Text style={styles.infoLink}>enterprise.eva-app.cl</Text> desde tu navegador.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: '#007AFF',
    padding: 24,
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orgName: { fontSize: 22, fontWeight: '800', color: '#fff', flex: 1 },
  roleBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  roleText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 24,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: { fontSize: 32, fontWeight: '800' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 4, fontWeight: '600' },
  infoCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#1D4ED8', marginBottom: 4 },
  infoText: { fontSize: 13, color: '#3B82F6', lineHeight: 20 },
  infoLink: { fontWeight: '700' },
})
