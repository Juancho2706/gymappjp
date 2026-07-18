import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AlertTriangle, RotateCcw } from 'lucide-react-native'
import type { ErrorBoundaryProps } from 'expo-router'
import { FONT, textStyle } from '../lib/typography'

/**
 * Fallback de error a nivel app. Se renderiza si un throw escapa el árbol → en
 * vez de pantalla blanca, UI de marca + "Reintentar". Reporte a Sentry se cablea
 * en el batch de telemetria.
 *
 * INTENCIONAL: NO usa ThemeProvider (puede vivir fuera de su contexto) → NO usa
 * clases NativeWind (sin scheme fiable las CSS vars / `dark:` no resuelven acá).
 * Paleta oscura FIJA. El re-skin DS se aplica igual via los helpers de
 * typography + hex literales que espejan el token-contract (ink-950 surface,
 * text-on-dark, danger-500 status, sport-500 CTA) para no depender del runtime.
 */
const SURFACE = '#0B0E13' // DS --color-surface-inverse (ink-950, rgb 11 14 19)
const TEXT_ON_DARK = '#F4F6F8' // DS --color-text-on-dark (ink-50)
const TEXT_ON_DARK_MUTED = '#939DAB' // DS --color-text-on-dark-muted
const DANGER = '#F4365A' // DS --color-danger-500 (rgb 244 54 90)
const SPORT = '#2680FF' // DS --color-sport-500 / --color-brand

export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.iconWrap}>
        <AlertTriangle size={30} color={DANGER} strokeWidth={1.75} />
      </View>
      <Text style={styles.title}>Algo salió mal</Text>
      <Text style={styles.sub}>Tuvimos un problema cargando esta pantalla. Puedes reintentar.</Text>
      {__DEV__ ? <Text style={styles.dev} numberOfLines={4}>{error?.message}</Text> : null}
      <TouchableOpacity onPress={retry} activeOpacity={0.85} style={styles.btn}>
        <RotateCcw size={16} color="#fff" />
        <Text style={styles.btnTxt}>Reintentar</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 12 },
  iconWrap: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(244,54,90,0.12)', borderWidth: 1, borderColor: 'rgba(244,54,90,0.3)', marginBottom: 4 },
  title: { ...textStyle('lg', FONT.displayBold, { lh: 'snug', ls: 'tight' }), color: TEXT_ON_DARK },
  sub: { ...textStyle('sm', FONT.ui), color: TEXT_ON_DARK_MUTED, textAlign: 'center', maxWidth: 300 },
  dev: { ...textStyle('3xs', FONT.mono), color: DANGER, textAlign: 'center', maxWidth: 320, marginTop: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: SPORT, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, marginTop: 8 },
  btnTxt: { ...textStyle('sm', FONT.uiBold), color: '#fff' },
})
