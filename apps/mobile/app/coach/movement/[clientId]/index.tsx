import { useCallback, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import {
  AlertTriangle,
  ChevronLeft,
  ClipboardList,
  Info,
  Lock,
  Scale,
  Trash2,
} from 'lucide-react-native'
import { useTheme } from '../../../../context/ThemeContext'
import { ScreenHeader, Button } from '../../../../components'
import { TrendChart, type TrendPoint } from '../../../../components/coach/TrendChart'
import { EvaLoaderScreen } from '../../../../components/EvaLoader'
import { AppBackground } from '../../../../components/AppBackground'
import { hasModule } from '../../../../lib/entitlements'
import {
  getClientMovementDetail,
  deleteAssessment,
  MOVEMENT_PATTERNS_V1,
  PATTERN_LABELS,
  BAND_LABELS,
  MOVEMENT_DISCLAIMER,
  type MovementAssessmentWithItems,
  type MovementAssessmentItemRow,
  type PriorityBand,
} from '../../../../lib/movement'

const BAND_COLOR: Record<PriorityBand, string> = {
  high: '#EF4444',
  moderate: '#F59E0B',
  low: '#10B981',
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return ''
  }
}

function scoreColor(score: number, theme: any): string {
  if (score <= 0) return '#EF4444'
  if (score === 1) return '#F59E0B'
  return theme.foreground
}

