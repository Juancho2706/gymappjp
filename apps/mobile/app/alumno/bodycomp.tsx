import { useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowDown, ArrowUp, ChevronLeft, Info, Scale } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { ScreenHeader, EmptyState } from '../../components'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { AppBackground } from '../../components/AppBackground'
import { Sparkline } from '../../components/Sparkline'
import {
  deltaVsPrev,
  deviceLabel,
  formatKg,
  listMyMeasurements,
  readBiaMetrics,
  readIsakMetrics,
  type BiaMetrics,
  type BodyCompositionRow,
} from '../../lib/bodycomp-data'

type Method = 'bia' | 'isak'

const DISCLAIMER =
  'Estas mediciones son una estimación de composición corporal con fines de seguimiento, no un diagnóstico médico. Consultá a tu coach o a un profesional de salud para interpretarlas.'

// ── BIA: métricas a mostrar (espejo de StudentBiaSummary) ──
const fmtPct = (v: number) => `${v.toFixed(1)}%`
const fmtKg = (v: number) => `${v.toFixed(1)} kg`
const fmtL = (v: number) => `${v.toFixed(1)} L`
const fmtKcal = (v: number) => `${Math.round(v)} kcal`
const fmtNum = (v: number) => `${v.toFixed(1)}`
const fmtDeg = (v: number) => `${v.toFixed(1)}°`

const BIA_METRICS: { key: keyof BiaMetrics; label: string; fmt: (v: number) => string; higherIsBetter?: boolean }[] = [
  { key: 'bodyFatPercent', label: '% grasa', fmt: fmtPct },
  { key: 'skeletalMuscleMassKg', label: 'Masa muscular', fmt: fmtKg, higherIsBetter: true },
  { key: 'fatMassKg', label: 'Masa grasa', fmt: fmtKg },
  { key: 'visceralFatLevel', label: 'Grasa visceral', fmt: fmtNum },
  { key: 'basalMetabolicRateKcal', label: 'Metabolismo basal', fmt: fmtKcal, higherIsBetter: true },
  { key: 'phaseAngleDeg', label: 'Ángulo de fase', fmt: fmtDeg, higherIsBetter: true },
  { key: 'totalBodyWaterL', label: 'Agua corporal', fmt: fmtL },
]

// ── ISAK: componentes del fraccionamiento Kerr 5C (espejo de StudentIsakSummary) ──
const KERR_COMPONENTS: { key: 'muscle' | 'adipose' | 'bone' | 'residual' | 'skin'; label: string; color: string }[] = [
  { key: 'muscle', label: 'Muscular', color: '#3B82F6' },
  { key: 'adipose', label: 'Adiposo', color: '#F59E0B' },
  { key: 'bone', label: 'Óseo', color: '#10B981' },
  { key: 'residual', label: 'Residual', color: '#8B5CF6' },
  { key: 'skin', label: 'Piel', color: '#EC4899' },
]

