import { useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Activity, AlertTriangle, ChevronLeft, Info, Scale } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { ScreenHeader, EmptyState } from '../../components'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { AppBackground } from '../../components/AppBackground'
import { Sparkline } from '../../components/Sparkline'
import {
  BAND_META,
  PATTERN_LABELS,
  listMyMovementFinals,
  orderedItems,
  type MovementFinal,
  type MovementItem,
} from '../../lib/movement-data'

const DISCLAIMER =
  'Tamizaje de priorización de trabajo correctivo; no es diagnóstico ni predice lesiones; no sustituye evaluación clínica.'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function AlumnoMovimientoScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [finals, setFinals] = useState<MovementFinal[]>([])

  useEffect(() => {
    ;(async () => {
      try {
        setFinals(await listMyMovementFinals())
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // La web ordena ascendente → la última del array es la más reciente.
  const latest = finals.length > 0 ? finals[finals.length - 1] : null
  const compositeSeries = useMemo(
    () => finals.map((f) => f.composite_score).filter((v): v is number => typeof v === 'number'),
    [finals]
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
        <Back theme={theme} onPress={() => router.back()} />
      </View>
      <ScreenHeader
        title="Tu screening de movimiento"
        subtitle="Resultado de tu evaluación de movimiento de ingreso y su evolución. Tu equipo lo usa para priorizar tu trabajo correctivo."
      />

      {!latest ? (
        <EmptyState
          icon={Activity}
          title="Aún no tienes evaluaciones de movimiento finalizadas."
          subtitle="Cuando tu coach registre tu screening, vas a ver acá tu reporte y tu evolución."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ReportCard theme={theme} assessment={latest} />

          {finals.length >= 2 && compositeSeries.length >= 2 ? (
            <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
              <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                Evolución
              </Text>
              <View style={styles.trendRow}>
                <Sparkline values={compositeSeries} width={220} height={56} color={theme.primary} />
                <View style={styles.trendMeta}>
                  <Text style={[styles.trendBig, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
                    {latest.composite_score ?? '—'}
                    <Text style={{ color: theme.mutedForeground, fontSize: 13, fontFamily: theme.fontSans }}>/21</Text>
                  </Text>
                  <Text style={[styles.trendSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    {finals.length} evaluaciones
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <Text style={[styles.needTwo, { color: theme.mutedForeground, backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl, fontFamily: theme.fontSans }]}>
              Con dos o más evaluaciones finales verás aquí la evolución.
            </Text>
          )}

          <Disclaimer theme={theme} />
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function ReportCard({ theme, assessment }: { theme: any; assessment: MovementFinal }) {
  const band = assessment.risk_band ? BAND_META[assessment.risk_band] : null
  const items = orderedItems(assessment.items)
  return (
    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
      {/* Encabezado: banda + compuesto */}
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>PRIORIDAD DE TRABAJO CORRECTIVO</Text>
          {band ? (
            <View style={[styles.bandChip, { backgroundColor: band.color + '1A', borderColor: band.color + '4D' }]}>
              <View style={[styles.bandDot, { backgroundColor: band.color }]} />
              <Text style={[styles.bandText, { color: band.color, fontFamily: 'Montserrat_700Bold' }]}>{band.label}</Text>
            </View>
          ) : (
            <Text style={[styles.bandText, { color: theme.mutedForeground }]}>—</Text>
          )}
          <Text style={[styles.assessedAt, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Evaluado el {formatDate(assessment.assessed_at)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>PUNTAJE COMPUESTO</Text>
          <Text style={[styles.composite, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
            {assessment.composite_score ?? '—'}
            <Text style={{ color: theme.mutedForeground, fontSize: 16, fontFamily: theme.fontSans }}>/21</Text>
          </Text>
        </View>
      </View>

      {/* Banderas */}
      {(assessment.has_pain || assessment.has_asymmetry) && (
        <View style={styles.flagsRow}>
          {assessment.has_pain && (
            <View style={[styles.flag, { backgroundColor: '#EF44441A' }]}>
              <AlertTriangle size={13} color="#EF4444" />
              <Text style={[styles.flagText, { color: '#EF4444', fontFamily: 'Inter_600SemiBold' }]}>Dolor</Text>
            </View>
          )}
          {assessment.has_asymmetry && (
            <View style={[styles.flag, { backgroundColor: '#F59E0B1A' }]}>
              <Scale size={13} color="#F59E0B" />
              <Text style={[styles.flagText, { color: '#F59E0B', fontFamily: 'Inter_600SemiBold' }]}>Asimetría</Text>
            </View>
          )}
        </View>
      )}

      {/* Tabla de patrones */}
      <View style={styles.tableHead}>
        <Text style={[styles.thPattern, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>PATRÓN</Text>
        <Text style={[styles.thScore, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>I/D</Text>
        <Text style={[styles.thFinal, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>FINAL</Text>
      </View>
      {items.map((item) => (
        <ItemRow key={item.id} theme={theme} item={item} />
      ))}

      {assessment.notes ? (
        <View style={[styles.notes, { backgroundColor: theme.secondary + '40', borderRadius: theme.radius.lg }]}>
          <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>NOTAS</Text>
          <Text style={[styles.notesText, { color: theme.foreground, fontFamily: theme.fontSans }]}>{assessment.notes}</Text>
        </View>
      ) : null}
    </View>
  )
}

function scoreTone(theme: any, score: number): string {
  if (score <= 0) return '#EF4444'
  if (score === 1) return '#F59E0B'
  return theme.foreground
}

function ItemRow({ theme, item }: { theme: any; item: MovementItem }) {
  const weakLeft =
    item.is_per_side && item.score_left != null && item.score_right != null && item.score_left < item.score_right
  const weakRight =
    item.is_per_side && item.score_left != null && item.score_right != null && item.score_right < item.score_left

  return (
    <View style={[styles.row, { borderTopColor: theme.border }]}>
      <View style={styles.rowPattern}>
        <Text style={[styles.patternName, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>
          {PATTERN_LABELS[item.pattern] ?? item.pattern}
        </Text>
        {item.comment ? (
          <Text style={[styles.patternComment, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{item.comment}</Text>
        ) : null}
        {(item.pain || item.clearing_positive === true) && (
          <View style={styles.miniFlags}>
            {item.pain && (
              <View style={[styles.miniFlag, { backgroundColor: '#EF44441A' }]}>
                <AlertTriangle size={9} color="#EF4444" />
                <Text style={[styles.miniFlagText, { color: '#EF4444', fontFamily: 'Inter_600SemiBold' }]}>Dolor</Text>
              </View>
            )}
            {item.clearing_positive === true && (
              <View style={[styles.miniFlag, { backgroundColor: '#EF44441A' }]}>
                <Text style={[styles.miniFlagText, { color: '#EF4444', fontFamily: 'Inter_600SemiBold' }]}>Descarte: Positivo</Text>
              </View>
            )}
          </View>
        )}
      </View>
      <View style={styles.rowScore}>
        {item.is_per_side ? (
          <View style={styles.sideScores}>
            <SideScore theme={theme} value={item.score_left} weak={weakLeft} />
            <Text style={{ color: theme.mutedForeground, fontSize: 11 }}>/</Text>
            <SideScore theme={theme} value={item.score_right} weak={weakRight} />
          </View>
        ) : (
          <SideScore theme={theme} value={item.score_single} weak={false} />
        )}
      </View>
      <Text style={[styles.rowFinal, { color: scoreTone(theme, item.final_score), fontFamily: 'Montserrat_700Bold' }]}>
        {item.final_score}
      </Text>
    </View>
  )
}

function SideScore({ theme, value, weak }: { theme: any; value: number | null; weak: boolean }) {
  if (value == null) return <Text style={{ color: theme.mutedForeground }}>—</Text>
  return (
    <View
      style={[
        styles.sideBox,
        weak
          ? { backgroundColor: '#EF44441A', borderColor: '#EF44444D', borderWidth: 1 }
          : { backgroundColor: theme.secondary + '66' },
      ]}
    >
      <Text style={{ color: weak ? '#EF4444' : theme.foreground, fontSize: 12, fontFamily: 'Montserrat_700Bold' }}>{value}</Text>
    </View>
  )
}

function Disclaimer({ theme }: { theme: any }) {
  return (
    <View style={[styles.disclaimer, { backgroundColor: theme.secondary + '33', borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <Info size={14} color={theme.mutedForeground} />
      <Text style={[styles.disclaimerText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{DISCLAIMER}</Text>
    </View>
  )
}

function Back({ theme, onPress }: { theme: any; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8} style={styles.backBtn} activeOpacity={0.7}>
      <ChevronLeft size={20} color={theme.mutedForeground} />
      <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 14 }}>Volver</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backRow: { paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, alignSelf: 'flex-start' },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 14 },
  section: { padding: 16, borderWidth: 1, gap: 12 },
  sectionTitle: { fontSize: 14, letterSpacing: -0.2 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  label: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  bandChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  bandDot: { width: 8, height: 8, borderRadius: 4 },
  bandText: { fontSize: 13 },
  assessedAt: { fontSize: 11, marginTop: 6 },
  composite: { fontSize: 34, letterSpacing: -1 },
  flagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  flagText: { fontSize: 11 },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  thPattern: { flex: 1, fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },
  thScore: { width: 64, fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' },
  thFinal: { width: 40, fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  rowPattern: { flex: 1, gap: 2 },
  patternName: { fontSize: 13 },
  patternComment: { fontSize: 11, lineHeight: 15 },
  miniFlags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  miniFlag: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  miniFlagText: { fontSize: 9 },
  rowScore: { width: 64, alignItems: 'center' },
  sideScores: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sideBox: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  rowFinal: { width: 40, textAlign: 'center', fontSize: 16 },
  notes: { padding: 12, gap: 2 },
  notesText: { fontSize: 13, lineHeight: 18 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  trendMeta: { flex: 1 },
  trendBig: { fontSize: 30, letterSpacing: -1 },
  trendSub: { fontSize: 11, marginTop: 2 },
  needTwo: { fontSize: 12, textAlign: 'center', borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, lineHeight: 17 },
  disclaimer: { flexDirection: 'row', gap: 8, borderWidth: 1, padding: 12 },
  disclaimerText: { flex: 1, fontSize: 11, lineHeight: 16 },
})
