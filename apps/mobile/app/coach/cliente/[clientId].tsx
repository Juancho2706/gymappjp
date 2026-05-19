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
      `Para enviar notificaciones a ${client?.full_name ?? 'este alumno'}, usá la app web desde eva-app.cl.`,
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
        <View style={[styles.navBar, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={[styles.back, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
              ← Volver
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            Alumno no encontrado
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.navBar, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.back, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
            ← Volver
          </Text>
        </TouchableOpacity>
        <Text
          style={[styles.navTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}
          numberOfLines={1}
        >
          {client.full_name}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.heroCard,
            { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl },
          ]}
        >
          <View
            style={[
              styles.heroAvatar,
              {
                backgroundColor: theme.primary + '1A',
                borderColor: theme.primary + '33',
                borderRadius: theme.radius['2xl'],
              },
            ]}
          >
            <Text
              style={[styles.heroAvatarText, { color: theme.primary, fontFamily: 'Montserrat_800ExtraBold' }]}
            >
              {client.full_name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.heroName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            {client.full_name}
          </Text>
          <Text style={[styles.heroEmail, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            {client.email}
          </Text>
          <View
            style={[
              styles.heroBadge,
              {
                backgroundColor: client.is_active ? theme.success + '22' : theme.muted + '88',
                borderRadius: theme.radius.sm,
              },
            ]}
          >
            <Text
              style={[
                styles.heroBadgeText,
                {
                  color: client.is_active ? theme.success : theme.mutedForeground,
                  fontFamily: 'Montserrat_700Bold',
                },
              ]}
            >
              {client.is_active ? 'Activo' : 'Inactivo'}
            </Text>
          </View>
        </View>

        {(client.phone || client.goal_weight_kg != null || client.subscription_start_date) && (
          <View
            style={[
              styles.infoCard,
              { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl },
            ]}
          >
            {client.phone && <InfoRow label="Teléfono" value={client.phone} theme={theme} />}
            {client.goal_weight_kg != null && (
              <InfoRow label="Peso objetivo" value={`${client.goal_weight_kg} kg`} theme={theme} />
            )}
            {client.subscription_start_date && (
              <InfoRow
                label="Alumno desde"
                value={formatDate(client.subscription_start_date)}
                theme={theme}
                last
              />
            )}
          </View>
        )}

        {lastCheckIn && (
          <View
            style={[
              styles.statCard,
              { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl },
            ]}
          >
            <Text
              style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}
            >
              Último check-in
            </Text>
            <Text style={[styles.statDate, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              {formatDate(lastCheckIn.date)}
            </Text>
            <View style={styles.statRow}>
              {lastCheckIn.weight != null && (
                <Text style={[styles.statValue, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                  {lastCheckIn.weight} kg
                </Text>
              )}
              {lastCheckIn.energy_level != null && (
                <Text style={[styles.statValue, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  Energía {lastCheckIn.energy_level}/10
                </Text>
              )}
            </View>
          </View>
        )}

        {activeProgram && (
          <View
            style={[
              styles.statCard,
              { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl },
            ]}
          >
            <Text
              style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}
            >
              Programa activo
            </Text>
            <Text style={[styles.statDate, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              {activeProgram.name}
            </Text>
            <Text style={[styles.statValue, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {activeProgram.planCount} plan{activeProgram.planCount !== 1 ? 'es' : ''}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.reminderBtn,
            {
              borderColor: theme.primary + '40',
              backgroundColor: theme.primary + '0D',
              borderRadius: theme.radius.lg,
            },
          ]}
          onPress={sendReminder}
          activeOpacity={0.8}
        >
          <Text style={[styles.reminderText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
            Enviar recordatorio
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

function InfoRow({ label, value, theme, last }: { label: string; value: string; theme: any; last?: boolean }) {
  return (
    <View
      style={[
        styles.infoRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
      ]}
    >
      <Text style={[styles.infoLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {label}
      </Text>
      <Text style={[styles.infoValue, { color: theme.foreground, fontFamily: theme.fontSans }]}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { fontSize: 14, width: 60, letterSpacing: 0.3 },
  navTitle: { fontSize: 15, flex: 1, textAlign: 'center', letterSpacing: -0.2 },
  scroll: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 40, gap: 12 },
  heroCard: { padding: 24, borderWidth: 1, alignItems: 'center', gap: 8 },
  heroAvatar: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroAvatarText: { fontSize: 30 },
  heroName: { fontSize: 19, letterSpacing: -0.3, marginTop: 4 },
  heroEmail: { fontSize: 13 },
  heroBadge: { paddingHorizontal: 10, paddingVertical: 4, marginTop: 6 },
  heroBadgeText: { fontSize: 11, letterSpacing: 0.3 },
  infoCard: { borderWidth: 1, overflow: 'hidden' },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: '500', textAlign: 'right', flexShrink: 1 },
  statCard: { padding: 18, borderWidth: 1, gap: 4 },
  statTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  statDate: { fontSize: 16, letterSpacing: -0.2 },
  statRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  statValue: { fontSize: 14 },
  reminderBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  reminderText: { fontSize: 14, letterSpacing: 0.3 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 17 },
})
