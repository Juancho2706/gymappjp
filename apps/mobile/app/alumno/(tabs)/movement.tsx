import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Info,
  Minus,
  PersonStanding,
  Scale,
  Zap,
} from 'lucide-react-native'
import { MOVEMENT_PATTERNS_V1, type MovementPatternSlug, type PriorityBand } from '@eva/calc'
import { useTheme } from '../../../context/ThemeContext'
import { useEntitlements } from '../../../lib/entitlements'
import { getClientProfile } from '../../../lib/client'
import { supabase } from '../../../lib/supabase'
import { Card } from '../../../components/Card'
import { Badge } from '../../../components/Badge'
import { ModuleOffNotice } from '../../../components/ModuleOffNotice'
import { AppBackground } from '../../../components/AppBackground'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { ALUMNO_TABBAR_CLEARANCE } from '../../../components/alumno/AlumnoMobileChrome'
import { FONT } from '../../../lib/typography'

/**
 * Vista MOVIMIENTO del ALUMNO (read-only) — E6-08. Port RN de la web
 * `c/[coach_slug]/movimiento` (StudentMovementView): ultimo reporte final + evolucion +
 * disclaimer. Solo evaluaciones FINALES (RLS self-select es el techo).
 *
 * MONEY-SAFETY: gate de UI con useEntitlements().hasModule (resuelve los modulos del coach
 * del alumno). Sin modulo => CERO fetch, se muestra ModuleOffNotice (por si llega por deep
 * link). Enterprise (org_id) excluido (espeja el rechazo de getStudentMovementView, Ley 21.719).
 * Lectura por PostgREST directo (E0-B1: RLS client_self_select verificada) con verificacion
 * defensiva: si la query devuelve error de permiso, render vacio, nunca crash.
 * El scoring/orden de patrones sale de @eva/calc (fuente unica, sin drift).
 */

const MODULE_KEY = 'movement_assessment' as const

// Copy verbatim de la web (i18n es.json assessment.*) — mobile es español hardcodeado.
const PATTERN_LABEL: Record<MovementPatternSlug, string> = {
  deep_squat: 'Sentadilla profunda',
  hurdle_step: 'Paso de valla',
  inline_lunge: 'Estocada en línea',
  shoulder_mobility: 'Movilidad de hombro',
  active_straight_leg_raise: 'Elevación activa de pierna recta',
  trunk_stability_pushup: 'Estabilidad de tronco en empuje',
  rotary_stability: 'Estabilidad rotatoria',
}
const BAND_LABEL: Record<PriorityBand, string> = {
  high: 'Prioridad alta',
  moderate: 'Prioridad media',
  low: 'Prioridad baja',
}
// Semaforo por banda (tokens -500 constantes light/dark, mismos cortes que la web bandColor).
const BAND_COLOR: Record<PriorityBand, string> = {
  high: '#F4365A',
  moderate: '#F5A524',
  low: '#1FB877',
}
const DISCLAIMER =
  'Tamizaje de priorización de trabajo correctivo; no es diagnóstico ni predice lesiones; no sustituye evaluación clínica.'

// ── Tipos espejo de la fila DB (movement_assessments + items). ──
interface AssessmentItem {
  id: string
  pattern: MovementPatternSlug
  is_per_side: boolean
  score_left: number | null
  score_right: number | null
  score_single: number | null
  final_score: number
  pain: boolean
  clearing_positive: boolean | null
  comment: string | null
}
interface FinalAssessment {
  id: string
  assessed_at: string
  composite_score: number | null
  risk_band: PriorityBand | null
  has_pain: boolean
  has_asymmetry: boolean
  notes: string | null
  items: AssessmentItem[]
}

const ITEM_COLS =
  'id, pattern, is_per_side, score_left, score_right, score_single, final_score, pain, clearing_positive, comment'
