import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  Info,
  Minus,
  PersonStanding,
  Scale,
  Zap,
} from 'lucide-react-native'
import { MOVEMENT_PATTERNS_V1, type MovementPatternSlug, type PriorityBand } from '@eva/calc'
import { useTheme } from '../../context/ThemeContext'
import { FONT } from '../../lib/typography'
import type { FinalAssessmentRow, MovementItemRow } from '../../lib/movement-coach'
import { Badge } from '../Badge'

/**
 * Piezas compartidas del modulo Evaluacion de movimiento (E6-04): labels es-neutro (copy verbatim
 * del dict web assessment.*), semaforo por banda, header con tile de marca, PriorityBadge, tarjeta
 * de reporte (hero + 7 patrones + notas) y evolucion (barras del compuesto + comparativa por
 * patron). Reutilizadas por el hub (`/coach/movement`) y el detalle (`/coach/movement/[clientId]`).
 * Espeja 1:1 la vista del alumno (app/alumno/(tabs)/movement.tsx) y los componentes web
 * AssessmentReportCard/EvolutionCharts/PriorityBadge — scoring/orden de patrones desde @eva/calc
 * (fuente unica, sin drift).
 */

// Copy verbatim del dict web (es.json assessment.*) — mobile es español hardcodeado.
export const PATTERN_LABEL: Record<MovementPatternSlug, string> = {
  deep_squat: 'Sentadilla profunda',
  hurdle_step: 'Paso de valla',
  inline_lunge: 'Estocada en línea',
  shoulder_mobility: 'Movilidad de hombro',
  active_straight_leg_raise: 'Elevación activa de pierna recta',
  trunk_stability_pushup: 'Estabilidad de tronco en empuje',
  rotary_stability: 'Estabilidad rotatoria',
}
export const BAND_LABEL: Record<PriorityBand, string> = {
  high: 'Prioridad alta',
  moderate: 'Prioridad media',
  low: 'Prioridad baja',
}
/** Semaforo por banda (tokens -500 constantes light/dark, mismos cortes que la web bandColor). */
export const BAND_COLOR: Record<PriorityBand, string> = {
  high: '#F4365A',
  moderate: '#F5A524',
  low: '#1FB877',
}
export const DISCLAIMER =
  'Tamizaje de priorización de trabajo correctivo; no es diagnóstico ni predice lesiones; no sustituye evaluación clínica.'

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** dd de <mes> de yyyy (Intl es-CL no es fiable en Hermes → formateo manual). */
export function fmtLong(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`
}
export function fmtShort(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]}`
}
export function bandColorFor(composite: number | null): string {
  if (composite == null) return '#646F7D'
  if (composite >= 17) return BAND_COLOR.low
  if (composite >= 14) return BAND_COLOR.moderate
  return BAND_COLOR.high
}

/* ── Header del modulo: back + tile de marca (PersonStanding) + titulo + badge "Modulo". ── */
export function MovementHeader({
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
        testID="movement-back"
        onPress={onBack}
        activeOpacity={0.8}
        style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
      >
        <ChevronLeft size={20} color={theme.foreground} />
      </TouchableOpacity>
      <View className="bg-sport-100" style={styles.iconTile}>
        <PersonStanding size={18} color={theme.primary} />
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

/** Pastilla de banda (dot + label) — semaforo del hub y del historial. */
export function PriorityBadge({ band }: { band: PriorityBand }) {
  const { theme } = useTheme()
  return (
    <View style={[styles.priorityPill, { backgroundColor: theme.secondary }]}>
      <View style={[styles.priorityDot, { backgroundColor: BAND_COLOR[band] }]} />
      <Text style={[styles.priorityTxt, { color: theme.foreground, fontFamily: FONT.uiBold }]}>
        {BAND_LABEL[band]}
      </Text>
    </View>
  )
}

/* ── Reporte de UNA evaluacion final: hero + patrones + notas. ── */
export function MovementReportCard({ assessment }: { assessment: FinalAssessmentRow }) {
  const ordered = MOVEMENT_PATTERNS_V1.map((def) =>
    assessment.items.find((i) => i.pattern === def.slug),
  ).filter((i): i is MovementItemRow => i != null)

  return (
    <View style={{ gap: 16 }} testID="movement-report">
      {/* Semaforo + compuesto (hero oscuro). */}
      <View className="bg-surface-inverse border border-inverse rounded-card" style={styles.hero}>
        <View style={styles.heroRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {assessment.risk_band ? (
              <View style={styles.bandPill}>
                <View style={[styles.bandDot, { backgroundColor: BAND_COLOR[assessment.risk_band] }]} />
                <Text className="text-on-dark" style={[styles.bandTxt, { fontFamily: FONT.uiBold }]}>
                  {BAND_LABEL[assessment.risk_band]}
                </Text>
              </View>
            ) : null}
            <View style={styles.compositeRow}>
              <Text className="text-on-dark" style={[styles.compositeNum, { fontFamily: FONT.displayBlack }]}>
                {assessment.composite_score ?? '—'}
              </Text>
              <Text className="text-on-dark-muted" style={[styles.compositeMax, { fontFamily: FONT.uiSemibold }]}>
                /21
              </Text>
            </View>
            <Text className="text-on-dark-muted" style={[styles.assessedAt, { fontFamily: FONT.ui }]}>
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
      </View>

      {/* 7 patrones — filas con lado debil resaltado + cuadro de puntaje final. */}
      <View>
        <Text className="text-strong" style={[styles.sectionTitle, { fontFamily: FONT.displayBold }]}>
          Patrones
        </Text>
        <View className="bg-surface-card border border-subtle rounded-card" style={{ overflow: 'hidden' }}>
          {ordered.map((item, i) => (
            <ItemRow key={item.id} item={item} index={i} />
          ))}
        </View>
      </View>

      {assessment.notes ? (
        <View className="bg-surface-card border border-subtle rounded-card" style={{ padding: 16 }}>
          <Text className="text-muted" style={[styles.notesLabel, { fontFamily: FONT.uiBold }]}>
            NOTAS
          </Text>
          <Text className="text-body" style={[styles.notesBody, { fontFamily: FONT.ui }]}>
            {assessment.notes}
          </Text>
        </View>
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

function ItemRow({ item, index }: { item: MovementItemRow; index: number }) {
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

/* ── Evolucion (>= 2 finales): barras del compuesto + comparativa primera vs ultima. ── */
function patternFinal(a: FinalAssessmentRow, slug: MovementPatternSlug): number {
  return a.items.find((i) => i.pattern === slug)?.final_score ?? 0
}

export function MovementEvolution({ finals }: { finals: FinalAssessmentRow[] }) {
  if (finals.length < 2) return null
  const first = finals[0]
  const last = finals[finals.length - 1]
  return (
    <View testID="movement-evolution">
      <Text className="text-strong" style={[styles.sectionTitle, { fontFamily: FONT.displayBold }]}>
        Evolución
      </Text>
      <View className="bg-surface-card border border-subtle rounded-card" style={{ padding: 16 }}>
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
      </View>
    </View>
  )
}

/** Disclaimer AC5 — SIEMPRE visible en cualquier vista del reporte. */
export function MovementDisclaimerNote({ style }: { style?: object }) {
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
  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  iconTile: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  hTitle: { fontSize: 19, letterSpacing: -0.4 },
  hSub: { fontSize: 12.5, marginTop: 1 },
  // Priority pill
  priorityPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  priorityTxt: { fontSize: 11.5 },
  // Hero
  hero: { padding: 20 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bandPill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
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
})
