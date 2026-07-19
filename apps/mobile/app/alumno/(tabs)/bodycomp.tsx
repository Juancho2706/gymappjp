import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { ArrowDown, ArrowLeft, ArrowUp, Gauge, Info, Scale } from 'lucide-react-native'
import type { BiaMetrics } from '@eva/bodycomp'
import { useTheme } from '../../../context/ThemeContext'
import { useEntitlements } from '../../../lib/entitlements'
import { getClientProfile } from '../../../lib/client'
import { supabase } from '../../../lib/supabase'
import { Card } from '../../../components/Card'
import { Badge } from '../../../components/Badge'
import { ModuleOffNotice } from '../../../components/ModuleOffNotice'
import { AppBackground } from '../../../components/AppBackground'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AreaTrend, type AreaPoint } from '../../../components/coach/charts/AreaTrend'
import { ALUMNO_TABBAR_CLEARANCE } from '../../../components/alumno/AlumnoMobileChrome'
import { FONT } from '../../../lib/typography'

/**
 * Vista COMPOSICION CORPORAL del ALUMNO (read-only) — E6-09. Port RN de la web
 * `c/[coach_slug]/bodycomp` (StudentBodyCompositionView): ultima medicion BIA/ISAK + tendencia +
 * disclaimer, con switcher de metodo si el alumno tiene datos de AMBOS. Health data (Ley 21.719).
 *
 * MONEY-SAFETY: gate de UI con useEntitlements().hasModule (resuelve los modulos del coach del
 * alumno). Sin modulo => CERO fetch, se muestra ModuleOffNotice (por si llega por deep link).
 * Enterprise (org_id) excluido (espeja getStudentBodyCompositionView B7, Ley 21.719). Lectura por
 * PostgREST directo (E0-B1: RLS bcm_select rama self-select verificada) con verificacion defensiva:
 * error de permiso => render vacio, nunca crash. Las series NUNCA mezclan BIA con ISAK (% grasa de
 * metodos distintos no compara). El fraccionamiento/somatotipo/% grasa salen del jsonb `metrics`
 * persistido (lo calculo @eva/bodycomp server-side; aca solo se lee).
 */

const MODULE_KEY = 'body_composition' as const

const DISCLAIMER =
  'Las mediciones de composición corporal son referenciales y no constituyen un diagnóstico clínico. Consulta a un profesional de la salud ante cualquier duda.'

// Paleta de fraccionamiento Kerr 5C — espeja --viz-1..5 de la web. viz-1 = brand (theme.primary);
// el resto son tokens fijos (ember-500/aqua-500/sport-300/ember-300) que no flipean por marca.
const VIZ_2 = '#FF6A3D' // ember-500 (adiposo)
const VIZ_3 = '#18ABD4' // aqua-500 (oseo)
const VIZ_4 = '#93BEFF' // sport-300 (residual)
const VIZ_5 = '#FFB199' // ember-300 (piel)

// ── Tipos espejo del jsonb `metrics` persistido (no arrastro @eva/schemas/bodycomp server-only). ──
interface MassComp {
  kg: number
  pct: number
}
interface IsakMetricsView {
  fractionation: {
    adipose: MassComp
    muscle: MassComp
    bone: MassComp
    residual: MassComp
    skin: MassComp
    predictedMassKg: number
    measuredWeightKg: number
    massDifferenceKg: number
  }
  somatotype: { endomorphy: number; mesomorphy: number; ectomorphy: number }
  bodyFat: { equation: string; percent: number }
}

// ── Fila DB (columnas explicitas de body_composition_measurements, sin raw_input). ──
interface BcmRow {
  id: string
  method: 'bia' | 'isak'
  measured_at: string
  device_brand: string | null
  device_model: string | null
  is_validated: boolean
  metrics: Record<string, unknown> | null
}
const SELECT =
  'id, method, measured_at, device_brand, device_model, is_validated, metrics'

