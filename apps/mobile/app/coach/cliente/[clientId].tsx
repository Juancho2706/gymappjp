import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useTheme } from '../../../context/ThemeContext'

interface ClientDetail {
  id: string
  full_name: string
  email: string
  phone: string | null
  is_active: boolean | null
  goal_weight_kg: number | null
  subscription_start_date: string | null
  created_at: string
}

interface LastCheckIn {
  date: string
  weight: number | null
  energy_level: number | null
}

interface ActiveProgram {
  name: string
  planCount: number
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function ClientDetailScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>()
  const { theme } = useTheme()
  const router = useRouter()

  const [client, setClient] = useState<ClientDetail | null>(null)
  const [lastCheckIn, setLastCheckIn] = useState<LastCheckIn | null>(null)
  const [activeProgram, setActiveProgram] = useState<ActiveProgram | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [clientId])

  async function load() {
    setLoading(true)
    const [{ data: clientData }, { data: checkInData }, { data: programData }] = await Promise.all([
      supabase
        .from('clients')
        .select('id, full_name, email, phone, is_active, goal_weight_kg, subscription_start_date, created_at')
        .eq('id', clientId)
        .maybeSingle(),
      supabase
        .from('check_ins')
        .select('date, weight, energy_level')
        .eq('client_id', clientId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('workout_programs')
        .select('name, workout_plans ( id )')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .maybeSingle(),
    ])

    setClient(clientData ?? null)
    setLastCheckIn(checkInData ?? null)
    if (programData) {
      setActiveProgram({
        name: programData.name,
        planCount: (programData.workout_plans as any[])?.length ?? 0,
      })
    }
    setLoading(false)
  }

  function sendReminder() {
    Alert.alert(
      'Recordatorio',
      `Para enviar notificaciones a ${client?.full_name ?? 'este cliente'}, usa la app web desde eva-app.cl.`,
      [{ text: 'OK' }]
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      </SafeAreaView>
    )
  }

  if (!client) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.back, { color: theme.primary }]}>← Volver</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.muted }]}>Cliente no encontrado</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.back, { color: theme.primary }]}>← Volver</Text>
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: theme.text }]} numberOfLines={1}>{client.full_name}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header card */}
        <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.heroAvatar, { backgroundColor: theme.primary + '22' }]}>
            <Text style={[styles.heroAvatarText, { color: theme.primary }]}>
              {client.full_name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.heroName, { color: theme.text }]}>{client.full_name}</Text>
          <Text style={[styles.heroEmail, { color: theme.muted }]}>{client.email}</Text>
          <View style={[
            styles.heroBadge,
            { backgroundColor: client.is_active ? theme.success + '22' : theme.muted + '22' },
          ]}>
            <Text style={[styles.heroBadgeText, { color: client.is_active ? theme.success : theme.muted }]}>
              {client.is_active ? 'Activo' : 'Inactivo'}
            </Text>
          </View>
        </View>

        {/* Info rows */}
        <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {client.phone && <InfoRow label="Teléfono" value={client.phone} theme={theme} />}
          {client.goal_weight_kg != null && (
            <InfoRow label="Peso objetivo" value={`${client.goal_weight_kg} kg`} theme={theme} />
          )}
          {client.subscription_start_date && (
            <InfoRow label="Cliente desde" value={formatDate(client.subscription_start_date)} theme={theme} />
          )}
        </View>

        {/* Last check-in */}
        {lastCheckIn && (
          <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.statTitle, { color: theme.muted }]}>Último check-in</Text>
            <Text style={[styles.statDate, { color: theme.text }]}>{formatDate(lastCheckIn.date)}</Text>
            <View style={styles.statRow}>
              {lastCheckIn.weight != null && (
                <Text style={[styles.statValue, { color: theme.text }]}>{lastCheckIn.weight} kg</Text>
              )}
              {lastCheckIn.energy_level != null && (
                <Text style={[styles.statValue, { color: theme.muted }]}>
                  Energía {lastCheckIn.energy_level}/10
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Active program */}
        {activeProgram && (
          <View style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.statTitle, { color: theme.muted }]}>Programa activo</Text>
            <Text style={[styles.statDate, { color: theme.text }]}>{activeProgram.name}</Text>
            <Text style={[styles.statValue, { color: theme.muted }]}>
              {activeProgram.planCount} plan{activeProgram.planCount !== 1 ? 'es' : ''}
            </Text>
          </View>
        )}

        {/* Send reminder */}
        <TouchableOpacity
          style={[styles.reminderBtn, { borderColor: theme.primary }]}
          onPress={sendReminder}
        >
          <Text style={[styles.reminderText, { color: theme.primary }]}>
            Enviar recordatorio
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

function InfoRow({ label, value, theme }: { label: string; value: string; theme: any }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.text }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back: { fontSize: 15, fontWeight: '600', width: 60 },
  navTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  heroCard: { borderRadius: 16, padding: 20, borderWidth: 1, alignItems: 'center', gap: 8 },
  heroAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  heroAvatarText: { fontSize: 28, fontWeight: '700' },
  heroName: { fontSize: 20, fontWeight: '700' },
  heroEmail: { fontSize: 13 },
  heroBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 4 },
  heroBadgeText: { fontSize: 12, fontWeight: '600' },
  infoCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#00000022' },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: '500' },
  statCard: { borderRadius: 14, padding: 16, borderWidth: 1, gap: 4 },
  statTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  statDate: { fontSize: 16, fontWeight: '600' },
  statRow: { flexDirection: 'row', gap: 16, marginTop: 2 },
  statValue: { fontSize: 14 },
  reminderBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5 },
  reminderText: { fontSize: 15, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15 },
})
