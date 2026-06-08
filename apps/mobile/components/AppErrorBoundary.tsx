import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AlertTriangle, RotateCcw } from 'lucide-react-native'
import type { ErrorBoundaryProps } from 'expo-router'

/**
 * Fallback de error a nivel app (Ola 0). Se renderiza si un throw escapa el árbol
 * → en vez de pantalla blanca, UI de marca + "Reintentar". NO usa ThemeProvider
 * (puede vivir fuera de su contexto): paleta oscura fija. Reporte a Sentry se
 * cablea en Batch 8.
 */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.iconWrap}>
        <AlertTriangle size={30} color="#FF453A" strokeWidth={1.75} />
      </View>
      <Text style={styles.title}>Algo salió mal</Text>
      <Text style={styles.sub}>Tuvimos un problema cargando esta pantalla. Podés reintentar.</Text>
      {__DEV__ ? <Text style={styles.dev} numberOfLines={4}>{error?.message}</Text> : null}
      <TouchableOpacity onPress={retry} activeOpacity={0.85} style={styles.btn}>
        <RotateCcw size={16} color="#fff" />
        <Text style={styles.btnTxt}>Reintentar</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B0C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 12 },
  iconWrap: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,69,58,0.12)', borderWidth: 1, borderColor: 'rgba(255,69,58,0.3)', marginBottom: 4 },
  title: { color: '#F8F9FA', fontSize: 19, fontFamily: 'Montserrat_800ExtraBold', letterSpacing: -0.3 },
  sub: { color: '#A1A1AA', fontSize: 13.5, lineHeight: 20, textAlign: 'center', maxWidth: 300 },
  dev: { color: '#FF453A', fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', maxWidth: 320, marginTop: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#007AFF', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  btnTxt: { color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold' },
})
