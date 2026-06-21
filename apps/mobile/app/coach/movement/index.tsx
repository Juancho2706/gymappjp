import { useCallback, useEffect, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { ChevronLeft, ClipboardList, FilePen, Info, Lock } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { ScreenHeader, Button } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { hasModule } from '../../../lib/entitlements'
import {
  listMovementHub,
  BAND_LABELS,
  MOVEMENT_DISCLAIMER,
  type MovementHubClient,
  type PriorityBand,
} from '../../../lib/movement'

const BAND_COLOR: Record<PriorityBand, string> = {
  high: '#EF4444',
  moderate: '#F59E0B',
  low: '#10B981',
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

export default function MovementHubScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [entitled, setEntitled] = useState(false)
  const [clients, setClients] = useState<MovementHubClient[]>([])

  const load = useCallback(async () => {
    try {
      const ok = await hasModule('movement_assessment')
      setEntitled(ok)
      if (ok) setClients(await listMovementHub())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Refresca al volver del wizard/reporte (drafts y finales cambian).
  useFocusEffect(
    useCallback(() => {
      if (entitled) listMovementHub().then(setClients).catch(() => {})
    }, [entitled])
  )

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando screening…" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <View style={styles.backRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={20} color={theme.mutedForeground} />
          <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 14 }}>Volver</Text>
        </TouchableOpacity>
      </View>
      <ScreenHeader title="Screening de movimiento" subtitle="Prioridad de trabajo correctivo por alumno" />

      {!entitled ? (
        <View style={styles.offWrap}>
          <View style={[styles.offCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
            <Lock size={26} color={theme.mutedForeground} />
            <Text style={[styles.offTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Módulo no habilitado</Text>
            <Text style={[styles.offText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              El screening de movimiento es un módulo de pago. Activalo desde la web para evaluar los 7 patrones, ver la banda de prioridad y la evolución de cada alumno.
            </Text>
            <Button label="Ver en la web" onPress={() => Linking.openURL('https://eva-app.cl/coach/subscription').catch(() => {})} full />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {clients.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
              <Text style={[styles.emptyText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                No tenés alumnos para evaluar todavía.
              </Text>
            </View>
          ) : (
            <View style={[styles.list, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
              {clients.map((c, i) => {
                const lf = c.latest_final
                return (
                  <View
                    key={c.client_id}
                    style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
                  >
                    <TouchableOpacity
                      style={styles.rowInfo}
                      activeOpacity={0.7}
                      onPress={() => router.push(`/coach/movement/${c.client_id}`)}
                    >
                      <Text numberOfLines={1} style={[styles.name, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                        {c.full_name ?? '—'}
                      </Text>
                      <View style={styles.metaRow}>
                        {lf?.risk_band ? (
                          <>
                            <View style={[styles.bandChip, { backgroundColor: BAND_COLOR[lf.risk_band] + '1A', borderColor: BAND_COLOR[lf.risk_band] + '4D' }]}>
                              <View style={[styles.dot, { backgroundColor: BAND_COLOR[lf.risk_band] }]} />
                              <Text style={[styles.bandText, { color: BAND_COLOR[lf.risk_band], fontFamily: 'Inter_600SemiBold' }]}>
                                {BAND_LABELS[lf.risk_band]}
                              </Text>
                            </View>
                            <Text style={[styles.metaSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                              {lf.composite_score}/21 · {formatDate(lf.assessed_at)}
                            </Text>
                          </>
                        ) : (
                          <Text style={[styles.metaSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                            Sin evaluación
                          </Text>
                        )}
                        {c.draft_id ? (
                          <View style={[styles.draftChip, { backgroundColor: theme.primary + '1A' }]}>
                            <FilePen size={11} color={theme.primary} />
                            <Text style={[styles.draftText, { color: theme.primary, fontFamily: 'Inter_600SemiBold' }]}>Borrador</Text>
                          </View>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.evalBtn, { backgroundColor: theme.primary, borderRadius: theme.radius.lg }]}
                      activeOpacity={0.85}
                      onPress={() => router.push(`/coach/movement/${c.client_id}/new`)}
                    >
                      <ClipboardList size={14} color={theme.primaryForeground} />
                      <Text style={[styles.evalText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}>
                        {c.draft_id ? 'Continuar' : 'Evaluar'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )
              })}
            </View>
          )}

          <View style={[styles.disclaimer, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
            <Info size={14} color={theme.mutedForeground} style={{ marginTop: 1 }} />
            <Text style={[styles.disclaimerText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {MOVEMENT_DISCLAIMER}
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backRow: { paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, alignSelf: 'flex-start' },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 14 },
  emptyCard: { borderWidth: 1, padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  list: { borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  rowInfo: { flex: 1, minWidth: 0, gap: 6 },
  name: { fontSize: 15 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  bandChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  bandText: { fontSize: 11 },
  metaSub: { fontSize: 11.5 },
  draftChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  draftText: { fontSize: 10 },
  evalBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9 },
  evalText: { fontSize: 12.5, letterSpacing: 0.2 },
  disclaimer: { flexDirection: 'row', gap: 8, borderWidth: 1, padding: 12 },
  disclaimerText: { flex: 1, fontSize: 11, lineHeight: 16 },
  offWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  offCard: { borderWidth: 1, padding: 24, alignItems: 'center', gap: 12 },
  offTitle: { fontSize: 18 },
  offText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
})