const MONTHS_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]
/** "05 jun" — Intl es-CL no es fiable en Hermes → formateo manual (mismo criterio que movement). */
function fmtShort(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]}`
}
function deviceLabel(row: BcmRow): string {
  const parts: string[] = []
  if (row.device_brand) parts.push(row.device_brand)
  if (row.device_model) parts.push(row.device_model)
  const device = parts.join(' ')
  const date = fmtShort(row.measured_at)
  return device ? `${device} · ${date}` : date
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
function massComponent(v: unknown): MassComp {
  const o = (v ?? {}) as Record<string, unknown>
  return { kg: num(o.kg), pct: num(o.pct) }
}
/** Lee el jsonb de una fila ISAK. null si la forma no es la esperada (defensa igual que la web). */
function readIsak(row: BcmRow): IsakMetricsView | null {
  if (row.method !== 'isak') return null
  const m = row.metrics
  if (!m || typeof m !== 'object' || !m.fractionation) return null
  const f = m.fractionation as Record<string, unknown>
  const s = (m.somatotype ?? {}) as Record<string, unknown>
  const bf = (m.bodyFat ?? {}) as Record<string, unknown>
  return {
    fractionation: {
      adipose: massComponent(f.adipose),
      muscle: massComponent(f.muscle),
      bone: massComponent(f.bone),
      residual: massComponent(f.residual),
      skin: massComponent(f.skin),
      predictedMassKg: num(f.predictedMassKg),
      measuredWeightKg: num(f.measuredWeightKg),
      massDifferenceKg: num(f.massDifferenceKg),
    },
    somatotype: {
      endomorphy: num(s.endomorphy),
      mesomorphy: num(s.mesomorphy),
      ectomorphy: num(s.ectomorphy),
    },
    bodyFat: {
      equation: typeof bf.equation === 'string' ? bf.equation : 'durnin_womersley',
      percent: num(bf.percent),
    },
  }
}
function readBia(row: BcmRow): BiaMetrics {
  if (row.method !== 'bia') return {}
  return (row.metrics as BiaMetrics) ?? {}
}
/** Delta vs la medicion ANTERIOR (rows viene DESC). null si no hay anterior o falta el valor. */
function deltaVsPrev(
  rowsDesc: BcmRow[],
  index: number,
  pick: (row: BcmRow) => number | null
): number | null {
  const current = pick(rowsDesc[index])
  const prev = rowsDesc[index + 1] ? pick(rowsDesc[index + 1]) : null
  if (current == null || prev == null) return null
  return Math.round((current - prev) * 100) / 100
}

type Method = 'bia' | 'isak'
type LoadState =
  | { kind: 'loading' }
  | { kind: 'perm_error' }
  | { kind: 'ready'; bia: BcmRow[]; isak: BcmRow[] }

export default function StudentBodyCompScreen() {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { ready, hasModule } = useEntitlements()

  const [orgScoped, setOrgScoped] = useState<boolean | null>(null)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  const moduleOn = hasModule(MODULE_KEY)

  // 2R-1: al vivir dentro de (tabs) la pantalla queda montada tras la primera
  // visita; useFocusEffect refresca en cada entrada (== el remount por push que
  // tenia como ruta stack == el server render fresco del web por navegacion).
  // El refetch es silencioso: el estado 'ready' anterior se mantiene en pantalla.
  useFocusEffect(useCallback(() => {
    let alive = true
    if (!ready) return
    ;(async () => {
      const profile = await getClientProfile().catch(() => null)
      if (!alive) return
      const isOrg = profile?.orgId != null
      setOrgScoped(isOrg)
      // Sin modulo o enterprise: CERO fetch de datos de salud del alumno.
      if (!moduleOn || isOrg || !profile) {
        setState({ kind: 'ready', bia: [], isak: [] })
        return
      }
      const { data, error } = await supabase
        .from('body_composition_measurements')
        .select(SELECT)
        .eq('client_id', profile.id)
        .is('deleted_at', null)
        .order('measured_at', { ascending: false })
      if (!alive) return
      if (error) {
        // Verificacion defensiva: error de permiso (RLS) => render vacio, nunca crash.
        setState({ kind: 'perm_error' })
        return
      }
      const rows = ((data ?? []) as unknown as BcmRow[]) ?? []
      setState({
        kind: 'ready',
        bia: rows.filter((r) => r.method === 'bia'),
        isak: rows.filter((r) => r.method === 'isak'),
      })
    })()
    return () => {
      alive = false
    }
  }, [ready, moduleOn]))

  // ── Entitlements aun sin resolver: loader. ──
  if (!ready) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando…" />
      </SafeAreaView>
    )
  }

  // ── Sin modulo (o enterprise): ModuleOffNotice, sin CTA (el alumno no compra). ──
  if (!moduleOn || orgScoped) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <Header onBack={() => router.back()} theme={theme} />
        <View style={styles.offWrap}>
          <ModuleOffNotice moduleKey={MODULE_KEY} cta={null} />
        </View>
      </SafeAreaView>
    )
  }

  const loading = state.kind === 'loading' || orgScoped === null
  const bia = state.kind === 'ready' ? state.bia : []
  const isak = state.kind === 'ready' ? state.isak : []

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <Header onBack={() => router.back()} theme={theme} />
      {loading ? (
        <EvaLoaderScreen subtitle="Cargando tus mediciones…" />
      ) : state.kind === 'perm_error' ? (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }]}
          showsVerticalScrollIndicator={false}
        >
          <Card variant="sunken" padding="lg" style={styles.emptyCard} testID="bodycomp-perm-error">
            <View style={[styles.emptyIcon, { backgroundColor: theme.muted }]}>
              <Gauge size={26} color={theme.mutedForeground} strokeWidth={1.75} />
            </View>
            <Text className="text-muted" style={[styles.emptyText, { fontFamily: FONT.ui }]}>
              No pudimos cargar tus mediciones de composición corporal en este momento.
            </Text>
            <Disclaimer style={{ marginTop: 12 }} />
          </Card>
        </ScrollView>
      ) : (
        <Content bia={bia} isak={isak} />
      )}
    </SafeAreaView>
  )
}

// ── Cuerpo con datos (switcher de metodo + resumen + tendencia + disclaimer). ──
function Content({ bia, isak }: { bia: BcmRow[]; isak: BcmRow[] }) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const hasBia = bia.length > 0
  const hasIsak = isak.length > 0
  const hasBoth = hasBia && hasIsak

  const [method, setMethod] = useState<Method>(hasBia ? 'bia' : 'isak')
  const active: Method = hasBoth ? method : hasBia ? 'bia' : 'isak'

  if (!hasBia && !hasIsak) {
    return (
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }]}
        showsVerticalScrollIndicator={false}
      >
        <Card variant="sunken" padding="lg" style={styles.emptyCard} testID="bodycomp-empty">
          <View style={[styles.emptyIcon, { backgroundColor: theme.muted }]}>
            <Gauge size={26} color={theme.mutedForeground} strokeWidth={1.75} />
          </View>
          <Text className="text-muted" style={[styles.emptyText, { fontFamily: FONT.ui }]}>
            Aún no tienes mediciones de composición corporal registradas.
          </Text>
          <Disclaimer style={{ marginTop: 12 }} />
        </Card>
      </ScrollView>
    )
  }

  const rows = active === 'bia' ? bia : isak

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }]}
      showsVerticalScrollIndicator={false}
      testID="bodycomp-scroll"
    >
      {hasBoth ? (
        <View className="bg-surface-sunken" style={styles.switcher} accessibilityRole="tablist">
          {([
            { key: 'bia' as const, label: 'Bioimpedancia' },
            { key: 'isak' as const, label: 'Antropometría' },
          ]).map((m) => {
            const on = active === m.key
            return (
              <Pressable
                key={m.key}
                testID={`bodycomp-method-${m.key}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setMethod(m.key)}
                className={on ? 'bg-surface-card' : ''}
                style={[styles.switchBtn, on ? styles.switchBtnOn : null]}
              >
                <Text
                  className={on ? 'text-strong' : 'text-muted'}
                  style={[styles.switchTxt, { fontFamily: FONT.uiBold, color: on ? theme.primary : undefined }]}
                >
                  {m.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {active === 'bia' ? <BiaSummary rows={bia} /> : <IsakSummary rows={isak} />}

      {rows.length >= 2 ? (
        <Trend rows={rows} method={active} />
      ) : (
        <Card variant="sunken" padding="md" testID="bodycomp-needtwo">
          <Text className="text-muted" style={[styles.needTwo, { fontFamily: FONT.ui }]}>
            Con dos o más mediciones verás aquí tu evolución.
          </Text>
        </Card>
      )}

      <Disclaimer />
    </ScrollView>
  )
}

