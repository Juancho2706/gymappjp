import { useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ArrowDown, ArrowUp, ChevronLeft, Ruler, Trash2 } from 'lucide-react-native'
import type { BiaMetrics } from '@eva/bodycomp'
import { useTheme } from '../../context/ThemeContext'
import { FONT } from '../../lib/typography'
import {
  deltaVsPrev,
  deviceLabel,
  fmtShort,
  formatKg,
  formatPct,
  readBiaMetrics,
  readIsakView,
  type BodyCompRow,
  type IsakView,
} from '../../lib/bodycomp-coach'
import { Badge } from '../Badge'
import { Card } from '../Card'
import { AreaTrend, type AreaPoint } from './charts/AreaTrend'

/**
 * Piezas compartidas del modulo Composicion corporal (E6-05): header con tile de marca + badge
 * "Modulo", la tarjeta de resultado ISAK (portada), el resumen BIA de la ultima medicion y los
 * paneles de tendencia (chart existente AreaTrend + historial con eliminar). Espejo RN de
 * `IsakResultCard` / `StudentBiaSummary` / `BiaTrendPanel` / `IsakTrendPanel` de la web. Los
 * metodos NUNCA se mezclan (cada panel es de UN metodo).
 */

const WARNING = '#F5A524'
const WARNING_FG = '#B4700A'

