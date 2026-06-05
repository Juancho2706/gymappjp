import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Activity, ChevronRight, Dumbbell } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../context/ThemeContext'
import { AppBackground } from '../components/AppBackground'
import { EvaLoaderScreen } from '../components/EvaLoader'
import { supabase } from '../lib/supabase'
import { getCoachProfile } from '../lib/coach'

const LETTERS = [
  { c: 'E', color: '#8B5CF6' },
  { c: 'V', color: '#06B6D4' },
  { c: 'A', color: '#10B981' },
]

export default function RoleSelector() {
  const router = useRouter()
  const { theme } = useTheme()
  // Auto-login: si hay sesión persistida, ir directo al dashboard (coach o alumno) sin pasar por el selector.
  const [checking, setChecking] = useState(true)
  const routed = useRef(false)

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!data.session) { setChecking(false); return }
        const coach = await getCoachProfile()
        if (routed.current) return
        routed.current = true
        router.replace(coach ? '/coach/home' : '/alumno/home')
      } catch {
        setChecking(false)
      }
    })()
  }, [router])

  if (checking) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <SafeAreaView style={{ flex: 1 }}><EvaLoaderScreen subtitle="Cargando…" /></SafeAreaView>
      </View>
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <SafeAreaView style={styles.safe}>
        {/* Brand */}
        <MotiView
          from={{ opacity: 0, translateY: 18 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 500 }}
          style={styles.header}
        >
          <View style={styles.wordmark}>
            {LETTERS.map((l, i) => (
              <MotiView key={l.c} from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'spring', damping: 13, delay: 100 + i * 90 }}>
                <Text style={[styles.letter, { color: l.color }]}>{l.c}</Text>
              </MotiView>
            ))}
          </View>
          <Text style={[styles.tagline, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            ENTRENAMIENTO PERSONALIZADO
          </Text>
        </MotiView>

        {/* Role cards */}
        <View style={styles.cards}>
          <RoleCard
            delay={280}
            icon={Dumbbell}
            eyebrow="PARA PROFESIONALES"
            title="Soy coach"
            desc="Gestioná alumnos, programas y nutrición."
            primary
            theme={theme}
            onPress={() => router.push('/(auth)/login?role=coach')}
          />
          <RoleCard
            delay={420}
            icon={Activity}
            eyebrow="PARA ENTRENAR"
            title="Soy alumno"
            desc="Accedé a tu plan con el código de tu coach."
            theme={theme}
            onPress={() => router.push('/alumno/codigo')}
          />
        </View>

        <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 400, delay: 650 }}>
          <Text style={[styles.footer, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>eva-app.cl</Text>
        </MotiView>
      </SafeAreaView>
    </View>
  )
}

function RoleCard({ icon: Icon, eyebrow, title, desc, primary, delay, theme, onPress }: {
  icon: typeof Dumbbell; eyebrow: string; title: string; desc: string; primary?: boolean; delay: number; theme: any; onPress: () => void
}) {
  const fg = primary ? theme.primaryForeground : theme.foreground
  const sub = primary ? 'rgba(255,255,255,0.82)' : theme.mutedForeground
  const iconBg = primary ? 'rgba(255,255,255,0.18)' : theme.primary + '14'
  const iconBorder = primary ? 'rgba(255,255,255,0.25)' : theme.primary + '30'
  return (
    <MotiView from={{ opacity: 0, translateY: 22 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 480, delay }}>
      <TouchableOpacity
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
          <Text style={[styles.cardEyebrow, { color: sub, fontFamily: 'Inter_600SemiBold' }]}>{eyebrow}</Text>
          <Text style={[styles.cardTitle, { color: fg, fontFamily: 'Montserrat_800ExtraBold' }]}>{title}</Text>
          <Text style={[styles.cardDesc, { color: sub, fontFamily: theme.fontSans }]}>{desc}</Text>
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
  wordmark: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  letter: { fontSize: 64, lineHeight: 66, fontFamily: 'Montserrat_800ExtraBold', letterSpacing: -3 },
  tagline: { fontSize: 11, letterSpacing: 2.4, marginTop: 12 },
  cards: { gap: 14 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20 },
  cardIcon: { width: 54, height: 54, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: 2 },
  cardEyebrow: { fontSize: 10, letterSpacing: 1.2 },
  cardTitle: { fontSize: 21, letterSpacing: -0.4 },
  cardDesc: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  footer: { textAlign: 'center', fontSize: 12, letterSpacing: 0.5 },
})