// ── Header (back + tile + titulo + intro), espeja el header de la web. ──
function Header({ onBack, theme }: { onBack: () => void; theme: ReturnType<typeof useTheme>['theme'] }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        hitSlop={10}
        testID="bodycomp-back"
        accessibilityRole="button"
        accessibilityLabel="Volver"
        style={styles.backBtn}
      >
        <ArrowLeft size={16} color={theme.mutedForeground} strokeWidth={2.25} />
        <Text className="text-muted" style={[styles.backTxt, { fontFamily: FONT.uiSemibold }]}>
          Volver
        </Text>
      </Pressable>
      <View style={styles.headerRow}>
        <View className="bg-sport-100" style={styles.headerTile}>
          <Scale size={22} color={theme.primary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="text-strong" style={[styles.headerTitle, { fontFamily: FONT.displayBold }]}>
            Tu composición corporal
          </Text>
          <Text className="text-muted" style={[styles.headerIntro, { fontFamily: FONT.ui }]}>
            Tus mediciones de composición corporal y su evolución. Tu coach las usa para ajustar tu
            plan.
          </Text>
        </View>
      </View>
    </View>
  )
}

// ── Resumen BIA: grid de metricas clave con delta vs medicion anterior (semantica correcta). ──
type BiaDef = { key: keyof BiaMetrics; label: string; fmt: (v: number) => string; higherIsBetter?: boolean }
const fmtPct = (v: number) => `${v.toFixed(1)}%`
const fmtKg = (v: number) => `${v.toFixed(1)} kg`
const fmtL = (v: number) => `${v.toFixed(1)} L`
const fmtKcal = (v: number) => `${Math.round(v)} kcal`
const fmtDeg = (v: number) => `${v.toFixed(1)}°`
const fmtNum = (v: number) => `${v.toFixed(1)}`
const BIA_METRICS: BiaDef[] = [
  { key: 'bodyFatPercent', label: '% Grasa', fmt: fmtPct },
  { key: 'skeletalMuscleMassKg', label: 'Masa muscular', fmt: fmtKg, higherIsBetter: true },
  { key: 'fatMassKg', label: 'Masa grasa', fmt: fmtKg },
  { key: 'visceralFatLevel', label: 'Grasa visceral', fmt: fmtNum },
  { key: 'basalMetabolicRateKcal', label: 'Metabolismo basal', fmt: fmtKcal, higherIsBetter: true },
  { key: 'phaseAngleDeg', label: 'Ángulo de fase', fmt: fmtDeg, higherIsBetter: true },
  { key: 'totalBodyWaterL', label: 'Agua corporal', fmt: fmtL },
]

