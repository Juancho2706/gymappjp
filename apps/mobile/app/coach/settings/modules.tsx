import { useEffect, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { CheckCircle2, ChevronLeft, Package, Sparkles } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { ScreenHeader, Button } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { getCoachOrgContext } from '../../../lib/org'
import { getCoachEnabledModules, type EnabledModules } from '../../../lib/entitlements'
import { MODULE_CATALOG, MODULE_CATALOG_KEYS } from '../../../lib/modules-catalog'

const SUBSCRIPTION_URL = 'https://eva-app.cl/coach/subscription'

/**
 * Settings > Módulos (mobile) — CATÁLOGO READ-ONLY, espejo de la web
 * (apps/web/.../settings/modules). Lista los 4 módulos de pago con badge
 * Activo/Disponible leyendo coaches.enabled_modules (RLS coach_id=auth.uid()).
 * La activación es compra-only (service-role): acá NO se edita, el CTA "Agregar"
 * abre el checkout en la web (pagos = web-only).
 */
export default function CoachModulesScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  // Guard org-managed (espejo web settings/modules: `if (orgManaged) redirect('/coach/dashboard')`).
  // Los módulos de un coach gestionado por org los gobierna la org, no aplica el catálogo propio.
  // Conservador: solo redirige con CERTEZA (org_id en el JWT); si la lectura falla, fail-OPEN.
  const [orgManaged, setOrgManaged] = useState(false)
  const [modules, setModules] = useState<EnabledModules>({})

  useEffect(() => {
    ;(async () => {
      try {
        const org = await getCoachOrgContext().catch(() => ({ isOrgManaged: false } as { isOrgManaged: boolean }))
        if (org.isOrgManaged) {
          setOrgManaged(true)
          router.replace('/coach/home')
          return
        }
        setModules(await getCoachEnabledModules())
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  // Loader también mientras redirige al coach org-managed (no parpadea el catálogo).
  if (loading || orgManaged) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando módulos…" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <View style={styles.backRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={20} color={theme.mutedForeground} />
          <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 14 }}>Volver</Text>
        </TouchableOpacity>
      </View>
      <ScreenHeader title="Módulos" subtitle="Conoce los módulos disponibles para tu cuenta" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {MODULE_CATALOG_KEYS.map((key) => {
          const entry = MODULE_CATALOG[key]
          const active = modules[key] === true

          return (
            <View
              key={key}
              style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}
            >
              <View style={styles.cardHead}>
                <View style={styles.cardTitleWrap}>
                  <Package size={16} color={theme.primary} />
                  <Text style={[styles.cardTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={2}>
                    {entry.label}
                  </Text>
                </View>
                {active ? (
                  <View style={[styles.badge, { backgroundColor: theme.success + '1A' }]}>
                    <CheckCircle2 size={13} color={theme.success} />
                    <Text style={[styles.badgeText, { color: theme.success, fontFamily: 'Inter_600SemiBold' }]}>Activo</Text>
                  </View>
                ) : (
                  <View style={[styles.badge, { backgroundColor: theme.secondary }]}>
                    <Sparkles size={13} color={theme.mutedForeground} />
                    <Text style={[styles.badgeText, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Disponible</Text>
                  </View>
                )}
              </View>

              <Text style={[styles.pitch, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{entry.pitch}</Text>

              <View style={styles.surfaces}>
                {entry.surfaces.map((surface) => (
                  <View key={surface} style={styles.surfaceRow}>
                    <View style={[styles.dot, { backgroundColor: theme.mutedForeground }]} />
                    <Text style={[styles.surfaceText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{surface}</Text>
                  </View>
                ))}
              </View>

              {!active && (
                <View style={styles.ctaRow}>
                  <Button
                    label="Agregar"
                    onPress={() => Linking.openURL(SUBSCRIPTION_URL).catch(() => {})}
                    full
                  />
                </View>
              )}
            </View>
          )
        })}

        <Text style={[styles.footNote, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Los módulos de pago se activan desde la web.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backRow: { paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, alignSelf: 'flex-start' },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 12 },
  card: { padding: 16, borderWidth: 1, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  cardTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  cardTitle: { fontSize: 15, flexShrink: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 11 },
  pitch: { fontSize: 13, lineHeight: 19 },
  surfaces: { gap: 5, marginTop: 2 },
  surfaceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 7 },
  surfaceText: { flex: 1, fontSize: 12, lineHeight: 17 },
  ctaRow: { marginTop: 4 },
  footNote: { fontSize: 11, textAlign: 'center', marginTop: 4, lineHeight: 16 },
})