/* ── Header ───────────────────────────────────────────────────────────────────── */
export function BodyCompHeader({
  title,
  subtitle,
  onBack,
  showBadge = false,
}: {
  title: string
  subtitle: string
  onBack: () => void
  showBadge?: boolean
}) {
  const { theme } = useTheme()
  return (
    <View style={styles.header}>
      <TouchableOpacity
        testID="bodycomp-back"
        onPress={onBack}
        activeOpacity={0.8}
        style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
      >
        <ChevronLeft size={20} color={theme.foreground} />
      </TouchableOpacity>
      <View className="bg-sport-100" style={styles.iconTile}>
        <Ruler size={18} color={theme.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.hTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.hSub, { color: theme.mutedForeground, fontFamily: FONT.ui }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {showBadge ? (
        <Badge tone="sport" variant="soft" size="sm">
          Módulo
        </Badge>
      ) : null}
    </View>
  )
}

/* ── IsakResultCard (portada / preview en vivo) ─────────────────────────────────── */
const COMPONENT_LABELS: { key: keyof IsakView['fractionation']; label: string }[] = [
  { key: 'muscle', label: 'Muscular' },
  { key: 'adipose', label: 'Adiposo' },
  { key: 'bone', label: 'Óseo' },
  { key: 'residual', label: 'Residual' },
  { key: 'skin', label: 'Piel' },
]

/**
 * Tarjeta ISAK: 5 componentes Kerr (kg + %), validez interna (Σ masas vs peso), somatotipo y %
 * grasa. Con `isValidated` false el % grasa lleva "preliminar" (no es dato definitivo).
 */
export function IsakResultCard({
  view,
  isValidated,
  title = 'Resultado',
}: {
  view: IsakView
  isValidated: boolean
  title?: string
}) {
  const { theme } = useTheme()
  const { fractionation: f, somatotype: s, bodyFat } = view
  const deltaOk = Math.abs(f.massDifferenceKg) <= 3

  return (
    <Card padding="md">
      <View style={styles.isakHead}>
        <Text style={[styles.eyebrow, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
          {title.toUpperCase()}
        </Text>
        {!isValidated ? (
          <Badge tone="warning" variant="soft" size="sm">
            Preliminar
          </Badge>
        ) : null}
      </View>

      {/* 5 componentes Kerr */}
      <View style={styles.kerrGrid}>
        {COMPONENT_LABELS.map(({ key, label }) => {
          const comp = f[key] as { kg: number; pct: number }
          return (
            <View key={key} style={[styles.kerrTile, { backgroundColor: theme.secondary }]}>
              <Text style={[styles.tileLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
                {label.toUpperCase()}
              </Text>
              <Text style={[styles.tileValue, { color: theme.foreground, fontFamily: FONT.displayBlack }]}>
                {formatKg(comp.kg)}
              </Text>
              <Text style={[styles.tileSub, { color: theme.mutedForeground, fontFamily: FONT.uiSemibold }]}>
                {formatPct(comp.pct)}
              </Text>
            </View>
          )
        })}
      </View>

      {/* Validez interna del fraccionamiento */}
      <Text style={[styles.validity, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
        Σ masas {formatKg(f.predictedMassKg)} · peso {formatKg(f.measuredWeightKg)} · Δ{' '}
        <Text style={{ color: deltaOk ? theme.success : WARNING_FG, fontFamily: FONT.uiBold }}>
          {f.massDifferenceKg > 0 ? '+' : ''}
          {formatKg(f.massDifferenceKg)}
        </Text>
      </Text>

      {/* Somatotipo + % grasa */}
      <View style={styles.somaRow}>
        <View style={[styles.somaTile, { backgroundColor: theme.secondary }]}>
          <Text style={[styles.tileLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
            SOMATOTIPO
          </Text>
          <Text style={[styles.somaValue, { color: theme.foreground, fontFamily: FONT.displayBlack }]}>
            {s.endomorphy.toFixed(1)} – {s.mesomorphy.toFixed(1)} – {s.ectomorphy.toFixed(1)}
          </Text>
          <Text style={[styles.tileSub, { color: theme.mutedForeground, fontFamily: FONT.uiSemibold }]}>
            Endo – Meso – Ecto
          </Text>
        </View>
        <View style={[styles.somaTile, { backgroundColor: theme.secondary }]}>
          <Text style={[styles.tileLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
            % GRASA {!isValidated ? '(PRELIM.)' : ''}
          </Text>
          <Text style={[styles.bfValue, { color: theme.foreground, fontFamily: FONT.displayBlack }]}>
            {formatPct(bodyFat.percent)}
          </Text>
          <Text style={[styles.tileSub, { color: theme.mutedForeground, fontFamily: FONT.uiSemibold }]} numberOfLines={1}>
            {bodyFat.equation}
          </Text>
        </View>
      </View>
    </Card>
  )
}

/* ── BIA — resumen de la ultima medicion (tiles + delta) ────────────────────────── */
type BiaMetricDef = {
  key: keyof BiaMetrics
  label: string
  fmt: (v: number) => string
  higherIsBetter?: boolean
}
const fmtL = (v: number) => `${v.toFixed(1)} L`
const fmtKcal = (v: number) => `${Math.round(v)} kcal`
const fmtDeg = (v: number) => `${v.toFixed(1)}°`
const fmtNum = (v: number) => `${v.toFixed(1)}`

const BIA_METRICS: BiaMetricDef[] = [
  { key: 'bodyFatPercent', label: '% Grasa', fmt: formatPct },
  { key: 'skeletalMuscleMassKg', label: 'Masa muscular', fmt: formatKg, higherIsBetter: true },
  { key: 'fatMassKg', label: 'Masa grasa', fmt: formatKg },
  { key: 'visceralFatLevel', label: 'Grasa visceral', fmt: fmtNum },
  { key: 'basalMetabolicRateKcal', label: 'Metabolismo basal', fmt: fmtKcal, higherIsBetter: true },
  { key: 'phaseAngleDeg', label: 'Ángulo de fase', fmt: fmtDeg, higherIsBetter: true },
  { key: 'totalBodyWaterL', label: 'Agua corporal', fmt: fmtL },
]

function BiaSummaryCard({ rows }: { rows: BodyCompRow[] }) {
  const { theme } = useTheme()
  const latest = rows[0]
  if (!latest) return null
  const metrics = readBiaMetrics(latest)
  const present = BIA_METRICS.filter((m) => typeof metrics[m.key] === 'number')
  if (present.length === 0) return null

  return (
    <Card padding="md">
      <View style={styles.summaryHead}>
        <Text style={[styles.eyebrow, { color: theme.mutedForeground, fontFamily: FONT.uiExtra }]}>
          ÚLTIMA MEDICIÓN
        </Text>
        <Text style={[styles.summaryDevice, { color: theme.mutedForeground, fontFamily: FONT.uiSemibold }]}>
          {deviceLabel(latest)}
        </Text>
      </View>
      <View style={styles.summaryGrid}>
        {present.map((m) => {
          const value = metrics[m.key] as number
          const delta = deltaVsPrev(rows, 0, (r) => {
            const v = readBiaMetrics(r)[m.key]
            return typeof v === 'number' ? v : null
          })
          const improvement = delta != null && delta !== 0 && (m.higherIsBetter ? delta > 0 : delta < 0)
          const Arrow = delta != null && delta > 0 ? ArrowUp : ArrowDown
          return (
            <View key={String(m.key)} style={[styles.summaryTile, { backgroundColor: theme.secondary }]}>
              <Text style={[styles.summaryTileLabel, { color: theme.mutedForeground, fontFamily: FONT.uiExtra }]} numberOfLines={1}>
                {m.label.toUpperCase()}
              </Text>
              <Text style={[styles.summaryTileValue, { color: theme.foreground, fontFamily: FONT.displayBlack }]}>
                {m.fmt(value)}
              </Text>
              {delta != null && delta !== 0 ? (
                <View style={styles.deltaRow}>
                  <Arrow size={11} color={improvement ? theme.success : theme.destructive} strokeWidth={2.5} />
                  <Text style={[styles.deltaTxt, { color: improvement ? theme.success : theme.destructive, fontFamily: FONT.uiBold }]}>
                    {m.fmt(Math.abs(delta))}
                  </Text>
                </View>
              ) : null}
            </View>
          )
        })}
      </View>
    </Card>
  )
}

/* ── Series pills + chart helpers ───────────────────────────────────────────────── */
function SeriesPills<T extends string>({
  series,
  active,
  onSelect,
  delta,
  deltaFmt,
}: {
  series: { key: T; label: string }[]
  active: T
  onSelect: (k: T) => void
  delta: number | null
  deltaFmt: (v: number) => string
}) {
  const { theme } = useTheme()
  return (
    <View style={styles.pillsRow}>
      {series.map((s) => {
        const on = s.key === active
        return (
          <TouchableOpacity
            key={s.key}
            testID={`bodycomp-series-${s.key}`}
            activeOpacity={0.85}
            onPress={() => onSelect(s.key)}
            style={[styles.pill, { backgroundColor: on ? theme.foreground : theme.secondary }]}
          >
            <Text style={[styles.pillTxt, { color: on ? theme.background : theme.mutedForeground, fontFamily: FONT.uiBold }]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        )
      })}
      {delta != null ? (
        <Text
          style={[
            styles.pillDelta,
            {
              color: delta > 0 ? theme.destructive : delta < 0 ? theme.success : theme.mutedForeground,
              fontFamily: FONT.monoBold,
            },
          ]}
        >
          Δ {delta > 0 ? '+' : ''}
          {deltaFmt(delta)}
        </Text>
      ) : null}
    </View>
  )
}

function buildPoints(rows: BodyCompRow[], pick: (r: BodyCompRow) => number | null): AreaPoint[] {
  const asc = [...rows].reverse()
  const pts: AreaPoint[] = []
  for (const r of asc) {
    const y = pick(r)
    if (y != null && Number.isFinite(y)) pts.push({ i: pts.length, y, label: fmtShort(r.measured_at) })
  }
  return pts
}

/* ── Historial con eliminar ─────────────────────────────────────────────────────── */
function HistoryList({
  rows,
  deletingId,
  onDelete,
  describe,
  preliminary,
}: {
  rows: BodyCompRow[]
  deletingId: string | null
  onDelete: (id: string) => void
  describe: (r: BodyCompRow) => string
  preliminary?: (r: BodyCompRow) => boolean
}) {
  const { theme } = useTheme()
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r) => (
        <View key={r.id} style={[styles.histRow, { backgroundColor: theme.secondary }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.histTitle, { color: theme.foreground, fontFamily: FONT.uiBold }]} numberOfLines={1}>
              {deviceLabel(r)}
              {preliminary?.(r) ? (
                <Text style={{ color: WARNING_FG, fontFamily: FONT.uiBold }}>  · Preliminar</Text>
              ) : null}
            </Text>
            <Text style={[styles.histMeta, { color: theme.mutedForeground, fontFamily: FONT.ui }]} numberOfLines={1}>
              {describe(r)}
            </Text>
          </View>
          <TouchableOpacity
            testID={`bodycomp-delete-${r.id}`}
            hitSlop={8}
            disabled={deletingId === r.id}
            onPress={() => onDelete(r.id)}
            style={styles.histDel}
          >
            {deletingId === r.id ? (
              <ActivityIndicator size="small" color={theme.destructive} />
            ) : (
              <Trash2 size={17} color={theme.destructive} strokeWidth={2} />
            )}
          </TouchableOpacity>
        </View>
      ))}
    </View>
  )
}

/* ── BIA trend panel ────────────────────────────────────────────────────────────── */
type BiaSeriesKey = 'bodyFatPercent' | 'skeletalMuscleMassKg'
const BIA_SERIES: { key: BiaSeriesKey; label: string; fmt: (v: number) => string; suffix: string }[] = [
  { key: 'bodyFatPercent', label: '% Grasa', fmt: formatPct, suffix: '%' },
  { key: 'skeletalMuscleMassKg', label: 'Masa muscular', fmt: formatKg, suffix: ' kg' },
]

export function BiaTrendPanel({
  rows,
  deletingId,
  onDelete,
}: {
  rows: BodyCompRow[]
  deletingId: string | null
  onDelete: (id: string) => void
}) {
  const { theme } = useTheme()
  const [active, setActive] = useState<BiaSeriesKey>('bodyFatPercent')
  const series = BIA_SERIES.find((s) => s.key === active)!

  const pick = useMemo(
    () => (r: BodyCompRow) => {
      const v = readBiaMetrics(r)[active]
      return typeof v === 'number' ? v : null
    },
    [active],
  )
  const points = useMemo(() => buildPoints(rows, pick), [rows, pick])
  const latestDelta = rows.length ? deltaVsPrev(rows, 0, pick) : null

  if (rows.length === 0) {
    return (
      <Card padding="lg" style={styles.emptyCard} testID="bodycomp-bia-trend-empty">
        <Text style={[styles.emptyTxt, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
          Aún no hay mediciones de bioimpedancia para este alumno.
        </Text>
      </Card>
    )
  }

  return (
    <View style={{ gap: 12 }}>
      <BiaSummaryCard rows={rows} />
      <Card padding="md">
        <SeriesPills series={BIA_SERIES} active={active} onSelect={setActive} delta={latestDelta} deltaFmt={series.fmt} />
        {points.length >= 2 ? (
          <AreaTrend points={points} color={theme.primary} suffix={series.suffix} decimals={1} height={200} />
        ) : (
          <Text style={[styles.needTwo, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
            Con dos o más mediciones verás aquí la curva.
          </Text>
        )}
      </Card>
      <HistoryList
        rows={rows}
        deletingId={deletingId}
        onDelete={onDelete}
        describe={(r) => {
          const m = readBiaMetrics(r)
          const parts: string[] = []
          if (typeof m.bodyFatPercent === 'number') parts.push(`${formatPct(m.bodyFatPercent)} grasa`)
          if (typeof m.skeletalMuscleMassKg === 'number') parts.push(`${formatKg(m.skeletalMuscleMassKg)} músculo`)
          return parts.join(' · ') || 'Medición BIA'
        }}
      />
    </View>
  )
}

/* ── ISAK trend panel ───────────────────────────────────────────────────────────── */
type IsakSeriesKey = 'bodyFat' | 'muscle' | 'adipose'
const ISAK_SERIES: {
  key: IsakSeriesKey
  label: string
  fmt: (v: number) => string
  suffix: string
  read: (v: IsakView) => number
}[] = [
  { key: 'bodyFat', label: '% Grasa', fmt: formatPct, suffix: '%', read: (v) => v.bodyFat.percent },
  { key: 'muscle', label: 'Masa muscular', fmt: formatKg, suffix: ' kg', read: (v) => v.fractionation.muscle.kg },
  { key: 'adipose', label: 'Masa adiposa', fmt: formatKg, suffix: ' kg', read: (v) => v.fractionation.adipose.kg },
]

export function IsakTrendPanel({
  rows,
  deletingId,
  onDelete,
}: {
  rows: BodyCompRow[]
  deletingId: string | null
  onDelete: (id: string) => void
}) {
  const { theme } = useTheme()
  const [active, setActive] = useState<IsakSeriesKey>('bodyFat')
  const series = ISAK_SERIES.find((s) => s.key === active)!

  const pick = useMemo(
    () => (r: BodyCompRow) => {
      const v = readIsakView(r)
      return v ? series.read(v) : null
    },
    [series],
  )
  const points = useMemo(() => buildPoints(rows, pick), [rows, pick])
  const latest = rows[0]
  const latestView = latest ? readIsakView(latest) : null
  const latestDelta = rows.length ? deltaVsPrev(rows, 0, pick) : null

  if (rows.length === 0) {
    return (
      <Card padding="lg" style={styles.emptyCard} testID="bodycomp-isak-trend-empty">
        <Text style={[styles.emptyTxt, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
          Aún no hay mediciones de antropometría (ISAK) para este alumno.
        </Text>
      </Card>
    )
  }

  return (
    <View style={{ gap: 12 }}>
      {latestView ? <IsakResultCard view={latestView} isValidated={latest!.is_validated} title="Última medición" /> : null}
      <Card padding="md">
        <SeriesPills series={ISAK_SERIES} active={active} onSelect={setActive} delta={latestDelta} deltaFmt={series.fmt} />
        {points.length >= 2 ? (
          <AreaTrend points={points} color={theme.success} suffix={series.suffix} decimals={1} height={200} />
        ) : (
          <Text style={[styles.needTwo, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
            Con dos o más mediciones verás aquí la curva.
          </Text>
        )}
      </Card>
      <HistoryList
        rows={rows}
        deletingId={deletingId}
        onDelete={onDelete}
        preliminary={(r) => !r.is_validated}
        describe={(r) => {
          const v = readIsakView(r)
          return v ? `${formatPct(v.bodyFat.percent)} grasa · ${formatKg(v.fractionation.muscle.kg)} músculo` : 'Medición ISAK'
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  iconTile: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  hTitle: { fontSize: 19, letterSpacing: -0.4 },
  hSub: { fontSize: 12.5, marginTop: 1 },
  // IsakResultCard
  isakHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  eyebrow: { fontSize: 11, letterSpacing: 0.6 },
  kerrGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kerrTile: { flexGrow: 1, flexBasis: '30%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  tileLabel: { fontSize: 9, letterSpacing: 0.5 },
  tileValue: { fontSize: 16, letterSpacing: -0.3, marginTop: 2 },
  tileSub: { fontSize: 10, marginTop: 1 },
  validity: { fontSize: 11, lineHeight: 16, marginTop: 10 },
  somaRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  somaTile: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  somaValue: { fontSize: 15, letterSpacing: -0.3, marginTop: 2 },
  bfValue: { fontSize: 19, letterSpacing: -0.5, marginTop: 2 },
  // BIA summary
  summaryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  summaryDevice: { fontSize: 11 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryTile: { flexGrow: 1, flexBasis: '30%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  summaryTileLabel: { fontSize: 9, letterSpacing: 0.5 },
  summaryTileValue: { fontSize: 16, letterSpacing: -0.3, marginTop: 3 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  deltaTxt: { fontSize: 10.5 },
  // Series pills
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 14, height: 34, alignItems: 'center', justifyContent: 'center' },
  pillTxt: { fontSize: 12.5 },
  pillDelta: { marginLeft: 'auto', fontSize: 12.5 },
  needTwo: { fontSize: 12.5, lineHeight: 18, paddingVertical: 24, textAlign: 'center' },
  // History
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  histTitle: { fontSize: 13 },
  histMeta: { fontSize: 11.5, marginTop: 2 },
  histDel: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  // Empty
  emptyCard: { alignItems: 'center' },
  emptyTxt: { fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
})