function BiaSummary({ rows }: { rows: BcmRow[] }) {
  const latest = rows[0]
  if (!latest) return null
  const metrics = readBia(latest)
  const present = BIA_METRICS.filter((m) => typeof metrics[m.key] === 'number')

  return (
    <Card padding="md" testID="bodycomp-bia-summary">
      <View style={styles.summaryHead}>
        <Text className="text-muted" style={[styles.summaryTitle, { fontFamily: FONT.uiBold }]}>
          ÚLTIMA MEDICIÓN
        </Text>
        <Text className="text-muted" style={[styles.deviceTxt, { fontFamily: FONT.uiSemibold }]}>
          {deviceLabel(latest)}
        </Text>
      </View>
      <View style={styles.metricGrid}>
        {present.map((m) => {
          const value = metrics[m.key] as number
          const delta = deltaVsPrev(rows, 0, (r) => {
            const v = readBia(r)[m.key]
            return typeof v === 'number' ? v : null
          })
          return (
            <View key={m.key} className="bg-surface-sunken" style={styles.metricTile}>
              <Text className="text-muted" style={[styles.metricLabel, { fontFamily: FONT.uiBold }]}>
                {m.label}
              </Text>
              <Text className="text-strong" style={[styles.metricValue, { fontFamily: FONT.displayBold }]}>
                {m.fmt(value)}
              </Text>
              {delta != null && delta !== 0 ? (
                <DeltaBadge delta={delta} higherIsBetter={m.higherIsBetter} fmt={m.fmt} />
              ) : null}
            </View>
          )
        })}
      </View>
    </Card>
  )
}

