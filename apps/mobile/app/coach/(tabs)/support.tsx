import { useState } from 'react'
import { Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Constants from 'expo-constants'
import { MotiView } from 'moti'
import { ChevronDown, ExternalLink, Mail } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, ScreenHeader, Section } from '../../../components'
import { AppBackground } from '../../../components/AppBackground'

const SUPPORT_EMAIL = 'soporte@eva-app.cl'
const HELP_URL = 'https://eva-app.cl/ayuda'

// SO-F1/F3/F4: prefill el mailto con contexto de triage (versión app + plataforma).
function buildSupportMailto(): string {
  const version = Constants.expoConfig?.version ?? '—'
  const subject = 'Soporte EVA (coach)'
  const body = [
    'Hola equipo EVA,',
    '',
    'Mi consulta / problema:',
    '',
    '',
    '---',
    `App: EVA Coach v${version} · ${Platform.OS} ${String(Platform.Version)}`,
  ].join('\n')
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

const FAQ: { q: string; a: string }[] = [
  { q: '¿Cómo agrego un alumno?', a: 'Entrá a "Alumnos" y tocá el botón +. Completá nombre y datos; podés compartirle tu enlace o código de invitación desde "Mi Marca".' },
  { q: '¿Cómo creo un programa de entrenamiento?', a: 'En "Programas" elegí al alumno, armá los días y agregá ejercicios desde el buscador. Podés definir series, reps, peso, tempo, RIR, superseries y progresiones.' },
  { q: '¿Cómo creo ejercicios propios?', a: 'En "Ejercicios" tocá +, completá nombre y grupo muscular, y opcionalmente video, GIF, equipo e instrucciones. Aparecerán en el buscador del builder.' },
  { q: '¿Cómo personalizo mi marca?', a: 'En "Mi Marca" cambiás tu logo, color de marca y el loader. Tus alumnos verán la app con tu identidad.' },
  { q: '¿Cómo cobro a mis alumnos?', a: 'Registrás los pagos manualmente en el detalle de cada alumno. Tu suscripción a EVA se gestiona y paga desde la web.' },
  { q: '¿Mis datos están seguros?', a: 'Sí. Usamos cifrado y aislamiento por fila (RLS). Cumplimos la Ley 21.719 de protección de datos de Chile.' },
]

export default function SupportScreen() {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader title="Soporte" subtitle="Ayuda y contacto" />

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        {/* Contact */}
        <Button label="Escribinos por email" leftIcon={Mail} onPress={() => Linking.openURL(buildSupportMailto()).catch(() => {})} full />
        <Button label="Centro de ayuda" variant="outline" leftIcon={ExternalLink} onPress={() => Linking.openURL(HELP_URL).catch(() => {})} full />

        <Section title="Preguntas frecuentes">
          {FAQ.map((item, i) => (
            <FaqItem key={i} item={item} theme={theme} last={i === FAQ.length - 1} />
          ))}
        </Section>

        <Text style={[styles.foot, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          ¿Necesitás más ayuda? Escribinos a {SUPPORT_EMAIL} y te respondemos a la brevedad.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

function FaqItem({ item, theme, last }: { item: { q: string; a: string }; theme: any; last: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <View style={[styles.faqItem, !last && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
      <TouchableOpacity activeOpacity={0.75} onPress={() => setOpen((v) => !v)} style={styles.faqHeader}>
        <Text style={[styles.faqQ, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{item.q}</Text>
        <MotiView animate={{ rotate: open ? '180deg' : '0deg' }} transition={{ type: 'timing', duration: 200 }}>
          <ChevronDown size={18} color={theme.mutedForeground} />
        </MotiView>
      </TouchableOpacity>
      {open ? (
        <MotiView from={{ opacity: 0, translateY: -4 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 220 }}>
          <Text style={[styles.faqA, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{item.a}</Text>
        </MotiView>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  faqItem: { paddingVertical: 4 },
  faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  faqQ: { fontSize: 14, flex: 1, lineHeight: 19 },
  faqA: { fontSize: 13, lineHeight: 19, paddingBottom: 12 },
  foot: { fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8, marginTop: 4 },
})
