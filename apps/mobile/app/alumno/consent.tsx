import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Check, ShieldCheck } from 'lucide-react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTheme } from '../../context/ThemeContext'
import { Button } from '../../components'
import { signOutAndCleanup } from '../../lib/auth-actions'
import { getPoolConsentStatus, grantPoolConsent } from '../../lib/pool-consent'

/**
 * Consentimiento de pool (Ley 21.719) — espejo RN de `/t/[team_slug]/consent` web
 * (`ConsentForm.tsx`): mismo copy, mismos propósitos, checkbox obligatorio y CTA única.
 * El layout de tabs del alumno redirige aquí cuando el alumno de pool aún no consintió
 * (paridad con el gate del proxy web); al aceptar vuelve al inicio.
 */
export default function ConsentScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const params = useLocalSearchParams<{ team?: string; name?: string }>()

  const [teamSlug, setTeamSlug] = useState<string>(typeof params.team === 'string' ? params.team : '')
  const [teamName, setTeamName] = useState<string>(typeof params.name === 'string' ? params.name : '')
  const [loading, setLoading] = useState(!teamSlug)
  const [accepted, setAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Entrada sin params (deep link / retorno en frío): resolver el team desde el endpoint.
  // Si el estado ya viene otorgado (carrera con otro dispositivo), pasar directo al inicio.
  useEffect(() => {
    if (teamSlug) return
    let mounted = true
    getPoolConsentStatus().then((status) => {
      if (!mounted) return
      if (!status || !status.pool) { router.replace('/alumno/(tabs)/home'); return }
      if (status.granted) { router.replace('/alumno/(tabs)/home'); return }
      setTeamSlug(status.teamSlug)
      setTeamName(status.teamName)
      setLoading(false)
    })
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamSlug])

  async function handleAccept() {
    if (!accepted || saving || !teamSlug) return
    setSaving(true)
    setError(null)
    try {
      await grantPoolConsent(teamSlug)
      router.replace('/alumno/(tabs)/home')
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo registrar el consentimiento. Intenta de nuevo.')
      setSaving(false)
    }
  }

  async function handleLogout() {
    await signOutAndCleanup()
    router.replace('/alumno/codigo')
  }

  const brand = teamName || 'tu equipo'

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.iconWrap, { backgroundColor: `${theme.primary}1F` }]}>
          <ShieldCheck size={40} color={theme.primary} strokeWidth={1.75} />
        </View>
        <Text className="text-strong font-display-black" style={styles.title}>
          Autorización de tu equipo
        </Text>

        {loading ? (
          <ActivityIndicator color={theme.mutedForeground} style={{ marginTop: 12 }} />
        ) : (
          <View className="border-subtle bg-surface-card" style={styles.card}>
            <Text className="text-muted font-sans" style={styles.body}>
              En <Text className="text-strong font-sans-semibold">{brand}</Text> trabaja un equipo de
              profesionales (entrenadores, nutrición, kinesiología y otros). Para entregarte una
              atención coordinada, necesitamos tu autorización para que el equipo pueda ver y
              registrar tus datos de salud y entrenamiento dentro de la plataforma.
            </Text>

            <View style={styles.bullets}>
              <Text className="text-muted font-sans" style={styles.bullet}>
                <Text style={{ color: theme.primary }}>• </Text>
                Acceso multidisciplinario de los profesionales activos del equipo.
              </Text>
              <Text className="text-muted font-sans" style={styles.bullet}>
                <Text style={{ color: theme.primary }}>• </Text>
                Tratamiento de tus datos de salud para tu seguimiento.
              </Text>
              <Text className="text-muted font-sans" style={styles.bullet}>
                <Text style={{ color: theme.primary }}>• </Text>
                Puedes revocar este consentimiento cuando quieras desde tu perfil.
              </Text>
            </View>

            <Pressable
              testID="consent-accept-toggle"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: accepted }}
              onPress={() => setAccepted((v) => !v)}
              style={[
                styles.checkboxRow,
                {
                  borderColor: accepted ? `${theme.primary}66` : theme.border,
                  backgroundColor: accepted ? `${theme.primary}12` : 'transparent',
                },
              ]}
            >
              <View
                style={[
                  styles.checkbox,
                  accepted
                    ? { backgroundColor: theme.primary, borderColor: theme.primary }
                    : { borderColor: theme.border },
                ]}
              >
                {accepted ? <Check size={13} color="#fff" strokeWidth={3.2} /> : null}
              </View>
              <Text className="text-strong font-sans" style={styles.checkboxLabel}>
                Autorizo el acceso multidisciplinario y el tratamiento de mis datos de salud
                (Ley 21.719).
              </Text>
            </Pressable>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Button
              testID="consent-accept-submit"
              label={saving ? 'Guardando…' : 'Aceptar y continuar'}
              variant="sport"
              onPress={handleAccept}
              disabled={!accepted || saving}
              loading={saving}
              full
              size="lg"
            />

            <View style={styles.shieldRow}>
              <ShieldCheck size={13} color={theme.mutedForeground} />
              <Text className="text-subtle font-sans" style={styles.shieldText}>
                Tus datos están protegidos y son confidenciales.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button testID="consent-logout" label="Cerrar sesión" variant="ghost" onPress={handleLogout} full />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32, gap: 12 },
  iconWrap: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 4 },
  title: { fontSize: 24, letterSpacing: -0.4, textAlign: 'center', marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 16 },
  body: { fontSize: 14.5, lineHeight: 22 },
  bullets: { gap: 8 },
  bullet: { fontSize: 13.5, lineHeight: 20 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxLabel: { flex: 1, fontSize: 13.5, lineHeight: 20 },
  errorBox: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(244,54,90,0.25)', backgroundColor: 'rgba(244,54,90,0.10)', paddingHorizontal: 14, paddingVertical: 10 },
  errorText: { color: '#E11D48', fontSize: 13, lineHeight: 18 },
  shieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  shieldText: { fontSize: 11.5 },
  footer: { paddingHorizontal: 24, paddingBottom: 24 },
})
