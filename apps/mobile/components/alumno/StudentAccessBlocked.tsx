import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MessageCircle, Pause } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '../../context/ThemeContext'
import { Avatar } from '../Avatar'
import { Button } from '../Button'
import { signOutAndCleanup } from '../../lib/auth-actions'
import { supabase } from '../../lib/supabase'
import { selectWithFallback } from '../../lib/db-compat'
import { STUDENT_ACCESS_COPY } from '../../lib/student-access-copy'

const COPY = STUDENT_ACCESS_COPY.blockScreen

interface BlockedData {
  loading: boolean
  isTeam: boolean
  brandName: string
  whatsapp: string | null
}

/**
 * StudentAccessBlocked (E1.4, executor-v3 decision 9) — pantalla de BLOQUEO TOTAL del alumno tras
 * los 7 dias de gracia. La monta el layout de tabs del alumno cuando `studentAccess.state==='blocked'`
 * EN LUGAR de las tabs: ni dashboard, ni plan, ni historial (reemplaza el hibrido banner+solo-lectura
 * anterior). Espejo RN del mockup "Bloqueo total" v3.3 y de la web `/suspended?reason=coach`.
 *
 * Es UI fail-open (RN habla PostgREST directo; la barrera real es RLS + el rebote
 * COACH_ACCOUNT_PAUSED en DB) — esta pantalla solo comunica, no autoriza.
 *
 * Nivel dashboard => tema claro/oscuro (NO dark-only como el ejecutor): colores por tokens DS
 * NativeWind (bg-surface-app / text-strong / text-muted / primary white-label) + safe areas.
 * Tono cuidado y calmo: "en pausa", nunca "bloqueada"; nunca culpa al alumno.
 *
 * Team-aware igual que `suspended.tsx`: en contexto pool/team la pausa la gestiona el dueño del
 * equipo → se muestra la marca del TEAM y NO el WhatsApp personal del coach; standalone → marca +
 * CTA WhatsApp del coach (si lo cargo).
 */
export function StudentAccessBlocked() {
  const { theme } = useTheme()
  const router = useRouter()
  const [s, setS] = useState<BlockedData>({ loading: true, isTeam: false, brandName: 'Tu coach', whatsapp: null })

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const next: BlockedData = { loading: false, isTeam: false, brandName: 'Tu coach', whatsapp: null }
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          if (mounted) setS(next)
          return
        }
        // team_id define el contexto pool/team (fallback si la columna no existe en DB vieja).
        const { data: client } = await selectWithFallback<any>(
          () => supabase.from('clients').select('coach_id, team_id').eq('id', user.id).maybeSingle(),
          () => supabase.from('clients').select('coach_id').eq('id', user.id).maybeSingle(),
        )
        if (client?.team_id) {
          next.isTeam = true
          const { data: team } = await supabase.from('teams').select('name').eq('id', client.team_id).maybeSingle()
          next.brandName = team?.name || 'Tu equipo'
        } else if (client?.coach_id) {
          const { data: coach } = await selectWithFallback<any>(
            () => supabase.from('coaches').select('display_name, whatsapp').eq('id', client.coach_id).maybeSingle(),
            () => supabase.from('coaches').select('display_name').eq('id', client.coach_id).maybeSingle(),
          )
          next.brandName = coach?.display_name || 'Tu coach'
          next.whatsapp = coach?.whatsapp ?? null
        }
      } catch {
        // fail-safe: valores por defecto (una cuenta en pausa nunca debe crashear la app).
      }
      if (mounted) setS(next)
    })()
    return () => {
      mounted = false
    }
  }, [])

  function handleContact() {
    if (!s.whatsapp) return
    const num = s.whatsapp.replace(/\D/g, '')
    Linking.openURL(`https://wa.me/${num}`).catch(() => {})
  }

  async function handleLogout() {
    await signOutAndCleanup()
    router.replace('/alumno/codigo')
  }

  const body = s.isTeam ? COPY.bodyTeam : COPY.body
  // Standalone con WhatsApp cargado: unico camino de contacto (en team lo gestiona el dueño).
  const showContact = !s.loading && !s.isTeam && !!s.whatsapp

  return (
    <SafeAreaView testID="student-access-blocked" className="flex-1 bg-surface-app" style={styles.root}>
      <View style={styles.content}>
        {/* Avatar del coach con ring de marca (mockup: inicial en aro brand). */}
        <Avatar name={s.brandName} ring="sport" size={84} />

        {/* Pausa calma: circulo brand-tint suave con dos barras (icono Pause), no un warning/alarma. */}
        <View className="bg-primary/[0.08] border border-primary/[0.20]" style={styles.pauseWrap}>
          <Pause size={30} color={theme.primary} strokeWidth={2} fill={theme.primary} />
        </View>

        <Text className="text-strong font-display-black" style={styles.title}>
          {COPY.title}
        </Text>

        {s.loading ? (
          <ActivityIndicator color={theme.mutedForeground} style={{ marginTop: 4 }} />
        ) : (
          <Text className="text-muted font-sans" style={styles.body}>
            {body}
          </Text>
        )}
      </View>

      <View style={styles.footer}>
        {showContact ? (
          <Button
            testID="student-access-blocked-contact"
            label={COPY.contactCta}
            variant="sport"
            leftIcon={MessageCircle}
            onPress={handleContact}
            full
            size="lg"
          />
        ) : null}
        <Pressable
          testID="student-access-blocked-logout"
          accessibilityRole="button"
          accessibilityLabel={COPY.logout}
          onPress={handleLogout}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.logout}
        >
          <Text className="text-subtle font-sans-semibold" style={styles.logoutLabel}>
            {COPY.logout}
          </Text>
        </Pressable>
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
    gap: 16,
  },
  pauseWrap: {
    width: 76,
    height: 76,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  title: { fontSize: 26, letterSpacing: -0.5, textAlign: 'center', marginTop: 4 },
  body: { fontSize: 15, lineHeight: 23, textAlign: 'center', maxWidth: 300 },
  footer: { padding: 24, paddingBottom: 32, gap: 14, alignItems: 'center' },
  logout: { paddingVertical: 6, paddingHorizontal: 12 },
  logoutLabel: { fontSize: 13, letterSpacing: 0.2 },
})