function DeltaBadge({
  delta,
  higherIsBetter,
  fmt,
}: {
  delta: number
  higherIsBetter?: boolean
  fmt: (v: number) => string
}) {
  const isImprovement = higherIsBetter ? delta > 0 : delta < 0
  const Icon = delta > 0 ? ArrowUp : ArrowDown
  const color = isImprovement ? '#1FB877' : '#F4365A'
  return (
    <View style={styles.deltaRow}>
      <Icon size={11} color={color} strokeWidth={2.5} />
      <Text style={[styles.deltaTxt, { color, fontFamily: FONT.uiBold }]}>{fmt(Math.abs(delta))}</Text>
    </View>
  )
}

// ── Resumen ISAK: headlines (% grasa + somatotipo) + barra apilada Kerr 5C + validez de masa. ──
const KERR: { key: keyof IsakMetricsView['fractionation']; label: string; color: string }[] = [
  { key: 'muscle', label: 'Muscular', color: '' /* brand, se resuelve con theme.primary */ },
  { key: 'adipose', label: 'Adiposo', color: VIZ_2 },
  { key: 'bone', label: 'Óseo', color: VIZ_3 },
  { key: 'residual', label: 'Residual', color: VIZ_4 },
  { key: 'skin', label: 'Piel', color: VIZ_5 },
]

