import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronRight, Dumbbell, ShieldCheck, Users } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useReducedMotion } from 'react-native-reanimated'
import { ForceLightTheme, useTheme } from '../context/ThemeContext'
import { AppBackground } from '../components/AppBackground'
import { AmbientBrandGlow } from '../components/AmbientBrandGlow'
import { EvaLoaderScreen } from '../components/EvaLoader'
import { Walkthrough } from '../components/Walkthrough'
import { FONT, TYPE } from '../lib/typography'
import { hasSeenWalkthrough } from '../lib/walkthrough'
import { loadStoredBranding } from '../lib/branding'
import { supabase } from '../lib/supabase'
import { getCoachProfile } from '../lib/coach'

type Phase = 'checking' | 'walkthrough' | 'selector'

/**
 * La familia pública de entrada usa identidad EVA, no el color del último coach cacheado.
 * El login white-label recupera la marca después de resolver el contexto correcto.
 */
export default function RoleSelectorRoute() {
  return (
    <ForceLightTheme branded={false}>
      <RoleSelector />
    </ForceLightTheme>
  )
}

function RoleSelector() {
  const router = useRouter()
  const { theme, setBranding } = useTheme()
  const reducedMotion = useReducedMotion()
  const { pick } = useLocalSearchParams<{ pick?: string }>()
  const [phase, setPhase] = useState<Phase>('checking')
  const routed = useRef(false)

  useEffect(() => {
    let active = true

    void (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!active || routed.current) return

        if (data.session) {
          const coach = await getCoachProfile()
          if (!active || routed.current) return
          routed.current = true
          router.replace(coach ? '/coach/home' : '/alumno/home')
          return
        }

        if (pick === '1') {
          setPhase('selector')
          return
        }

        const storedBranding = await loadStoredBranding()
        if (!active || routed.current) return
        if (storedBranding?.coachId) {
          // Mantener memoria y caché alineadas antes de montar el login.
          setBranding(storedBranding)
          routed.current = true
          router.replace('/(auth)/login?role=alumno&switch=1')
          return
        }

        const seen = await hasSeenWalkthrough()
        if (active) setPhase(seen ? 'selector' : 'walkthrough')
      } catch {
        if (active) setPhase('selector')
      }
    })()

    return () => {
      active = false
    }
  }, [pick, router, setBranding])

  if (phase === 'checking') {
    return (
      /* `EvaLoaderScreen` ya monta su propio `AppBackground`; duplicarlo apilaba dos
         Canvas Skia con blur 80 durante el cold start (auditoría a1 §2.3.1). */
      <View className="bg-surface-app" style={styles.root}>
        <SafeAreaView style={styles.root}>
          <EvaLoaderScreen subtitle="Preparando EVA…" />
        </SafeAreaView>
      </View>
    )
  }

  if (phase === 'walkthrough') {
    return <Walkthrough onDone={() => setPhase('selector')} />
  }

  const enter = reducedMotion
    ? { opacity: 1 }
    : { opacity: 0, translateY: 14 }
  const settled = { opacity: 1, translateY: 0 }

  return (
    <View className="bg-surface-app" style={styles.root} testID="role-selector">
      <AppBackground />
      <AmbientBrandGlow />
      <SafeAreaView style={styles.root}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.content}>
            <MotiView
              from={enter}
              animate={settled}
              transition={{ type: 'timing', duration: reducedMotion ? 0 : 360 }}
              style={styles.header}
            >
              <Text className="text-primary" style={styles.mark}>EVA</Text>
              <Text className="text-strong" style={[TYPE.h1, styles.title]}>
                Elige cómo entrar
              </Text>
              <Text className="text-muted" style={[TYPE.body, styles.subtitle]}>
                Tu plan o tu negocio, en el mismo lugar.
              </Text>
            </MotiView>

            {/* css-interop DESCARTA el prop `style` cuando es función (auditoría a1
                §2.1): las dos cards perdían layout, fondo y radio. La superficie va
                en una View interna con style ESTÁTICO y el press llega por
                children-as-function. */}
            <View style={styles.roles}>
              <MotiView
                from={enter}
                animate={settled}
                transition={{ type: 'timing', duration: reducedMotion ? 0 : 380, delay: reducedMotion ? 0 : 90 }}
              >
                <Pressable
                  testID="role-alumno"
                  accessibilityRole="button"
                  accessibilityLabel="Entrar como alumno"
                  accessibilityHint="Usa el código o enlace de tu coach"
                  onPress={() => router.push('/alumno/codigo')}
                >
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.roleCard,
                        styles.studentCard,
                        {
                          borderRadius: theme.radius['2xl'],
                          backgroundColor: theme.primary,
                          opacity: pressed ? 0.9 : 1,
                          transform: [{ scale: pressed ? 0.985 : 1 }],
                        },
                      ]}
                    >
                      <View style={[styles.roleIcon, styles.studentIcon]}>
                        <Dumbbell size={23} color={theme.primaryForeground} strokeWidth={2} />
                      </View>
                      <View style={styles.roleCopy}>
                        <Text style={[TYPE.eyebrow, { color: withAlpha(theme.primaryForeground, 0.76) }]}>
                          Para entrenar
                        </Text>
                        <Text style={[TYPE.title, { color: theme.primaryForeground }]}>Soy alumno</Text>
                        <Text style={[TYPE.caption, { color: withAlpha(theme.primaryForeground, 0.82) }]}>
                          Entra con tu coach
                        </Text>
                      </View>
                      <ChevronRight size={23} color={theme.primaryForeground} strokeWidth={2.25} />
                    </View>
                  )}
                </Pressable>
              </MotiView>

              <MotiView
                from={enter}
                animate={settled}
                transition={{ type: 'timing', duration: reducedMotion ? 0 : 380, delay: reducedMotion ? 0 : 150 }}
              >
                <Pressable
                  testID="role-coach"
                  accessibilityRole="button"
                  accessibilityLabel="Entrar como coach"
                  accessibilityHint="Abre el acceso para gestionar alumnos y programas"
                  onPress={() => router.push('/(auth)/login?role=coach')}
                >
                  {({ pressed }) => (
                    <View
                      className="bg-surface-card border border-default"
                      style={[
                        styles.roleCard,
                        {
                          borderRadius: theme.radius['2xl'],
                          opacity: pressed ? 0.75 : 1,
                          transform: [{ scale: pressed ? 0.985 : 1 }],
                        },
                      ]}
                    >
                      <View className="bg-sport-100" style={[styles.roleIcon, { borderRadius: theme.radius.xl }]}>
                        <Users size={23} color={theme.primary} strokeWidth={2} />
                      </View>
                      <View style={styles.roleCopy}>
                        <Text className="text-muted" style={TYPE.eyebrow}>Para gestionar</Text>
                        <Text className="text-strong" style={TYPE.title}>Soy coach</Text>
                        <Text className="text-muted" style={TYPE.caption}>Administra alumnos y programas</Text>
                      </View>
                      <ChevronRight size={23} color={theme.mutedForeground} strokeWidth={2.25} />
                    </View>
                  )}
                </Pressable>
              </MotiView>
            </View>
          </View>

          <View style={styles.footer}>
            <ShieldCheck size={15} color={theme.mutedForeground} strokeWidth={2} />
            <Text className="text-muted" style={TYPE.caption}>Acceso seguro para alumnos y coaches</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(clean)) return `rgba(255,255,255,${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 32,
    paddingBottom: 22,
  },
  content: { width: '100%', maxWidth: 460, alignSelf: 'center' },
  header: { alignItems: 'center', paddingHorizontal: 8, paddingTop: 12 },
  mark: {
    fontFamily: FONT.displayBlack,
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: -1.8,
    marginBottom: 18,
  },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: 9, maxWidth: 320 },
  roles: { gap: 12, marginTop: 34 },
  roleCard: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  studentCard: { overflow: 'hidden' },
  roleIcon: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentIcon: {
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  roleCopy: { flex: 1, gap: 2 },
  footer: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 32,
  },
})
