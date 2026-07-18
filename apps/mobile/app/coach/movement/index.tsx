import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { ChevronRight, ClipboardCheck, ClipboardList, Users } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { useEntitlements } from '../../../lib/entitlements'
import { listMovementClients, type MovementHubClient } from '../../../lib/movement-coach'
import { AppBackground } from '../../../components/AppBackground'
import { Card } from '../../../components/Card'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { ModuleOffNotice } from '../../../components/ModuleOffNotice'
import {
  MovementDisclaimerNote,
  MovementHeader,
  PriorityBadge,
  fmtShort,
} from '../../../components/movement/MovementShared'

/**
 * Hub del modulo Evaluacion de movimiento (E6-04) — espejo mobile de `apps/web/.../coach/movement`
 * (MovementHubList). Lista de alumnos con su ultimo semaforo (`PriorityBadge` + compuesto/fecha) o
 * "Sin screening", badge de borrador pendiente y CTA Evaluar/Retomar. Toda MUTACION vive en el
 * detalle via los endpoints /api/mobile/movement/*; aca solo LECTURA (PostgREST, RLS del coach).
 *
 * Gate `hasModule('movement_assessment')` + ModuleOffNotice; sin el modulo NO se listan alumnos
 * (cero fetch). Empty-state con 0 alumnos (F9: NO hereda el crash web con lista vacia — memoria
 * project_module_pages_crash_no_clients).
 */
export default function MovementHubScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const { hasModule, ready } = useEntitlements()
  const enabled = hasModule('movement_assessment')

  const [clients, setClients] = useState<MovementHubClient[]>([])
  const [loading, setLoading] = useState(true)

  // Recarga al enfocar → tras finalizar/eliminar una evaluacion (volver del detalle) el semaforo
  // se actualiza. Sin modulo NO se pega a la DB (money-safety: cero fetch).
  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setLoading(false)
        return
      }
      let cancelled = false
      void (async () => {
        setLoading(true)
        try {
          const rows = await listMovementClients()
          if (!cancelled) setClients(rows)
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
      return () => {
        cancelled = true
      }
    }, [enabled]),
  )

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <MovementHeader
        title="Movimiento"
        subtitle="Evaluación de ingreso"
        onBack={() => router.back()}
        showBadge
      />
      {!ready || (enabled && loading) ? (
        <EvaLoaderScreen subtitle="Cargando…" />
      ) : !enabled ? (
        <ModuleOffNotice moduleKey="movement_assessment" />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {clients.length === 0 ? (
            <Card padding="lg" style={styles.emptyCard} testID="movement-hub-empty">
              <View style={[styles.emptyIcon, { backgroundColor: theme.muted }]}>
                <Users size={26} color={theme.mutedForeground} strokeWidth={1.75} />
              </View>
              <Text style={[styles.emptyText, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
                Aún no tienes alumnos. Agrega uno desde Alumnos para poder evaluar su movimiento.
              </Text>
            </Card>
          ) : (
            <>
              {/* Pista de uso — espejo del info strip del kit (MovementHub). */}
              <View style={[styles.hint, { backgroundColor: theme.secondary }]}>
                <ClipboardCheck size={15} color={theme.textSecondary} strokeWidth={2} />
                <Text style={[styles.hintTxt, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
                  Toca un alumno para ver su reporte o iniciar una evaluación.
                </Text>
              </View>

              <Card padding="none">
                {clients.map((c, i) => (
                  <View
                    key={c.client_id}
                    style={[
                      styles.row,
                      i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border } : null,
                    ]}
                  >
                    <TouchableOpacity
                      testID={`movement-client-${c.client_id}`}
                      activeOpacity={0.7}
                      style={styles.rowMain}
                      onPress={() => router.push(`/coach/movement/${c.client_id}`)}
                    >
                      <View style={[styles.avatar, { backgroundColor: theme.foreground }]}>
                        <Text style={[styles.avatarTxt, { color: theme.primary, fontFamily: FONT.displayBold }]}>
                          {(c.full_name ?? '—').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={[styles.name, { color: theme.foreground, fontFamily: FONT.uiBold }]}
                          numberOfLines={1}
                        >
                          {c.full_name ?? '—'}
                        </Text>
                        <View style={styles.metaRow}>
                          {c.latest_final?.risk_band ? (
                            <>
                              <PriorityBadge band={c.latest_final.risk_band} />
                              <Text style={[styles.meta, { color: theme.mutedForeground, fontFamily: FONT.mono }]}>
                                {c.latest_final.composite_score}/21 · {fmtShort(c.latest_final.assessed_at)}
                              </Text>
                            </>
                          ) : (
                            <Text style={[styles.noAssess, { color: theme.textSecondary, fontFamily: FONT.ui }]}>
                              Sin screening
                            </Text>
                          )}
                          {c.draft_id ? (
                            <View style={[styles.draftBadge, { backgroundColor: '#F5A52422' }]}>
                              <Text style={[styles.draftTxt, { color: '#B4700A', fontFamily: FONT.uiBold }]}>
                                Borrador en curso
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <ChevronRight size={18} color={theme.border} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`movement-evaluate-${c.client_id}`}
                      activeOpacity={0.85}
                      style={[styles.cta, { backgroundColor: theme.primary }]}
                      onPress={() => router.push(`/coach/movement/${c.client_id}?start=1`)}
                    >
                      <ClipboardList size={15} color="#fff" />
                      <Text style={[styles.ctaTxt, { fontFamily: FONT.uiBold }]}>
                        {c.draft_id ? 'Retomar' : 'Evaluar'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </Card>
            </>
          )}

          <MovementDisclaimerNote style={{ marginTop: 20 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  emptyCard: { alignItems: 'center', gap: 4 },
  emptyIcon: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 300, lineHeight: 20 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 },
  hintTxt: { flex: 1, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarTxt: { fontSize: 15 },
  name: { fontSize: 15 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 3 },
  meta: { fontSize: 11.5 },
  noAssess: { fontSize: 12 },
  draftBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  draftTxt: { fontSize: 10.5 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 14, height: 40, flexShrink: 0 },
  ctaTxt: { color: '#fff', fontSize: 12.5 },
})