function IsakSummary({ rows }: { rows: BcmRow[] }) {
  const { theme } = useTheme()
  const latest = rows[0]
  const view = latest ? readIsak(latest) : null
  if (!latest || !view) return null
  const { fractionation: f, somatotype: s, bodyFat } = view
  const comps = KERR.map((c) => ({ ...c, color: c.color || theme.primary, comp: f[c.key] as MassComp }))
  const diffOk = Math.abs(f.massDifferenceKg) <= 3

  return (
    <Card padding="md" testID="bodycomp-isak-summary">
      <View style={styles.summaryHead}>
        <Text className="text-muted" style={[styles.summaryTitle, { fontFamily: FONT.uiBold }]}>
          ÚLTIMA MEDICIÓN
        </Text>
        <View style={styles.isakHeadRight}>
          {!latest.is_validated ? (
            <Badge tone="warning" variant="soft" size="sm">
              Preliminar
            </Badge>
          ) : null}
          <Text className="text-muted" style={[styles.deviceTxt, { fontFamily: FONT.uiSemibold }]}>
            {deviceLabel(latest)}
          </Text>
        </View>
      </View>

      {/* Headlines: % grasa + somatotipo. */}
      <View style={styles.isakHeadlines}>
        <View>
          <Text className="text-strong" style={[styles.headline, { fontFamily: FONT.displayBlack }]}>
            {fmtPct(bodyFat.percent)}
          </Text>
          <Text className="text-muted" style={[styles.headlineLabel, { fontFamily: FONT.uiBold }]}>
            % GRASA
          </Text>
          <Text className="text-subtle" style={[styles.headlineSub, { fontFamily: FONT.uiSemibold }]}>
            {bodyFat.equation}
          </Text>
        </View>
        <View>
          <Text className="text-strong" style={[styles.headline, { fontFamily: FONT.displayBlack }]}>
            {s.endomorphy.toFixed(1)} – {s.mesomorphy.toFixed(1)} – {s.ectomorphy.toFixed(1)}
          </Text>
          <Text className="text-muted" style={[styles.headlineLabel, { fontFamily: FONT.uiBold }]}>
            SOMATOTIPO
          </Text>
          <Text className="text-subtle" style={[styles.headlineSub, { fontFamily: FONT.uiSemibold }]}>
            Endo – Meso – Ecto
          </Text>
        </View>
      </View>

      {/* Barra apilada Kerr 5C. */}
      <View style={{ marginTop: 16 }}>
        <Text className="text-muted" style={[styles.metricLabel, { fontFamily: FONT.uiBold, marginBottom: 6 }]}>
          Composición
        </Text>
        <View className="bg-surface-sunken" style={styles.stackBar}>
          {comps.map((c) => {
            const pct = Math.min(Math.max(c.comp.pct, 0), 100)
            if (pct <= 0) return null
            return <View key={c.key} style={{ width: `${pct}%`, backgroundColor: c.color, height: '100%' }} />
          })}
        </View>
        <View style={styles.legend}>
          {comps.map((c) => (
            <View key={c.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: c.color }]} />
              <Text className="text-muted" style={[styles.legendLabel, { fontFamily: FONT.uiSemibold }]}>
                {c.label}
              </Text>
              <Text className="text-strong" style={[styles.legendPct, { fontFamily: FONT.uiBold }]}>
                {c.comp.pct.toFixed(1)}%
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Validez interna del fraccionamiento (Σ masas vs peso medido). */}
      <Text className="text-muted" style={[styles.massLine, { fontFamily: FONT.ui }]}>
        Σ {fmtKg(f.predictedMassKg)} · {fmtKg(f.measuredWeightKg)} ·{' '}
        <Text style={{ color: diffOk ? '#1FB877' : '#F5A524', fontFamily: FONT.uiBold }}>
          {f.massDifferenceKg > 0 ? '+' : ''}
          {fmtKg(f.massDifferenceKg)}
        </Text>
      </Text>
    </Card>
  )
}

// ── Tendencia: AreaTrend (chart RN existente) con toggle de serie. NUNCA mezcla BIA con ISAK. ──
type SeriesDef = { key: string; label: string; suffix: string; read: (row: BcmRow) => number | null }
const BIA_SERIES: SeriesDef[] = [
  { key: 'fat', label: '% Grasa', suffix: '%', read: (r) => { const v = readBia(r).bodyFatPercent; return typeof v === 'number' ? v : null } },
  { key: 'muscle', label: 'Masa muscular', suffix: ' kg', read: (r) => { const v = readBia(r).skeletalMuscleMassKg; return typeof v === 'number' ? v : null } },
]
const ISAK_SERIES: SeriesDef[] = [
  { key: 'fat', label: '% Grasa', suffix: '%', read: (r) => readIsak(r)?.bodyFat.percent ?? null },
  { key: 'muscle', label: 'Masa muscular', suffix: ' kg', read: (r) => readIsak(r)?.fractionation.muscle.kg ?? null },
  { key: 'adipose', label: 'Masa adiposa', suffix: ' kg', read: (r) => readIsak(r)?.fractionation.adipose.kg ?? null },
]