const SELECT = `id, assessed_at, composite_score, risk_band, has_pain, has_asymmetry, notes, movement_assessment_items ( ${ITEM_COLS} )`

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const MONTHS_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]
/** dd de <mes> de yyyy (Intl es-CL no es fiable en Hermes → formateo manual). */
function fmtLong(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`
}
function fmtShort(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]}`
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'perm_error' }
  | { kind: 'ready'; finals: FinalAssessment[] }

export default function StudentMovementScreen() {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { ready, hasModule } = useEntitlements()

  const [orgScoped, setOrgScoped] = useState<boolean | null>(null)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  const moduleOn = hasModule(MODULE_KEY)

  // Cargar el perfil (para org_id) y — solo si el modulo esta ON y NO es enterprise —
  // las evaluaciones finales. Sin modulo: CERO fetch de datos del alumno.
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
      if (!moduleOn || isOrg || !profile) {
        setState({ kind: 'ready', finals: [] })
        return
      }
      const { data, error } = await supabase
        .from('movement_assessments')
        .select(SELECT)
        .eq('client_id', profile.id)
        .eq('status', 'final')
        .order('assessed_at', { ascending: true })
      if (!alive) return
      if (error) {
        // Verificacion defensiva: error de permiso (RLS) => render vacio, nunca crash.
        setState({ kind: 'perm_error' })
        return
      }
      const finals: FinalAssessment[] = ((data ?? []) as unknown as any[]).map((row) => ({
        id: row.id,
        assessed_at: row.assessed_at,
        composite_score: row.composite_score,
        risk_band: row.risk_band,
        has_pain: row.has_pain === true,
        has_asymmetry: row.has_asymmetry === true,
        notes: row.notes,
        items: (row.movement_assessment_items ?? []) as AssessmentItem[],
      }))
      setState({ kind: 'ready', finals })
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
  const latest =
    state.kind === 'ready' && state.finals.length > 0 ? state.finals[state.finals.length - 1] : null
  const finals = state.kind === 'ready' ? state.finals : []

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <Header onBack={() => router.back()} theme={theme} />
      {loading ? (
        <EvaLoaderScreen subtitle="Cargando tu screening…" />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }]}
          testID="movement-scroll"
        >
          {state.kind === 'perm_error' ? (
            <Card variant="sunken" padding="lg" style={styles.emptyCard} testID="movement-perm-error">
              <View style={[styles.emptyIcon, { backgroundColor: theme.muted }]}>
                <PersonStanding size={26} color={theme.mutedForeground} strokeWidth={1.75} />
              </View>
              <Text className="text-muted" style={[styles.emptyText, { fontFamily: FONT.ui }]}>
                No pudimos cargar tu screening de movimiento en este momento.
              </Text>
              <Disclaimer style={{ marginTop: 12 }} />
            </Card>
          ) : latest ? (
            <>
              <ReportCard assessment={latest} />
              {finals.length >= 2 ? (
                <EvolutionCharts finals={finals} />
              ) : (
                <Card variant="sunken" padding="md" testID="movement-evolution-needtwo">
                  <Text className="text-muted" style={[styles.needTwo, { fontFamily: FONT.ui }]}>
                    Con dos o más evaluaciones finales verás aquí la evolución.
                  </Text>
                </Card>
              )}
              <Disclaimer />
            </>
          ) : (
            <Card variant="sunken" padding="lg" style={styles.emptyCard} testID="movement-empty">
              <View style={[styles.emptyIcon, { backgroundColor: theme.muted }]}>
                <PersonStanding size={26} color={theme.mutedForeground} strokeWidth={1.75} />
              </View>
              <Text className="text-muted" style={[styles.emptyText, { fontFamily: FONT.ui }]}>
                Aún no tienes evaluaciones de movimiento finalizadas.
              </Text>
              <Disclaimer style={{ marginTop: 12 }} />
            </Card>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

// ── Header (back + tile + titulo + intro), espeja el header de la web. ──
function Header({ onBack, theme }: { onBack: () => void; theme: ReturnType<typeof useTheme>['theme'] }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        hitSlop={10}
        testID="movement-back"
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
          <PersonStanding size={22} color={theme.primary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="text-strong" style={[styles.headerTitle, { fontFamily: FONT.displayBold }]}>
            Tu screening de movimiento
          </Text>
          <Text className="text-muted" style={[styles.headerIntro, { fontFamily: FONT.ui }]}>
            Resultado de tu evaluación de movimiento de ingreso y su evolución. Tu equipo lo usa para
            priorizar tu trabajo correctivo.
          </Text>
        </View>
      </View>
    </View>
  )
}

// ── Reporte de la ultima evaluacion final: hero + patrones + notas. ──
function ReportCard({ assessment }: { assessment: FinalAssessment }) {
  const ordered = MOVEMENT_PATTERNS_V1.map((def) =>
    assessment.items.find((i) => i.pattern === def.slug)
  ).filter((i): i is AssessmentItem => i != null)

  return (
    <View style={{ gap: 16 }} testID="movement-report">
      {/* Semaforo + compuesto (hero oscuro). */}
      <Card variant="inverse" padding="lg">
        <View style={styles.heroRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {assessment.risk_band ? (
              <View style={styles.bandPill}>
                <View
                  style={[styles.bandDot, { backgroundColor: BAND_COLOR[assessment.risk_band] }]}
                />
                <Text className="text-on-dark" style={[styles.bandTxt, { fontFamily: FONT.uiBold }]}>
                  {BAND_LABEL[assessment.risk_band]}
                </Text>
              </View>
            ) : null}
            <View style={styles.compositeRow}>
              <Text
                className="text-on-dark"
                style={[styles.compositeNum, { fontFamily: FONT.displayBlack }]}
              >
                {assessment.composite_score ?? '—'}
              </Text>
              <Text
                className="text-on-dark-muted"
                style={[styles.compositeMax, { fontFamily: FONT.uiSemibold }]}
              >
                /21
              </Text>
            </View>
            <Text
              className="text-on-dark-muted"
              style={[styles.assessedAt, { fontFamily: FONT.ui }]}
            >
              Evaluado el {fmtLong(assessment.assessed_at)}
            </Text>
          </View>
          <View style={styles.flagsCol}>
            {assessment.has_pain ? (
              <Badge tone="danger" variant="solid" size="sm" icon={<Zap size={12} color="#fff" />}>
                Dolor
              </Badge>
            ) : null}
            {assessment.has_asymmetry ? (
              <Badge tone="warning" variant="solid" size="sm" icon={<Scale size={12} color="#fff" />}>
                Asimetría
              </Badge>
            ) : null}
          </View>
        </View>
      </Card>

      {/* 7 patrones — filas con lado debil resaltado + cuadro de puntaje final. */}
      <View>
        <Text className="text-strong" style={[styles.sectionTitle, { fontFamily: FONT.displayBold }]}>
          Patrones
        </Text>
        <Card padding="none" style={{ overflow: 'hidden' }}>
          {ordered.map((item, i) => (
            <ItemRow key={item.id} item={item} index={i} />
          ))}
        </Card>
      </View>

      {assessment.notes ? (
        <Card padding="md">
          <Text className="text-muted" style={[styles.notesLabel, { fontFamily: FONT.uiBold }]}>
            NOTAS
          </Text>
          <Text className="text-body" style={[styles.notesBody, { fontFamily: FONT.ui }]}>
            {assessment.notes}
          </Text>
        </Card>
      ) : null}
    </View>
  )
}

function scoreSquare(score: number): { bg: string; fg: string } {
  if (score <= 0) return { bg: 'bg-danger-100', fg: 'text-danger-600' }
  if (score === 1) return { bg: 'bg-warning-100', fg: 'text-warning-700' }
  return { bg: 'bg-surface-sunken', fg: 'text-strong' }
}

function SideCell({ label, value, weak }: { label: string; value: number | null; weak: boolean }) {
  return (
    <View style={styles.sideCell}>
      <Text className="text-subtle" style={[styles.sideLabel, { fontFamily: FONT.uiBold }]}>
        {label}
      </Text>
      <Text
        className={weak ? 'text-danger-600' : 'text-body'}
        style={[styles.sideValue, { fontFamily: FONT.monoBold }]}
      >
        {value != null ? value : '—'}
      </Text>
    </View>
  )
}

function ItemRow({ item, index }: { item: AssessmentItem; index: number }) {
  const { theme } = useTheme()
  const perSide = item.is_per_side && item.score_left != null && item.score_right != null
  const weakLeft = perSide && (item.score_left as number) < (item.score_right as number)
  const weakRight = perSide && (item.score_right as number) < (item.score_left as number)
  const sq = scoreSquare(item.final_score)

  return (
    <View>
      {index > 0 ? (
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginHorizontal: 14 }} />
      ) : null}
      <View style={styles.itemRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="text-strong" style={[styles.itemName, { fontFamily: FONT.uiSemibold }]}>
            {PATTERN_LABEL[item.pattern]}
          </Text>
          {item.comment ? (
            <Text className="text-muted" style={[styles.itemComment, { fontFamily: FONT.ui }]}>
              {item.comment}
            </Text>
          ) : null}
          {item.pain || item.clearing_positive === true ? (
            <View style={styles.flagRow}>
              {item.pain ? (
                <View style={styles.flagInline}>
                  <AlertTriangle size={12} color={BAND_COLOR.high} strokeWidth={2.25} />
                  <Text className="text-danger-600" style={[styles.flagTxt, { fontFamily: FONT.uiBold }]}>
                    Dolor
                  </Text>
                </View>
              ) : null}
              {item.clearing_positive === true ? (
                <Text className="text-warning-700" style={[styles.flagTxt, { fontFamily: FONT.uiBold }]}>
                  ● Descarte+
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        {item.is_per_side ? (
          <View style={styles.sidesWrap}>
            <SideCell label="I" value={item.score_left} weak={weakLeft} />
            <SideCell label="D" value={item.score_right} weak={weakRight} />
          </View>
        ) : (
          <View style={styles.sidesWrap}>
            <SideCell label="Ú" value={item.score_single} weak={false} />
          </View>
        )}
        <View className={sq.bg} style={styles.scoreSquare}>
          <Text className={sq.fg} style={[styles.scoreSquareTxt, { fontFamily: FONT.displayBlack }]}>
            {item.final_score}
          </Text>
        </View>
      </View>
    </View>
  )
}

// ── Evolucion (>= 2 finales): barras del compuesto + comparativa primera vs ultima. ──
function bandColorFor(composite: number | null): string {
  if (composite == null) return '#646F7D'
  if (composite >= 17) return BAND_COLOR.low
  if (composite >= 14) return BAND_COLOR.moderate
  return BAND_COLOR.high
}
function patternFinal(a: FinalAssessment, slug: MovementPatternSlug): number {
  return a.items.find((i) => i.pattern === slug)?.final_score ?? 0
}

function EvolutionCharts({ finals }: { finals: FinalAssessment[] }) {
  const first = finals[0]
  const last = finals[finals.length - 1]
  return (
    <View testID="movement-evolution">
      <Text className="text-strong" style={[styles.sectionTitle, { fontFamily: FONT.displayBold }]}>
        Evolución
      </Text>
      <Card padding="md">
        {/* Barras del compuesto por evaluacion. */}
        <View style={styles.barsRow}>
          {finals.map((f, i) => {
            const composite = f.composite_score ?? 0
            const h = Math.round((composite / 21) * 64) + 8
            const isLast = i === finals.length - 1
            return (
              <View key={f.id} style={styles.barCol}>
                <Text className="text-strong" style={[styles.barValue, { fontFamily: FONT.monoBold }]}>
                  {composite}
                </Text>
                <View
                  style={[
                    styles.bar,
                    { height: h, backgroundColor: bandColorFor(f.composite_score), opacity: isLast ? 1 : 0.4 },
                  ]}
                />
                <Text className="text-muted" style={[styles.barDate, { fontFamily: FONT.ui }]}>
                  {fmtShort(f.assessed_at)}
                </Text>
              </View>
            )
          })}
          <View style={{ flex: 2 }} />
        </View>

        {/* Comparativa por patron: primera vs ultima. */}
        <View style={styles.compareWrap}>
          {MOVEMENT_PATTERNS_V1.map((def) => {
            const a = patternFinal(first, def.slug)
            const b = patternFinal(last, def.slug)
            const Arrow = b > a ? ArrowUpRight : b < a ? ArrowDownRight : Minus
            const arrowColor = b > a ? BAND_COLOR.low : b < a ? BAND_COLOR.high : '#646F7D'
            return (
              <View key={def.slug} style={styles.compareRow}>
                <Text className="text-body" style={[styles.compareName, { fontFamily: FONT.ui }]}>
                  {PATTERN_LABEL[def.slug]}
                </Text>
                <View style={styles.compareVals}>
                  <Text className="text-subtle" style={[styles.compareA, { fontFamily: FONT.mono }]}>
                    {a}
                  </Text>
                  <Arrow size={14} color={arrowColor} strokeWidth={2.25} />
                  <Text className="text-strong" style={[styles.compareB, { fontFamily: FONT.monoBold }]}>
                    {b}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      </Card>
    </View>
  )
}

function Disclaimer({ style }: { style?: object }) {
  const { theme } = useTheme()
  return (
    <View className="bg-surface-sunken" style={[styles.disclaimer, style]} testID="movement-disclaimer">
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
  scroll: { paddingHorizontal: 20, gap: 20 },
  offWrap: { flex: 1 },
  // Header
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 10 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 32 },
  backTxt: { fontSize: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerTile: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle: { fontSize: 24, letterSpacing: -0.5 },
  headerIntro: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  // Hero
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bandPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
  },
  bandDot: { width: 10, height: 10, borderRadius: 5 },
  bandTxt: { fontSize: 12 },
  compositeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 12 },
  compositeNum: { fontSize: 46, letterSpacing: -1.3 },
  compositeMax: { fontSize: 16 },
  assessedAt: { fontSize: 12, marginTop: 6 },
  flagsCol: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  // Sections
  sectionTitle: { fontSize: 17, letterSpacing: -0.3, marginBottom: 10 },
  // Item row
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  itemName: { fontSize: 14 },
  itemComment: { fontSize: 12, marginTop: 2 },
  flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 3 },
  flagInline: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  flagTxt: { fontSize: 10 },
  sidesWrap: { flexDirection: 'row', gap: 6 },
  sideCell: { width: 32, alignItems: 'center' },
  sideLabel: { fontSize: 9, textTransform: 'uppercase' },
  sideValue: { fontSize: 15, marginTop: 1 },
  scoreSquare: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  scoreSquareTxt: { fontSize: 14 },
  // Notes
  notesLabel: { fontSize: 11, letterSpacing: 0.8 },
  notesBody: { fontSize: 14, lineHeight: 21, marginTop: 6 },
  // Evolution
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 14 },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  barValue: { fontSize: 12 },
  bar: { width: '100%', maxWidth: 54, borderRadius: 8 },
  barDate: { fontSize: 10.5 },
  compareWrap: { gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.25)', paddingTop: 12 },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compareName: { flex: 1, fontSize: 12 },
  compareVals: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compareA: { fontSize: 12 },
  compareB: { fontSize: 13 },
  // Disclaimer
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  disclaimerTxt: { flex: 1, fontSize: 11, lineHeight: 17 },
  // Empty / error
  emptyCard: { alignItems: 'center', gap: 4 },
  emptyIcon: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 300 },
  needTwo: { fontSize: 12, textAlign: 'center' },
})
