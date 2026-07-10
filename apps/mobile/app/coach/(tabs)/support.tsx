import { useMemo } from 'react'
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Constants from 'expo-constants'
import { Mail } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, ScreenHeader } from '../../../components'
import { Accordion } from '../../../components/Accordion'
import { AppBackground } from '../../../components/AppBackground'
import { SUPPORT_FAQ, type FaqEntry } from '../../../lib/support-faq'

const SUPPORT_EMAIL = 'soporte@eva-app.cl'

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

export default function SupportScreen() {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()

  // Agrupar FAQ por categoría conservando el orden de aparición.
  const groups = useMemo(() => {
    const map = new Map<string, FaqEntry[]>()
    for (const entry of SUPPORT_FAQ) {
      const arr = map.get(entry.category) ?? []
      arr.push(entry)
      map.set(entry.category, arr)
    }
    return [...map.entries()]
  }, [])

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader title="Soporte" subtitle="Ayuda y contacto" />

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        {/* Contact */}
        <Button label="Escríbenos por email" leftIcon={Mail} onPress={() => Linking.openURL(buildSupportMailto()).catch(() => {})} full />

        <Text style={[styles.sectionTitle, { color: theme.mutedForeground, fontFamily: 'HankenGrotesk_800ExtraBold' }]}>PREGUNTAS FRECUENTES</Text>

        {groups.map(([category, entries]) => (
          <View key={category} style={styles.group}>
            <Text style={[styles.groupTitle, { color: theme.primary, fontFamily: 'HankenGrotesk_700Bold' }]}>{category.toUpperCase()}</Text>
            <View style={styles.groupItems}>
              {entries.map((item) => (
                <Accordion key={item.q} question={item.q} answer={item.a} />
              ))}
            </View>
          </View>
        ))}

        <Text style={[styles.foot, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          ¿Necesitas más ayuda? Escríbenos a {SUPPORT_EMAIL} y te respondemos a la brevedad.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  sectionTitle: { fontSize: 11, letterSpacing: 1, marginTop: 6 },
  group: { gap: 8 },
  groupTitle: { fontSize: 11, letterSpacing: 0.6, marginTop: 4 },
  groupItems: { gap: 8 },
  foot: { fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8, marginTop: 4 },
})