export default function AlumnoBodyCompScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [bia, setBia] = useState<BodyCompositionRow[]>([])
  const [isak, setIsak] = useState<BodyCompositionRow[]>([])

  useEffect(() => {
    ;(async () => {
      try {
        const [b, i] = await Promise.all([listMyMeasurements('bia'), listMyMeasurements('isak')])
        setBia(b)
        setIsak(i)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const hasBia = bia.length > 0
  const hasIsak = isak.length > 0
  const hasBoth = hasBia && hasIsak
  const [method, setMethod] = useState<Method>('bia')
  const active: Method = hasBoth ? method : hasBia ? 'bia' : 'isak'

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando mediciones…" />
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
      <ScreenHeader title="Composición corporal" subtitle="Tus mediciones y tendencia" />

      {!hasBia && !hasIsak ? (
        <EmptyState
          icon={Scale}
          title="Sin mediciones aún"
          subtitle="Tu coach aún no registró tu composición corporal. Cuando lo haga, vas a ver acá tus mediciones y tu evolución."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {hasBoth && (
            <View style={[styles.switcher, { backgroundColor: theme.secondary + '4D', borderRadius: theme.radius.xl }]}>
              {([
                { key: 'bia' as const, label: 'Bioimpedancia' },
                { key: 'isak' as const, label: 'Antropometría' },
              ]).map((m) => (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => setMethod(m.key)}
                  activeOpacity={0.8}
                  style={[
                    styles.switchBtn,
                    { borderRadius: theme.radius.lg },
                    active === m.key ? { backgroundColor: theme.background } : null,
                  ]}
                >
                  <Text style={{ fontSize: 13, fontFamily: 'Montserrat_700Bold', color: active === m.key ? theme.primary : theme.mutedForeground }}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {active === 'bia' ? (
            <>
              <BiaSummary theme={theme} rows={bia} />
              {bia.length >= 2 ? <BiaTrend theme={theme} rows={bia} /> : <NeedTwo theme={theme} />}
            </>
          ) : (
            <>
              <IsakSummary theme={theme} rows={isak} />
              {isak.length >= 2 ? <IsakTrend theme={theme} rows={isak} /> : <NeedTwo theme={theme} />}
            </>
          )}

          <Disclaimer theme={theme} />
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

// ─── BIA ──────────────────────────────────────────────────────────────────────

function BiaSummary({ theme, rows }: { theme: any; rows: BodyCompositionRow[] }) {
  const latest = rows[0]
  if (!latest) return null
  const metrics = readBiaMetrics(latest)
  const present = BIA_METRICS.filter((m) => typeof metrics[m.key] === 'number')

  return (
    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
      <View style={styles.cardHead}>
        <Text style={[styles.sectionTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>ÚLTIMA MEDICIÓN</Text>
        <Text style={[styles.device, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{deviceLabel(latest)}</Text>
      </View>
      <View style={styles.metricGrid}>
        {present.map((m) => {
          const value = metrics[m.key] as number
          const delta = deltaVsPrev(rows, 0, (r) => {
            const v = readBiaMetrics(r)[m.key]
            return typeof v === 'number' ? v : null
          })
          return (
            <View key={String(m.key)} style={[styles.metricBox, { backgroundColor: theme.secondary + '33', borderColor: theme.border, borderRadius: theme.radius.lg }]}>
              <Text style={[styles.metricLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{m.label}</Text>
              <Text style={[styles.metricValue, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{m.fmt(value)}</Text>
              {delta != null && delta !== 0 ? <Delta theme={theme} delta={delta} higherIsBetter={m.higherIsBetter} fmt={m.fmt} /> : null}
            </View>
          )
        })}
      </View>
    </View>
  )
}

function BiaTrend({ theme, rows }: { theme: any; rows: BodyCompositionRow[] }) {
  // rows viene más reciente primero → invertimos para serie cronológica.
  const series = useMemo(() => {
    const asc = [...rows].reverse()
    return {
      bodyFat: asc.map((r) => readBiaMetrics(r).bodyFatPercent).filter((v): v is number => typeof v === 'number'),
      muscle: asc.map((r) => readBiaMetrics(r).skeletalMuscleMassKg).filter((v): v is number => typeof v === 'number'),
    }
  }, [rows])
  if (series.bodyFat.length < 2 && series.muscle.length < 2) return <NeedTwo theme={theme} />
  return (
    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
      <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Tendencia</Text>
      {series.bodyFat.length >= 2 ? (
        <TrendRow theme={theme} label="% grasa" values={series.bodyFat} format={fmtPct} color="#F59E0B" />
      ) : null}
      {series.muscle.length >= 2 ? (
        <TrendRow theme={theme} label="Masa muscular" values={series.muscle} format={fmtKg} color="#3B82F6" />
      ) : null}
    </View>
  )
}

// ─── ISAK ─────────────────────────────────────────────────────────────────────

function IsakSummary({ theme, rows }: { theme: any; rows: BodyCompositionRow[] }) {
  const latest = rows[0]
  const view = latest ? readIsakMetrics(latest) : null
  if (!latest || !view) return null
  const { fractionation: f, somatotype: s, bodyFat } = view

  return (
    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
      <View style={styles.cardHead}>
        <Text style={[styles.sectionTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>ÚLTIMA MEDICIÓN</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!latest.is_validated ? (
            <View style={[styles.prelim, { backgroundColor: '#F59E0B26' }]}>
              <Text style={{ color: '#F59E0B', fontSize: 9, fontFamily: 'Montserrat_700Bold', letterSpacing: 0.5 }}>PRELIMINAR</Text>
            </View>
          ) : null}
          <Text style={[styles.device, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{deviceLabel(latest)}</Text>
        </View>
      </View>

      {/* Headlines */}
      <View style={styles.headlineRow}>
        <View style={[styles.metricBox, { flex: 1, backgroundColor: theme.secondary + '33', borderColor: theme.border, borderRadius: theme.radius.lg }]}>
          <Text style={[styles.metricLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>% grasa</Text>
          <Text style={[styles.metricValue, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{fmtPct(bodyFat.percent)}</Text>
        </View>
        <View style={[styles.metricBox, { flex: 1, backgroundColor: theme.secondary + '33', borderColor: theme.border, borderRadius: theme.radius.lg }]}>
          <Text style={[styles.metricLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Somatotipo</Text>
          <Text style={[styles.metricValue, { color: theme.foreground, fontFamily: 'Montserrat_700Bold', fontSize: 15 }]}>
            {s.endomorphy.toFixed(1)} – {s.mesomorphy.toFixed(1)} – {s.ectomorphy.toFixed(1)}
          </Text>
          <Text style={[styles.metricLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>endo · meso · ecto</Text>
        </View>
      </View>

      {/* Barra apilada Kerr 5C */}
      <View style={{ gap: 8 }}>
        <Text style={[styles.metricLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>COMPOSICIÓN</Text>
        <View style={[styles.kerrBar, { backgroundColor: theme.secondary + '66' }]}>
          {KERR_COMPONENTS.map(({ key, color }) => {
            const raw = f[key].pct
            const pct = Math.min(Math.max(raw ?? 0, 0), 100)
            return <View key={key} style={{ width: `${pct}%`, backgroundColor: color, height: '100%' }} />
          })}
        </View>
        <View style={styles.kerrLegend}>
          {KERR_COMPONENTS.map(({ key, label, color }) => (
            <View key={key} style={styles.kerrItem}>
              <View style={[styles.kerrDot, { backgroundColor: color }]} />
              <Text style={[styles.kerrLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
              <Text style={[styles.kerrPct, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{f[key].pct.toFixed(1)}%</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={[styles.massNote, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        Σ {formatKg(f.predictedMassKg)} · {formatKg(f.measuredWeightKg)} ·{' '}
        <Text style={{ color: Math.abs(f.massDifferenceKg) <= 3 ? theme.success : '#F59E0B' }}>
          {f.massDifferenceKg > 0 ? '+' : ''}
          {formatKg(f.massDifferenceKg)}
        </Text>
      </Text>
    </View>
  )
}

function IsakTrend({ theme, rows }: { theme: any; rows: BodyCompositionRow[] }) {
  const series = useMemo(() => {
    const asc = [...rows].reverse()
    return {
      bodyFat: asc.map((r) => readIsakMetrics(r)?.bodyFat.percent).filter((v): v is number => typeof v === 'number'),
      muscle: asc.map((r) => readIsakMetrics(r)?.fractionation.muscle.kg).filter((v): v is number => typeof v === 'number'),
    }
  }, [rows])
  if (series.bodyFat.length < 2 && series.muscle.length < 2) return <NeedTwo theme={theme} />
  return (
    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
      <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Tendencia</Text>
      {series.bodyFat.length >= 2 ? (
        <TrendRow theme={theme} label="% grasa" values={series.bodyFat} format={fmtPct} color="#F59E0B" />
      ) : null}
      {series.muscle.length >= 2 ? (
        <TrendRow theme={theme} label="Masa muscular" values={series.muscle} format={fmtKg} color="#3B82F6" />
      ) : null}
    </View>
  )
}

// ─── Compartidos ────────────────────────────────────────────────────────────

function TrendRow({ theme, label, values, format, color }: { theme: any; label: string; values: number[]; format: (v: number) => string; color: string }) {
  const first = values[0]
  const last = values[values.length - 1]
  const delta = Math.round((last - first) * 100) / 100
  return (
    <View style={styles.trendRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.trendLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
        <Text style={[styles.trendValue, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{format(last)}</Text>
        {delta !== 0 ? (
          <Text style={{ color: theme.mutedForeground, fontSize: 11, fontFamily: theme.fontSans }}>
            {delta > 0 ? '+' : ''}{format(delta)} vs inicio
          </Text>
        ) : null}
      </View>
      <Sparkline values={values} width={140} height={44} color={color} />
    </View>
  )
}

function Delta({ theme, delta, higherIsBetter, fmt }: { theme: any; delta: number; higherIsBetter?: boolean; fmt: (v: number) => string }) {
  const isImprovement = higherIsBetter ? delta > 0 : delta < 0
  const Icon = delta > 0 ? ArrowUp : ArrowDown
  const color = isImprovement ? theme.success : theme.destructive
  return (
    <View style={styles.deltaRow}>
      <Icon size={11} color={color} />
      <Text style={{ color, fontSize: 10, fontFamily: 'Montserrat_700Bold' }}>{fmt(Math.abs(delta))}</Text>
    </View>
  )
}

function NeedTwo({ theme }: { theme: any }) {
  return (
    <Text style={[styles.needTwo, { color: theme.mutedForeground, backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl, fontFamily: theme.fontSans }]}>
      Necesitás al menos dos mediciones para ver tu evolución.
    </Text>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  backRow: { paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, alignSelf: 'flex-start' },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 14 },
  switcher: { flexDirection: 'row', padding: 6, gap: 6 },
  switchBtn: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  section: { padding: 16, borderWidth: 1, gap: 14 },
  sectionTitle: { fontSize: 13, letterSpacing: 0.4 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  device: { fontSize: 11 },
  prelim: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricBox: { flexGrow: 1, flexBasis: '30%', minWidth: 96, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 9, gap: 2 },
  metricLabel: { fontSize: 9, letterSpacing: 0.4, textTransform: 'uppercase' },
  metricValue: { fontSize: 17, letterSpacing: -0.3 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 1 },
  headlineRow: { flexDirection: 'row', gap: 8 },
  kerrBar: { flexDirection: 'row', height: 16, borderRadius: 999, overflow: 'hidden' },
  kerrLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, rowGap: 6 },
  kerrItem: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: '44%' },
  kerrDot: { width: 10, height: 10, borderRadius: 3 },
  kerrLabel: { fontSize: 11 },
  kerrPct: { fontSize: 11, marginLeft: 'auto' },
  massNote: { fontSize: 10, lineHeight: 14 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trendLabel: { fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase' },
  trendValue: { fontSize: 22, letterSpacing: -0.6 },
  needTwo: { fontSize: 12, textAlign: 'center', borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, lineHeight: 17 },
  disclaimer: { flexDirection: 'row', gap: 8, borderWidth: 1, padding: 12 },
  disclaimerText: { flex: 1, fontSize: 11, lineHeight: 16 },
})
