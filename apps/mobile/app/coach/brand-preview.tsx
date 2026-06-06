import { useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Activity, Apple, ChevronLeft, Dumbbell, Home, Moon, Sun, User } from 'lucide-react-native'
import { ComplianceRing } from '../../components'

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

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: pal.bg }]}>
      {/* Barra del coach (no es parte del mock) */}
      <View style={[styles.coachBar, { borderBottomColor: pal.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <ChevronLeft size={20} color={accent} />
          <Text style={[styles.backTxt, { color: accent, fontFamily: 'Montserrat_700Bold' }]}>Volver</Text>
        </TouchableOpacity>
        <Text style={[styles.coachTitle, { color: pal.fg, fontFamily: 'Inter_700Bold' }]}>Vista del alumno</Text>
        <TouchableOpacity onPress={() => setDark((v) => !v)} hitSlop={10} style={[styles.modeBtn, { borderColor: pal.border }]}>
          {dark ? <Sun size={16} color={pal.fg} /> : <Moon size={16} color={pal.fg} />}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header de marca (como lo ve el alumno) */}
        <View style={[styles.brandHeader, { backgroundColor: accent }]}>
          <View style={styles.brandRow}>
            <View style={styles.logoBox}>
              {logo ? <Image source={{ uri: logo }} style={styles.logoImg} contentFit="cover" /> : <Text style={styles.logoInitial}>{brand.charAt(0).toUpperCase()}</Text>}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.brandName}>{brand}</Text>
              <Text style={styles.brandHi}>Buenas tardes, Alumno</Text>
            </View>
          </View>
        </View>

        {/* Card entreno de hoy */}
        <View style={[styles.card, { backgroundColor: pal.card, borderColor: pal.border }]}>
          <View style={styles.cardHead}>
            <Dumbbell size={16} color={accent} />
            <Text style={[styles.cardTitle, { color: pal.fg, fontFamily: 'Montserrat_700Bold' }]}>Entreno de hoy</Text>
          </View>
          <Text style={[styles.cardBig, { color: pal.fg, fontFamily: 'Montserrat_800ExtraBold' }]}>Día 3 · Empuje</Text>
          <Text style={[styles.cardSub, { color: pal.muted }]}>5 ejercicios · ~45 min</Text>
          <View style={[styles.cta, { backgroundColor: accent }]}>
            <Text style={styles.ctaTxt}>Comenzar entreno</Text>
          </View>
        </View>

        {/* Nutrición + progreso */}
        <View style={styles.row}>
          <View style={[styles.card, styles.half, { backgroundColor: pal.card, borderColor: pal.border }]}>
            <View style={styles.cardHead}><Apple size={15} color={accent} /><Text style={[styles.cardTitle, { color: pal.fg, fontFamily: 'Montserrat_700Bold' }]}>Hoy</Text></View>
            <View style={{ alignItems: 'center', paddingVertical: 4 }}>
              <ComplianceRing value={0.72} label="comidas" color={accent} size={68} />
            </View>
          </View>
          <View style={[styles.card, styles.half, { backgroundColor: pal.card, borderColor: pal.border }]}>
            <View style={styles.cardHead}><Activity size={15} color={accent} /><Text style={[styles.cardTitle, { color: pal.fg, fontFamily: 'Montserrat_700Bold' }]}>Progreso</Text></View>
            <Text style={[styles.cardBig, { color: pal.fg, fontFamily: 'Montserrat_800ExtraBold' }]}>-2.4 kg</Text>
            <Text style={[styles.cardSub, { color: pal.muted }]}>últimas 4 sem</Text>
          </View>
        </View>

        {/* Check-in */}
        <View style={[styles.card, { backgroundColor: pal.card, borderColor: pal.border }]}>
          <Text style={[styles.cardTitle, { color: pal.fg, fontFamily: 'Montserrat_700Bold' }]}>Check-in semanal</Text>
          <Text style={[styles.cardSub, { color: pal.muted }]}>Subí tu peso y fotos para tu coach.</Text>
          <View style={[styles.ctaOutline, { borderColor: accent }]}><Text style={[styles.ctaOutlineTxt, { color: accent }]}>Hacer check-in</Text></View>
        </View>
      </ScrollView>

      {/* Tab bar del alumno (mock) */}
      <View style={[styles.tabBar, { backgroundColor: pal.card, borderTopColor: pal.border }]}>
        {[{ i: Home, l: 'Inicio', on: true }, { i: Dumbbell, l: 'Entreno' }, { i: Apple, l: 'Nutrición' }, { i: User, l: 'Perfil' }].map((t, idx) => {
          const Icon = t.i
          return (
            <View key={idx} style={styles.tabItem}>
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
  modeBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 14, gap: 12, paddingBottom: 40 },
  brandHeader: { borderRadius: 18, padding: 18 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoBox: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg: { width: 48, height: 48 },
  logoInitial: { fontSize: 22, color: '#fff', fontFamily: 'Montserrat_800ExtraBold' },
  brandName: { fontSize: 18, color: '#fff', fontFamily: 'Montserrat_800ExtraBold', letterSpacing: -0.3 },
  brandHi: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  cardBig: { fontSize: 18, letterSpacing: -0.3, marginTop: 2 },
  cardSub: { fontSize: 12.5 },
  cta: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  ctaTxt: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 },
  ctaOutline: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginTop: 6 },
  ctaOutlineTxt: { fontFamily: 'Inter_700Bold', fontSize: 13.5 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, paddingBottom: 8 },
  tabItem: { flex: 1, alignItems: 'center', gap: 3 },
  tabLbl: { fontSize: 10 },
})
