import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowUpRight, ChevronRight, Dumbbell, Shield, Ticket, Users } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../context/ThemeContext'
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

/** Oscurece un hex mezclandolo con negro (para el gradiente del card sport). */
function mixBlack(hex: string, amount: number): string {
  const h = hex.replace('#', '')
  const ch = (i: number) => Math.round((parseInt(h.slice(i, i + 2), 16) || 0) * (1 - amount))
  const to2 = (n: number) => n.toString(16).padStart(2, '0')
  return `#${to2(ch(0))}${to2(ch(2))}${to2(ch(4))}`
}

export default function RoleSelector() {
  const router = useRouter()
  const { theme } = useTheme()
  // `?pick=1` = el alumno tocó "Elegir otro rol" en el login brandeado → forzar
  // el selector aunque haya un coach cacheado (si no, el flujo inteligente lo
  // devolvería al login en loop).
  const { pick } = useLocalSearchParams<{ pick?: string }>()
  // Flujo de entrada inteligente (feedback CEO). Orden de decisión:
  //   1. sesión activa            → dashboard (coach/alumno)
  //   2. pidió elegir otro rol    → selector
  //   3. coach cacheado           → login brandeado del alumno DIRECTO
  //   4. primer arranque          → walkthrough → selector
  //   5. resto                    → selector
  // Los deep links /c y /invite NO montan esta ruta (ver app/+native-intent.ts).
  const [phase, setPhase] = useState<Phase>('checking')
  const routed = useRef(false)

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          const coach = await getCoachProfile()
          if (routed.current) return
          routed.current = true
          router.replace(coach ? '/coach/home' : '/alumno/home')
          return
        }
        if (pick === '1') {
          setPhase('selector')
          return
        }
        const branding = await loadStoredBranding()
        if (branding?.coachId) {
          if (routed.current) return
          routed.current = true
          // El branding ya vive en ThemeContext (loadStoredBranding en el provider),
          // así que el login resuelve la marca del coach sin pasar por el código.
          router.replace('/(auth)/login?role=alumno&switch=1')
          return
        }
        const seen = await hasSeenWalkthrough()
        setPhase(seen ? 'selector' : 'walkthrough')
      } catch {
        setPhase('selector')
      }
    })()
  }, [router, pick])

  if (phase === 'checking') {
    return (
      <View className="bg-surface-app" style={styles.root}>
        <AppBackground />
        <SafeAreaView style={{ flex: 1 }}><EvaLoaderScreen subtitle="Cargando…" /></SafeAreaView>
      </View>
    )
  }

  if (phase === 'walkthrough') {
    return <Walkthrough onDone={() => setPhase('selector')} />
  }

  return (
    <View className="bg-surface-app" style={styles.root} testID="role-selector">
      <AppBackground />
      <AmbientBrandGlow />
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}>
          {/* Logo EVA pequeño — wordmark de marca (display face, token de acento). */}
          <MotiView
            from={{ opacity: 0, translateY: 14 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 460 }}
            style={styles.header}
          >
            <Text className="text-primary" style={styles.mark}>EVA</Text>
            <Text className="text-strong" style={[TYPE.h1, styles.title]}>¿Cómo quieres entrar?</Text>
            <Text className="text-muted" style={[TYPE.body, styles.subtitle]}>
              Elige tu rol para empezar en EVA.
            </Text>
          </MotiView>

          <View style={styles.cards}>
            {/* Alumno — protagonista, gradiente sport (blanco sobre marca). */}
            <MotiView
              from={{ opacity: 0, translateY: 22 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 480, delay: 200 }}
            >
              <TouchableOpacity
                testID="role-alumno"
                accessibilityRole="button"
                accessibilityLabel="Soy alumno"
                activeOpacity={0.9}
                onPress={() => router.push('/alumno/codigo')}
                style={[styles.hero, { borderRadius: theme.radius['3xl'] }, theme.shadowGlowBlue]}
              >
                <LinearGradient
                  colors={[theme.primary, mixBlack(theme.primary, 0.34)]}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: theme.radius['3xl'] }]}
                  pointerEvents="none"
                />
                <LinearGradient
                  colors={['rgba(255,255,255,0.18)', 'transparent']}
                  start={{ x: 0.15, y: 0 }}
                  end={{ x: 0.7, y: 0.55 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: theme.radius['3xl'] }]}
                  pointerEvents="none"
                />

                <View style={styles.heroTopRow}>
                  <View style={[styles.glassTile, { borderRadius: theme.radius.xl }]}>
                    <Dumbbell size={24} color={theme.primaryForeground} strokeWidth={2} />
                  </View>
                  <View style={styles.arrowCircle}>
                    <ArrowUpRight size={20} color={theme.primaryForeground} strokeWidth={2.25} />
                  </View>
                </View>

                <View style={styles.heroText}>
                  <Text style={[TYPE.eyebrow, { color: 'rgba(255,255,255,0.82)' }]}>Para entrenar</Text>
                  <Text style={[TYPE.h3, { color: theme.primaryForeground, marginTop: 4 }]}>Soy alumno</Text>
                  <Text style={[TYPE.body, styles.heroDesc]}>
                    Entrena con tu coach. Tu plan, tu progreso y tus check-ins en un solo lugar.
                  </Text>
                </View>

                <View style={styles.chip}>
                  <Ticket size={14} color={theme.primaryForeground} strokeWidth={2} />
                  <Text style={[TYPE.caption, { color: theme.primaryForeground }]}>Con el código de tu coach</Text>
                </View>
              </TouchableOpacity>
            </MotiView>

            {/* Coach — card secundaria, superficie limpia. */}
            <MotiView
              from={{ opacity: 0, translateY: 22 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 480, delay: 320 }}
            >
              <TouchableOpacity
                testID="role-coach"
                accessibilityRole="button"
                accessibilityLabel="Soy coach"
                activeOpacity={0.9}
                onPress={() => router.push('/(auth)/login?role=coach')}
                className="bg-surface-card border border-subtle"
                style={[styles.coach, { borderRadius: theme.radius['2xl'] }]}
              >
                <View className="bg-sport-100" style={[styles.coachTile, { borderRadius: theme.radius.xl }]}>
                  <Users size={22} color={theme.primary} strokeWidth={2} />
                </View>
                <View style={styles.coachText}>
                  <Text className="text-strong" style={TYPE.title}>Soy coach</Text>
                  <Text className="text-muted" style={[TYPE.caption, { marginTop: 2 }]}>
                    Gestiona tu marca, tus alumnos y tu negocio.
                  </Text>
                </View>
                <ChevronRight size={22} color={theme.mutedForeground} strokeWidth={2} />
              </TouchableOpacity>
            </MotiView>
          </View>
        </View>

        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: 400, delay: 520 }}
          style={styles.footer}
        >
          <Shield size={13} color={theme.mutedForeground} strokeWidth={2} />
          <Text className="text-subtle" style={TYPE.caption}>Acceso seguro · una cuenta por coach</Text>
        </MotiView>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 32 },
  top: { gap: 24 },
  header: { alignItems: 'center', paddingTop: 24 },
  // Wordmark EVA — Archivo Black, tracking cerrado. Color vía text-primary token.
  mark: { fontFamily: FONT.displayBlack, fontSize: 30, lineHeight: 32, letterSpacing: -2, marginBottom: 20 },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: 8 },
  cards: { gap: 14 },
  // Alumno hero card
  hero: { padding: 22, overflow: 'hidden', minHeight: 200, justifyContent: 'space-between' },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  glassTile: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  arrowCircle: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  heroText: { marginTop: 18 },
  heroDesc: { color: 'rgba(255,255,255,0.82)', marginTop: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    marginTop: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  // Coach card
  coach: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 },
  coachTile: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  coachText: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingTop: 12 },
})
