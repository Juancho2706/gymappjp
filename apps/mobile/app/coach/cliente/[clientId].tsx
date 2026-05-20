import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Activity, Bell, Calendar, Dumbbell, Phone, Target, User } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, Button, EmptyState, InfoRow, Section, TopBar } from '../../../components'

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
      `Para enviar notificaciones a ${client?.full_name ?? 'este alumno'}, usa la app web desde eva-app.cl.`,
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
        <TopBar back title="Alumno" onBack={() => router.back()} />
        <EmptyState icon={User} title="Alumno no encontrado" subtitle="Vuelve a la lista de alumnos." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <TopBar back title={client.full_name} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 450 }}
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
            <User size={30} color={theme.primary} strokeWidth={1.75} />
          </View>
          <Text style={[styles.heroName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            {client.full_name}
          </Text>
          <Text style={[styles.heroEmail, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            {client.email}
          </Text>
          <Badge label={client.is_active ? 'Activo' : 'Inactivo'} tone={client.is_active ? 'success' : 'muted'} />
        </MotiView>

        {(client.phone || client.goal_weight_kg != null || client.subscription_start_date) ? (
          <Section title="Informacion">
            {client.phone ? <InfoRow label="Telefono" value={client.phone} /> : null}
            {client.goal_weight_kg != null ? (
              <InfoRow label="Peso objetivo" value={`${client.goal_weight_kg} kg`} />
            ) : null}
            {client.subscription_start_date ? (
              <InfoRow label="Alumno desde" value={formatDate(client.subscription_start_date)} last />
            ) : null}
          </Section>
        ) : null}

        {lastCheckIn ? (
          <MotiView
            from={{ opacity: 0, translateY: 12 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 350, delay: 80 }}
            style={[
              styles.statCard,
              { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl },
            ]}
          >
            <View style={styles.statTitleRow}>
              <Activity size={15} color={theme.primary} />
              <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
                Ultimo check-in
              </Text>
            </View>
            <View style={styles.statMeta}>
              <Calendar size={14} color={theme.mutedForeground} />
              <Text style={[styles.statDate, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                {formatDate(lastCheckIn.date)}
              </Text>
            </View>
            <View style={styles.statRow}>
              {lastCheckIn.weight != null ? (
                <Text style={[styles.statValue, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                  {lastCheckIn.weight} kg
                </Text>
              ) : null}
              {lastCheckIn.energy_level != null ? (
                <Text style={[styles.statValue, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  Energia {lastCheckIn.energy_level}/10
                </Text>
              ) : null}
            </View>
          </MotiView>
        ) : null}

        {activeProgram ? (
          <MotiView
            from={{ opacity: 0, translateY: 12 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 350, delay: 120 }}
            style={[
              styles.statCard,
              { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl },
            ]}
          >
            <View style={styles.statTitleRow}>
              <Dumbbell size={15} color={theme.primary} />
              <Text style={[styles.statTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
                Programa activo
              </Text>
            </View>
            <Text style={[styles.statDate, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              {activeProgram.name}
            </Text>
            <Text style={[styles.statValue, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {activeProgram.planCount} plan{activeProgram.planCount !== 1 ? 'es' : ''}
            </Text>
          </MotiView>
        ) : null}

        <Button label="Enviar recordatorio" variant="outline" leftIcon={Bell} onPress={sendReminder} full />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 40, gap: 12 },
  heroCard: { padding: 24, borderWidth: 1, alignItems: 'center', gap: 8 },
  heroAvatar: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroName: { fontSize: 19, letterSpacing: -0.3, marginTop: 4 },
  heroEmail: { fontSize: 13 },
  statCard: { padding: 18, borderWidth: 1, gap: 6 },
  statTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  statMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statDate: { fontSize: 16, letterSpacing: -0.2 },
  statRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  statValue: { fontSize: 14 },
})
