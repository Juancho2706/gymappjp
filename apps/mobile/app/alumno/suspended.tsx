import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MessageCircle, Pause } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../../context/ThemeContext'
import { Button } from '../../components'
import { signOutAndCleanup } from '../../lib/auth-actions'
import { supabase } from '../../lib/supabase'
import { selectWithFallback } from '../../lib/db-compat'

// DS warning-700 (status token, NO white-label). Flip por scheme igual que var(--warning-700) en web.
const WARNING_700 = { light: '#8F5A05', dark: '#FFD489' } as const

interface SuspendedState {
  loading: boolean
  isTeam: boolean
  brandName: string
  whatsapp: string | null
}

/**
 * E1-16: espejo mobile de la web `suspended/page.tsx` (team-aware).
 * Pool/team: la suspension la gestiona el DUEÑO del team → mostrar la marca del TEAM y NO el
 * WhatsApp personal del coach. Standalone: marca + WhatsApp del coach (si lo cargo).
 */
export default function SuspendedScreen() {
  const { theme, resolvedScheme } = useTheme()
  const router = useRouter()
  const [s, setS] = useState<SuspendedState>({ loading: true, isTeam: false, brandName: 'tu Coach', whatsapp: null })

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const next: SuspendedState = { loading: false, isTeam: false, brandName: 'tu Coach', whatsapp: null }
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { if (mounted) setS(next); return }

        // team_id define el contexto pool/team (fallback si la columna no existe en DB vieja).
        const { data: client } = await selectWithFallback<any>(
          () => supabase.from('clients').select('coach_id, team_id').eq('id', user.id).maybeSingle(),
          () => supabase.from('clients').select('coach_id').eq('id', user.id).maybeSingle()
        )

        if (client?.team_id) {
          next.isTeam = true
          const { data: team } = await supabase.from('teams').select('name').eq('id', client.team_id).maybeSingle()
          next.brandName = team?.name || 'tu equipo'
        } else if (client?.coach_id) {
          const { data: coach } = await selectWithFallback<any>(
            () => supabase.from('coaches').select('display_name, whatsapp').eq('id', client.coach_id).maybeSingle(),
            () => supabase.from('coaches').select('display_name').eq('id', client.coach_id).maybeSingle()
          )
          next.brandName = coach?.display_name || 'tu Coach'
          next.whatsapp = coach?.whatsapp ?? null
        }
      } catch {
        // fail-safe: valores por defecto (cuenta pausada nunca debe crashear).
      }
      if (mounted) setS(next)
    })()
    return () => { mounted = false }
  }, [])

  async function handleLogout() {
    await signOutAndCleanup()
    router.replace('/alumno/codigo')
  }

  function handleWhatsApp() {
    if (!s.whatsapp) return
    const num = s.whatsapp.replace(/\D/g, '')
    Linking.openURL(`https://wa.me/${num}`).catch(() => {})
  }

  const owner = s.isTeam ? 'Tu equipo' : 'Tu coach'
  const iconColor = WARNING_700[resolvedScheme]

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View className="bg-warning-100" style={styles.iconWrap}>
          <Pause size={40} color={iconColor} strokeWidth={1.75} />
        </View>
        <Text className="text-strong font-display-black" style={styles.title}>
          Acceso pausado
        </Text>
        {s.loading ? (
          <ActivityIndicator color={theme.mutedForeground} style={{ marginTop: 4 }} />
        ) : (
          <>
            <Text className="text-muted font-sans" style={styles.body}>
              {owner} pausó temporalmente tu acceso. Contacta a{' '}
              <Text className="text-strong font-sans-semibold">{s.brandName}</Text> para reactivar tu cuenta.
            </Text>
            <Text className="text-subtle font-sans" style={styles.subtle}>
              Todos tus progresos y datos están a salvo.
            </Text>
          </>
        )}
      </View>

      <View style={styles.footer}>
        {!s.loading && s.whatsapp && !s.isTeam ? (
          <Button
            testID="suspended-whatsapp"
            label="Contactar a mi Coach"
            variant="sport"
            leftIcon={MessageCircle}
            onPress={handleWhatsApp}
            full
            size="lg"
          />
        ) : null}
        <Button testID="suspended-logout" label="Cerrar sesión" variant="ghost" onPress={handleLogout} full />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  iconWrap: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { fontSize: 24, letterSpacing: -0.4, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 23, textAlign: 'center', maxWidth: 340 },
  subtle: { fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 340, marginTop: 2 },
  footer: { padding: 24, paddingBottom: 32, gap: 12 },
})