export default function MovementReportScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const { clientId } = useLocalSearchParams<{ clientId: string }>()
  const [loading, setLoading] = useState(true)
  const [entitled, setEntitled] = useState(false)
  const [clientName, setClientName] = useState<string | null>(null)
  const [finals, setFinals] = useState<MovementAssessmentWithItems[]>([])
  const [draftId, setDraftId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!clientId) return
    const ok = await hasModule('movement_assessment')
    setEntitled(ok)
    if (ok) {
      const d = await getClientMovementDetail(clientId)
      setClientName(d.clientName)
      setFinals(d.finals)
      setDraftId(d.draftId)
    }
    setLoading(false)
  }, [clientId])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  function confirmDelete(id: string) {
    Alert.alert(
      'Eliminar evaluación',
      '¿Eliminar esta evaluación? La acción queda registrada en la bitácora y no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(id)
            const { error } = await deleteAssessment(id)
            setDeletingId(null)
            if (error) {
              Alert.alert('Error', error)
              return
            }
            load()
          },
        },
      ]
    )
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando reporte…" />
      </SafeAreaView>
    )
  }

  const latest = finals.length > 0 ? finals[finals.length - 1] : null

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <View style={styles.backRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={20} color={theme.mutedForeground} />
          <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 14 }}>Volver</Text>
        </TouchableOpacity>
      </View>
      <ScreenHeader title={clientName ?? 'Alumno'} subtitle="Screening de movimiento" />

      {!entitled ? (
        <View style={styles.offWrap}>
          <View style={[styles.offCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
            <Lock size={26} color={theme.mutedForeground} />
            <Text style={[styles.offTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Módulo no habilitado</Text>
            <Text style={[styles.offText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              El screening de movimiento es un módulo de pago.
            </Text>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: theme.primary, borderRadius: theme.radius.lg }]}
            activeOpacity={0.85}
            onPress={() => router.push(`/coach/movement/${clientId}/new`)}
          >
            <ClipboardList size={16} color={theme.primaryForeground} />
            <Text style={[styles.ctaText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}>
              {draftId ? 'Retomar borrador' : 'Nueva evaluación'}
            </Text>
          </TouchableOpacity>

          {!latest ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
              <Text style={[styles.emptyText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Este alumno aún no tiene screening de movimiento.
              </Text>
            </View>
          ) : (
            <>
              <ReportCard assessment={latest} theme={theme} />

              {finals.length >= 2 ? (
                <EvolutionSection finals={finals} theme={theme} />
              ) : (
                <View style={[styles.note, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
                  <Text style={[styles.noteText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    Necesitás al menos 2 evaluaciones finalizadas para ver la evolución.
                  </Text>
                </View>
              )}

              {/* Historial */}
              <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
                <Text style={[styles.sectionTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>HISTORIAL DE EVALUACIONES</Text>
                {[...finals].reverse().map((a, i) => (
                  <View
                    key={a.id}
                    style={[styles.histRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
                  >
                    <View style={styles.histInfo}>
                      {a.risk_band ? (
                        <View style={[styles.bandChip, { backgroundColor: BAND_COLOR[a.risk_band] + '1A', borderColor: BAND_COLOR[a.risk_band] + '4D' }]}>
                          <View style={[styles.dot, { backgroundColor: BAND_COLOR[a.risk_band] }]} />
                          <Text style={[styles.bandText, { color: BAND_COLOR[a.risk_band], fontFamily: 'Inter_600SemiBold' }]}>
                            {BAND_LABELS[a.risk_band]}
                          </Text>
                        </View>
                      ) : null}
                      <Text style={[styles.histScore, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                        {a.composite_score}/21
                      </Text>
                      <Text style={[styles.histDate, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                        {formatDate(a.assessed_at)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => confirmDelete(a.id)}
                      disabled={deletingId === a.id}
                      style={[styles.delBtn, { borderColor: theme.destructive + '4D', opacity: deletingId === a.id ? 0.5 : 1 }]}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={13} color={theme.destructive} />
                      <Text style={[styles.delText, { color: theme.destructive, fontFamily: 'Inter_600SemiBold' }]}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </>
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

function ReportCard({ assessment, theme }: { assessment: MovementAssessmentWithItems; theme: any }) {
  const ordered = MOVEMENT_PATTERNS_V1.map((def) => assessment.items.find((i) => i.pattern === def.slug)).filter(
    (i): i is MovementAssessmentItemRow => i != null
  )
  return (
    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
      <View style={styles.reportHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.reportLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>PRIORIDAD DE TRABAJO CORRECTIVO</Text>
          {assessment.risk_band ? (
            <View style={[styles.bandChipLg, { backgroundColor: BAND_COLOR[assessment.risk_band] + '1A', borderColor: BAND_COLOR[assessment.risk_band] + '4D' }]}>
              <View style={[styles.dotLg, { backgroundColor: BAND_COLOR[assessment.risk_band] }]} />
              <Text style={[styles.bandTextLg, { color: BAND_COLOR[assessment.risk_band], fontFamily: 'Montserrat_700Bold' }]}>
                {BAND_LABELS[assessment.risk_band]}
              </Text>
            </View>
          ) : null}
          <Text style={[styles.reportDate, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Evaluado el {formatDate(assessment.assessed_at)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.reportLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>PUNTAJE COMPUESTO</Text>
          <Text style={[styles.composite, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
            {assessment.composite_score ?? '—'}
            <Text style={[styles.compositeMax, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>/21</Text>
          </Text>
        </View>
      </View>

      <View style={styles.flagRow}>
        {assessment.has_pain ? (
          <View style={[styles.flag, { backgroundColor: '#EF44441A' }]}>
            <AlertTriangle size={13} color="#EF4444" />
            <Text style={[styles.flagText, { color: '#EF4444', fontFamily: 'Inter_600SemiBold' }]}>Dolor</Text>
          </View>
        ) : null}
        {assessment.has_asymmetry ? (
          <View style={[styles.flag, { backgroundColor: '#F59E0B1A' }]}>
            <Scale size={13} color="#F59E0B" />
            <Text style={[styles.flagText, { color: '#F59E0B', fontFamily: 'Inter_600SemiBold' }]}>Asimetría</Text>
          </View>
        ) : null}
      </View>

      {/* Tabla de patrones */}
      <View style={styles.table}>
        {ordered.map((item, i) => {
          const weakLeft = item.is_per_side && item.score_left != null && item.score_right != null && item.score_left < item.score_right
          const weakRight = item.is_per_side && item.score_left != null && item.score_right != null && item.score_right < item.score_left
          return (
            <View
              key={item.id}
              style={[styles.tableRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.patternName, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                  {PATTERN_LABELS[item.pattern]}
                </Text>
                {item.comment ? (
                  <Text style={[styles.patternComment, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{item.comment}</Text>
                ) : null}
                <View style={styles.patternFlags}>
                  {item.pain ? <Text style={[styles.tinyFlag, { color: '#EF4444', fontFamily: 'Inter_600SemiBold' }]}>Dolor</Text> : null}
                  {item.clearing_positive === true ? (
                    <Text style={[styles.tinyFlag, { color: '#EF4444', fontFamily: 'Inter_600SemiBold' }]}>Descarte: Positivo</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.rawScores}>
                {item.is_per_side ? (
                  <>
                    <RawScore value={item.score_left} weak={weakLeft} theme={theme} />
                    <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>/</Text>
                    <RawScore value={item.score_right} weak={weakRight} theme={theme} />
                  </>
                ) : (
                  <RawScore value={item.score_single} weak={false} theme={theme} />
                )}
              </View>
              <Text style={[styles.finalScore, { color: scoreColor(item.final_score, theme), fontFamily: 'Montserrat_800ExtraBold' }]}>
                {item.final_score}
              </Text>
            </View>
          )
        })}
      </View>

      {assessment.notes ? (
        <View style={[styles.notesBox, { backgroundColor: theme.background, borderRadius: theme.radius.md }]}>
          <Text style={[styles.notesLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>NOTAS</Text>
          <Text style={[styles.notesText, { color: theme.foreground, fontFamily: theme.fontSans }]}>{assessment.notes}</Text>
        </View>
      ) : null}
    </View>
  )
}

function RawScore({ value, weak, theme }: { value: number | null; weak: boolean; theme: any }) {
  if (value == null) return <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>—</Text>
  return (
    <View style={[styles.rawChip, weak ? { backgroundColor: '#EF44441A', borderColor: '#EF444466', borderWidth: 1 } : { backgroundColor: theme.background }]}>
      <Text style={[styles.rawText, { color: weak ? '#EF4444' : theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{value}</Text>
    </View>
  )
}

function EvolutionSection({ finals, theme }: { finals: MovementAssessmentWithItems[]; theme: any }) {
  const points: TrendPoint[] = finals.map((a) => ({
    label: formatDate(a.assessed_at),
    v: a.composite_score ?? 0,
  }))
  const first = finals[0]
  const last = finals[finals.length - 1]

  return (
    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
      <Text style={[styles.sectionTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>EVOLUCIÓN</Text>
      <Text style={[styles.cmpHeadCell, { color: theme.mutedForeground, fontFamily: theme.fontSans, marginBottom: 2 }]}>COMPUESTO</Text>
      <TrendChart points={points} color={theme.primary} suffix="" decimals={0} />

      <Text style={[styles.sectionTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold', marginTop: 12 }]}>
        PRIMERA VS ÚLTIMA (POR PATRÓN)
      </Text>
      <View style={styles.cmpHead}>
        <Text style={[styles.cmpHeadCell, { flex: 1, color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Patrón</Text>
        <Text style={[styles.cmpHeadCell, { width: 48, textAlign: 'center', color: theme.mutedForeground, fontFamily: theme.fontSans }]}>1ª</Text>
        <Text style={[styles.cmpHeadCell, { width: 48, textAlign: 'center', color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Últ.</Text>
      </View>
      {MOVEMENT_PATTERNS_V1.map((def, i) => {
        const f = first.items.find((it) => it.pattern === def.slug)?.final_score ?? 0
        const l = last.items.find((it) => it.pattern === def.slug)?.final_score ?? 0
        const delta = l - f
        return (
          <View
            key={def.slug}
            style={[styles.cmpRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
          >
            <Text numberOfLines={1} style={[styles.cmpName, { flex: 1, color: theme.foreground, fontFamily: theme.fontSans }]}>
              {PATTERN_LABELS[def.slug]}
            </Text>
            <Text style={[styles.cmpVal, { width: 48, color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>{f}</Text>
            <Text style={[styles.cmpVal, { width: 48, color: delta > 0 ? theme.success : delta < 0 ? theme.destructive : theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              {l}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backRow: { paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, alignSelf: 'flex-start' },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 14 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13 },
  ctaText: { fontSize: 14, letterSpacing: 0.2 },
  emptyCard: { borderWidth: 1, padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  section: { borderWidth: 1, padding: 16, gap: 4 },
  sectionTitle: { fontSize: 11, letterSpacing: 0.8 },
  note: { borderWidth: 1, padding: 16 },
  noteText: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  reportHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  reportLabel: { fontSize: 10, letterSpacing: 1 },
  bandChipLg: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginTop: 6 },
  dotLg: { width: 10, height: 10, borderRadius: 999 },
  bandTextLg: { fontSize: 14 },
  reportDate: { fontSize: 11, marginTop: 8 },
  composite: { fontSize: 32, marginTop: 4 },
  compositeMax: { fontSize: 15 },
  flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  flagText: { fontSize: 12 },
  table: { marginTop: 12 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  patternName: { fontSize: 13.5 },
  patternComment: { fontSize: 11.5, marginTop: 2, lineHeight: 15 },
  patternFlags: { flexDirection: 'row', gap: 8, marginTop: 3 },
  tinyFlag: { fontSize: 10 },
  rawScores: { flexDirection: 'row', alignItems: 'center', gap: 5, width: 70, justifyContent: 'center' },
  rawChip: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  rawText: { fontSize: 13 },
  finalScore: { fontSize: 18, width: 30, textAlign: 'center' },
  notesBox: { padding: 12, marginTop: 12, gap: 4 },
  notesLabel: { fontSize: 10, letterSpacing: 1 },
  notesText: { fontSize: 13, lineHeight: 18 },
  histRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 11, marginTop: 6 },
  histInfo: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, flex: 1 },
  bandChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  bandText: { fontSize: 11 },
  histScore: { fontSize: 13.5 },
  histDate: { fontSize: 11.5 },
  delBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  delText: { fontSize: 11 },
  cmpHead: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingBottom: 4 },
  cmpHeadCell: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  cmpRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 },
  cmpName: { fontSize: 12.5 },
  cmpVal: { fontSize: 14, textAlign: 'center' },
  disclaimer: { flexDirection: 'row', gap: 8, borderWidth: 1, padding: 12 },
  disclaimerText: { flex: 1, fontSize: 11, lineHeight: 16 },
  offWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  offCard: { borderWidth: 1, padding: 24, alignItems: 'center', gap: 12 },
  offTitle: { fontSize: 18 },
  offText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
})