function Trend({ rows, method }: { rows: BcmRow[]; method: Method }) {
  const { theme } = useTheme()
  const seriesList = method === 'bia' ? BIA_SERIES : ISAK_SERIES
  const [activeKey, setActiveKey] = useState(seriesList[0].key)
  const series = seriesList.find((s) => s.key === activeKey) ?? seriesList[0]

  // rows viene DESC (mas reciente primero) → invertir para el eje temporal ascendente.
  const points = useMemo<AreaPoint[]>(() => {
    const asc = [...rows].reverse()
    const pts: AreaPoint[] = []
    for (const r of asc) {
      const y = series.read(r)
      if (y != null) pts.push({ i: pts.length, y, label: fmtShort(r.measured_at) })
    }
    return pts
  }, [rows, series])

  return (
    <Card padding="md" testID="bodycomp-trend">
      <View style={styles.trendHead}>
        <Text className="text-muted" style={[styles.summaryTitle, { fontFamily: FONT.uiBold }]}>
          EVOLUCIÓN
        </Text>
        <View style={styles.pillRow}>
          {seriesList.map((s) => {
            const on = s.key === activeKey
            return (
              <Pressable
                key={s.key}
                testID={`bodycomp-series-${s.key}`}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setActiveKey(s.key)}
                className={on ? '' : 'bg-surface-sunken'}
                style={[styles.pill, on ? { backgroundColor: theme.primary } : null]}
              >
                <Text
                  className={on ? '' : 'text-muted'}
                  style={[styles.pillTxt, { fontFamily: FONT.uiBold, color: on ? '#fff' : undefined }]}
                >
                  {s.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>
      {points.length >= 2 ? (
        <AreaTrend points={points} suffix={series.suffix} decimals={1} height={200} />
      ) : (
        <Text className="text-muted" style={[styles.needTwo, { fontFamily: FONT.ui, paddingVertical: 24 }]}>
          Sin datos suficientes para esta serie.
        </Text>
      )}
    </Card>
  )
}

function Disclaimer({ style }: { style?: object }) {
  const { theme } = useTheme()
  return (
    <View className="bg-surface-sunken" style={[styles.disclaimer, style]} testID="bodycomp-disclaimer">
      <Info size={14} color={theme.mutedForeground} strokeWidth={2} style={{ marginTop: 1 }} />
      <Text className="text-muted" style={[styles.disclaimerTxt, { fontFamily: FONT.ui }]}>
        {DISCLAIMER}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // paddingBottom vive en el contentContainer inline: insets.bottom +
  // ALUMNO_TABBAR_CLEARANCE reserva el espacio de la capsula flotante (== el
  // padding-bottom --mobile-content-bottom-offset del <main> web, layout.tsx:360).
  scroll: { paddingHorizontal: 20, gap: 16 },
  offWrap: { flex: 1 },
  // Header
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 10 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 32 },
  backTxt: { fontSize: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerTile: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle: { fontSize: 24, letterSpacing: -0.5 },
  headerIntro: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  // Switcher
  switcher: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 12 },
  switchBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  switchBtnOn: {
    shadowColor: '#0D121C', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  switchTxt: { fontSize: 14 },
  // Summary shared
  summaryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  summaryTitle: { fontSize: 12, letterSpacing: 1 },
  deviceTxt: { fontSize: 11 },
  // BIA grid
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricTile: { flexGrow: 1, flexBasis: '30%', minWidth: 96, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  metricLabel: { fontSize: 9.5, letterSpacing: 0.6, textTransform: 'uppercase' },
  metricValue: { fontSize: 17, marginTop: 3, letterSpacing: -0.3 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3 },
  deltaTxt: { fontSize: 10 },
  // ISAK
  isakHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  isakHeadlines: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 12 },
  headline: { fontSize: 26, letterSpacing: -0.8 },
  headlineLabel: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 6 },
  headlineSub: { fontSize: 9.5, marginTop: 1 },
  stackBar: { flexDirection: 'row', height: 16, borderRadius: 999, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 5, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flexGrow: 1, flexBasis: '42%' },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { fontSize: 11 },
  legendPct: { fontSize: 11, marginLeft: 'auto' },
  massLine: { fontSize: 10.5, marginTop: 12 },
  // Trend
  trendHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { minHeight: 34, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 999 },
  pillTxt: { fontSize: 11.5 },
  // Disclaimer / empty
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  disclaimerTxt: { flex: 1, fontSize: 11, lineHeight: 17 },
  emptyCard: { alignItems: 'center', gap: 4 },
  emptyIcon: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 300 },
  needTwo: { fontSize: 12, textAlign: 'center' },
})
