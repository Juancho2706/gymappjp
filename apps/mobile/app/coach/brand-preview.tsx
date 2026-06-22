import { useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  Apple,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Flame,
  Home,
  Moon,
  Sun,
  TrendingUp,
  Zap,
} from 'lucide-react-native'

// color-mix no existe en RN: helper local hex + alpha (val "15%" -> 0x26).
function withAlpha(hex: string, pct: number): string {
  const a = Math.round((pct / 100) * 255).toString(16).padStart(2, '0')
  return `${hex}${a}`
}

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const WORKOUT_DAYS = [0, 2, 4]
const TODAY_IDX = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1
const WORDMARK_COLORS = ['#8B5CF6', '#06B6D4', '#10B981']

// M-F6: preview full-screen de la app del alumno con la marca del coach (mockup fiel,
// no datos en vivo). Recibe color/nombre/logo/loaderText por params para reflejar
// los cambios actuales del formulario de Mi Marca. Light/dark togglable.

const LIGHT = { bg: '#F4F5F7', card: '#FFFFFF', fg: '#0F172A', muted: '#64748B', border: '#E2E8F0' }
const DARK = { bg: '#07080C', card: '#13151A', fg: '#F8FAFC', muted: '#94A3B8', border: '#23262E' }

export default function BrandPreviewScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ color?: string; name?: string; logo?: string; loaderText?: string }>()
  const [dark, setDark] = useState(true)
  const pal = dark ? DARK : LIGHT
  const accent = (params.color && /^#[0-9a-fA-F]{6}$/.test(params.color)) ? params.color : '#007AFF'
  const brand = params.name || 'Tu marca'
  const logo = params.logo || ''
  const loaderText = (params.loaderText || 'EVA').toUpperCase()

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: pal.bg }]}>
      {/* Barra del coach (no es parte del mock) */}
      <View style={[styles.coachBar, { borderBottomColor: pal.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <ChevronLeft size={20} color={accent} />
          <Text style={[styles.backTxt, { color: accent, fontFamily: 'Montserrat_700Bold' }]}>Volver</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.coachTitle, { color: pal.fg, fontFamily: 'Inter_700Bold' }]}>Vista Previa</Text>
          <Text style={[styles.coachSub, { color: pal.muted, fontFamily: 'Inter_600SemiBold' }]}>así ve tu alumno la app</Text>
        </View>
        <TouchableOpacity onPress={() => setDark((v) => !v)} hitSlop={10} style={[styles.modeBtn, { borderColor: pal.border }]}>
          {dark ? <Sun size={16} color={pal.fg} /> : <Moon size={16} color={pal.fg} />}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header del alumno (espejo web: marca + saludo + racha + check-in) */}
        <View style={[styles.header, { backgroundColor: pal.card, borderColor: pal.border }]}>
          <View style={styles.headerRow}>
            <View style={styles.brandRow}>
              <View style={[styles.logoBox, { backgroundColor: logo ? 'transparent' : accent }]}>
                {logo ? <Image source={{ uri: logo }} style={styles.logoImg} contentFit="cover" /> : <Text style={styles.logoInitial}>{brand.charAt(0).toUpperCase()}</Text>}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.brandName, { color: pal.muted }]}>{brand.toUpperCase()}</Text>
                <Text style={[styles.brandHi, { color: pal.fg }]}>Hola, Alumno 👋</Text>
              </View>
            </View>
            <View style={styles.headerBadges}>
              <View style={styles.streakBadge}>
                <Flame size={11} color="#EA580C" />
                <Text style={styles.streakTxt}>12</Text>
              </View>
              <View style={[styles.checkinBadge, { borderColor: accent, backgroundColor: withAlpha(accent, 8) }]}>
                <Text style={[styles.checkinTxt, { color: accent }]}>Check-in</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Calendario semanal */}
        <View style={[styles.card, { backgroundColor: pal.card, borderColor: pal.border }]}>
          <View style={styles.weekRow}>
            {DAYS.map((d, i) => {
              const isToday = i === TODAY_IDX
              const hasWorkout = WORKOUT_DAYS.includes(i)
              const date = new Date(new Date().setDate(new Date().getDate() - TODAY_IDX + i)).getDate()
              return (
                <View key={i} style={styles.dayCol}>
                  <Text style={[styles.dayLetter, { color: isToday ? pal.fg : pal.muted }]}>{d}</Text>
                  <View style={[
                    styles.dayCircle,
                    isToday ? { backgroundColor: accent }
                      : hasWorkout ? { backgroundColor: withAlpha(accent, 10), borderWidth: 1, borderColor: withAlpha(accent, 30) }
                        : null,
                  ]}>
                    <Text style={[styles.dayNum, { color: isToday ? '#fff' : hasWorkout ? accent : pal.muted }]}>{date}</Text>
                  </View>
                  <View style={[styles.dayDot, { backgroundColor: hasWorkout && !isToday ? accent : 'transparent' }]} />
                </View>
              )
            })}
          </View>
        </View>

        {/* Entreno + Nutrición */}
        <View style={styles.row}>
          <View style={[styles.card, styles.half, { backgroundColor: pal.card, borderColor: pal.border }]}>
            <View style={styles.cardTopRow}>
              <View style={[styles.iconTile, { backgroundColor: withAlpha(accent, 15), borderColor: withAlpha(accent, 30) }]}>
                <Dumbbell size={16} color={accent} />
              </View>
              <ChevronRight size={16} color={pal.muted} />
            </View>
            <Text style={[styles.cardLabel, { color: pal.muted }]}>Entrenamiento de hoy</Text>
            <Text style={[styles.cardName, { color: pal.fg, fontFamily: 'Montserrat_700Bold' }]}>Tren Superior A</Text>
            <View style={[styles.pill, { backgroundColor: withAlpha(accent, 15) }]}>
              <Text style={[styles.pillTxt, { color: accent }]}>Empezar ahora →</Text>
            </View>
          </View>
          <View style={[styles.card, styles.half, { backgroundColor: pal.card, borderColor: pal.border }]}>
            <View style={styles.cardTopRow}>
              <View style={[styles.iconTile, { backgroundColor: '#10B98119', borderColor: '#10B9814D' }]}>
                <Apple size={16} color="#10B981" />
              </View>
              <ChevronRight size={16} color={pal.muted} />
            </View>
            <Text style={[styles.cardLabel, { color: pal.muted }]}>Plan Nutricional</Text>
            <Text style={[styles.cardName, { color: pal.fg, fontFamily: 'Montserrat_700Bold' }]}>Plan de Volumen</Text>
            <View style={[styles.pill, { backgroundColor: '#10B98119' }]}>
              <Text style={[styles.pillTxt, { color: '#10B981' }]}>Ver comidas →</Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { icon: Calendar, label: 'Este mes', value: '12', sub: 'entrenamientos' },
            { icon: Flame, label: 'Racha', value: '5', sub: 'días seguidos' },
            { icon: TrendingUp, label: 'Progreso', value: '82%', sub: 'cumplimiento' },
          ].map(({ icon: Icon, label, value, sub }) => (
            <View key={label} style={[styles.statCard, { backgroundColor: pal.card, borderColor: pal.border }]}>
              <Icon size={16} color={accent} />
              <Text style={[styles.statLabel, { color: pal.muted }]}>{label}</Text>
              <Text style={[styles.statValue, { color: pal.fg, fontFamily: 'Montserrat_800ExtraBold' }]}>{value}</Text>
              <Text style={[styles.statSub, { color: pal.muted }]}>{sub}</Text>
            </View>
          ))}
        </View>

        {/* Programa activo */}
        <View style={[styles.card, { backgroundColor: pal.card, borderColor: pal.border }]}>
          <View style={styles.cardHead}>
            <Zap size={16} color={accent} />
            <Text style={[styles.cardTitle, { color: pal.fg, fontFamily: 'Montserrat_700Bold' }]}>Programa Activo</Text>
          </View>
          <Text style={[styles.cardName, { color: pal.fg, fontFamily: 'Montserrat_700Bold', marginTop: 2 }]}>Hipertrofia Full Body 8 Semanas</Text>
          <View style={[styles.progressTrack, { backgroundColor: dark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
            <View style={[styles.progressFill, { width: '62%', backgroundColor: accent }]} />
          </View>
          <Text style={[styles.cardSub, { color: pal.muted }]}>Semana 5 de 8 · 22 días restantes</Text>
        </View>

        {/* Loader preview (espejo web: "Así se ve al cargar la app") */}
        <View style={[styles.loaderCard, { backgroundColor: pal.card, borderColor: pal.border }]}>
          <Text style={[styles.loaderLabel, { color: pal.muted, fontFamily: 'Inter_600SemiBold' }]}>ASÍ SE VE AL CARGAR LA APP</Text>
          <View style={styles.wordmarkRow}>
            {(loaderText || 'EVA').split('').map((ch, i) => (
              <Text key={i} style={[styles.wordmarkCh, { color: WORDMARK_COLORS[i % WORDMARK_COLORS.length] }]}>{ch}</Text>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Tab bar del alumno (mock) — espejo web: Inicio/Nutrición/Ejercicios/Check-in */}
      <View style={[styles.tabBar, { backgroundColor: pal.card, borderTopColor: pal.border }]}>
        {[{ i: Home, l: 'Inicio', on: true }, { i: Apple, l: 'Nutrición' }, { i: Dumbbell, l: 'Ejercicios' }, { i: CheckCircle, l: 'Check-in' }].map((t, idx) => {
          const Icon = t.i
          return (
            <View key={idx} style={styles.tabItem}>
              {t.on ? <View style={[styles.tabActiveBar, { backgroundColor: accent }]} /> : <View style={styles.tabActiveBar} />}
              <Icon size={20} color={t.on ? accent : pal.muted} />
              <Text style={[styles.tabLbl, { color: t.on ? accent : pal.muted, fontFamily: 'Inter_600SemiBold' }]}>{t.l}</Text>
            </View>
          )
        })}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  coachBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backTxt: { fontSize: 14 },
  coachTitle: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  coachSub: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 },
  modeBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 14, gap: 12, paddingBottom: 40 },

  header: { borderWidth: 1, borderRadius: 16, padding: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  logoBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg: { width: 44, height: 44 },
  logoInitial: { fontSize: 20, color: '#fff', fontFamily: 'Montserrat_800ExtraBold' },
  brandName: { fontSize: 9, fontFamily: 'Montserrat_700Bold', letterSpacing: 1 },
  brandHi: { fontSize: 16, fontFamily: 'Montserrat_800ExtraBold', letterSpacing: -0.3, marginTop: 1 },
  headerBadges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFEDD5', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  streakTxt: { fontSize: 10, fontFamily: 'Montserrat_700Bold', color: '#EA580C' },
  checkinBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  checkinTxt: { fontSize: 9, fontFamily: 'Montserrat_700Bold' },

  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 4 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  cardSub: { fontSize: 11.5, marginTop: 2 },

  weekRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayCol: { alignItems: 'center', gap: 4 },
  dayLetter: { fontSize: 9, fontFamily: 'Montserrat_700Bold' },
  dayCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 11, fontFamily: 'Montserrat_700Bold' },
  dayDot: { width: 4, height: 4, borderRadius: 2 },

  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  iconTile: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: 10, marginTop: 2 },
  cardName: { fontSize: 13 },
  pill: { alignSelf: 'flex-start', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5, marginTop: 8 },
  pillTxt: { fontSize: 10, fontFamily: 'Montserrat_700Bold' },

  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 12, alignItems: 'center', gap: 2 },
  statLabel: { fontSize: 9, marginTop: 4 },
  statValue: { fontSize: 15 },
  statSub: { fontSize: 9 },

  progressTrack: { height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 8 },
  progressFill: { height: '100%', borderRadius: 999 },

  loaderCard: { borderWidth: 1, borderRadius: 16, padding: 18, alignItems: 'center', gap: 12 },
  loaderLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },
  wordmarkRow: { flexDirection: 'row' },
  wordmarkCh: { fontSize: 34, fontFamily: 'Montserrat_800ExtraBold', letterSpacing: -1 },

  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, paddingBottom: 8 },
  tabItem: { flex: 1, alignItems: 'center', gap: 3 },
  tabActiveBar: { width: 24, height: 2, borderRadius: 1, marginBottom: 2, backgroundColor: 'transparent' },
  tabLbl: { fontSize: 10 },
})
