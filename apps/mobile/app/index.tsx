import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Activity, ChevronRight, Dumbbell } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../context/ThemeContext'
import { AppBackground } from '../components/AppBackground'
import { AmbientBrandGlow } from '../components/AmbientBrandGlow'
import { EvaLoaderScreen } from '../components/EvaLoader'
import { Walkthrough } from '../components/Walkthrough'
import { TYPE } from '../lib/typography'
import { hasSeenWalkthrough } from '../lib/walkthrough'
import { supabase } from '../lib/supabase'
import { getCoachProfile } from '../lib/coach'

type Phase = 'checking' | 'walkthrough' | 'selector'

export default function RoleSelector() {
  const router = useRouter()
  const { theme } = useTheme()
  // Auto-login: si hay sesión persistida, ir directo al dashboard (coach o alumno)
  // sin pasar por el selector. Si no hay sesión, decidir walkthrough (primer arranque)
  // vs. selector de rol. Los deep links /c y /invite NO montan esta ruta (van directo
  // al login brandeado — ver app/+native-intent.ts), así que el walkthrough se saltea
  // solo para ese flujo sin lógica extra acá.
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
        const seen = await hasSeenWalkthrough()
        setPhase(seen ? 'selector' : 'walkthrough')
      } catch {
        setPhase('selector')
      }
    })()
  }, [router])

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
    <View className="bg-surface-app" style={styles.root}>
      <AppBackground />
      <AmbientBrandGlow />
      <SafeAreaView style={styles.safe}>
        {/* Brand — single-color EVA wordmark (display face, brand accent token). */}
        <MotiView
          from={{ opacity: 0, translateY: 18 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 500 }}
          style={styles.header}
        >
          <Text className="text-primary" style={styles.wordmark}>EVA</Text>
          <Text className="text-muted" style={[TYPE.eyebrow, styles.tagline]}>
            Entrenamiento personalizado
          </Text>
        </MotiView>

        {/* Role cards */}
        <View style={styles.cards}>
          <RoleCard
            testID="role-coach"
            delay={280}
            icon={Dumbbell}
            eyebrow="Para profesionales"
            title="Soy coach"
            desc="Gestioná alumnos, programas y nutrición."
            primary
            theme={theme}
            onPress={() => router.push('/(auth)/login?role=coach')}
          />
          <RoleCard
            testID="role-alumno"
            delay={420}
            icon={Activity}
            eyebrow="Para entrenar"
            title="Soy alumno"
            desc="Accedé a tu plan con el código de tu coach."
            theme={theme}
            onPress={() => router.push('/alumno/codigo')}
          />
        </View>

        <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 400, delay: 650 }}>
          <Text className="text-subtle" style={[TYPE.caption, styles.footer]}>eva-app.cl</Text>
        </MotiView>
      </SafeAreaView>
    </View>
  )
}

function RoleCard({ icon: Icon, eyebrow, title, desc, primary, delay, theme, onPress, testID }: {
  icon: LucideIcon; eyebrow: string; title: string; desc: string; primary?: boolean; delay: number; theme: any; onPress: () => void; testID?: string
}) {
  const fg = primary ? theme.primaryForeground : theme.foreground
  const sub = primary ? 'rgba(255,255,255,0.82)' : theme.mutedForeground
  const iconBg = primary ? 'rgba(255,255,255,0.18)' : theme.primary + '14'
  const iconBorder = primary ? 'rgba(255,255,255,0.25)' : theme.primary + '30'
  return (
    <MotiView from={{ opacity: 0, translateY: 22 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 480, delay }}>
      <TouchableOpacity
        testID={testID}
        accessibilityRole="button"
        activeOpacity={0.88}
        onPress={onPress}
        style={[
          styles.card,
          { borderRadius: theme.radius['2xl'] },
          primary
            ? [{ backgroundColor: theme.primary }, theme.shadowGlowBlue]
            : { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
        ]}
      >
        <View style={[styles.cardIcon, { backgroundColor: iconBg, borderColor: iconBorder, borderRadius: theme.radius.xl }]}>
          <Icon size={26} color={primary ? theme.primaryForeground : theme.primary} strokeWidth={2} />
        </View>
        <View style={styles.cardText}>
          <Text style={[TYPE.eyebrow, { color: sub }]}>{eyebrow}</Text>
          <Text style={[TYPE.title, { color: fg }]}>{title}</Text>
          <Text style={[TYPE.caption, { color: sub, marginTop: 2 }]}>{desc}</Text>
        </View>
        <ChevronRight size={22} color={primary ? theme.primaryForeground : theme.mutedForeground} />
      </TouchableOpacity>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 40 },
  header: { alignItems: 'center', paddingTop: 36 },
  // Display wordmark — Archivo Black, tight tracking. Color via text-primary token.
  wordmark: { fontFamily: 'Archivo_900Black', fontSize: 64, lineHeight: 66, letterSpacing: -3 },
  tagline: { marginTop: 12 },
  cards: { gap: 14 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20 },
  cardIcon: { width: 54, height: 54, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: 2 },
  footer: { textAlign: 'center' },
})
