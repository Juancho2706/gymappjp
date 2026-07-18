import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { Image } from 'expo-image'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Path } from 'react-native-svg'
import { useFocusEffect, useRouter } from 'expo-router'
import { ArrowDown, ArrowRightLeft, ArrowUp, Images, Pencil, Ruler, Scale, Target, Trash2 } from 'lucide-react-native'
import type { BiaMetrics } from '@eva/bodycomp'
import { useTheme } from '../../../context/ThemeContext'
import { Button, Input, Sheet, SegmentedTabs } from '../../../components'
import { Select } from '../../../components/Select'
import { AreaTrend, type AreaPoint } from '../charts/AreaTrend'
import { StatCard, MetricBox, Pill, cd } from './shared'
import {
  linearRegressionKgPerDay,
  projectedWeightRangeKg,
  bmiFromMetric,
  bmiCategory,
} from '../../../lib/profile-analytics'
import { updateCoachClient, type CoachClientDetailData, type CheckInEntry } from '../../../lib/coach-client-detail'
import { getSantiagoIsoYmdForUtcInstant, getTodayInSantiago, isoDateAddDays, parseDbDate } from '../../../lib/date-utils'
import { FONT } from '../../../lib/typography'
import { resolveSportRamp } from '../../../lib/theme'
import {
  deleteScopedMeasurement,
  listScopedMeasurements,
  readIsakView,
  type BodyCompMethod,
  type BodyCompRow,
  type IsakView,
} from '../../../lib/bodycomp-coach'
import { InfoTooltip } from '../../../components/InfoTooltip'
import type { ClientActionWorkspace } from '../../../lib/client-actions'

const BMI_MIN = 16
const BMI_MAX = 36

function formatDate(iso: string): string {
  const source = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00Z` : iso
  const date = new Date(source)
  if (!Number.isFinite(date.getTime())) return '—'
  return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Santiago' })
}

function formatBodyCompDate(iso: string): string {
  const date = parseDbDate(iso)
  if (!date) return '—'
  return date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'America/Santiago' })
}

function SectionHeading({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text className="text-strong" style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
  )
}

function checkInTimestamp(checkIn: CheckInEntry): number {
  return parseDbDate(checkIn.created_at ?? checkIn.date)?.getTime() ?? 0
}

function checkInSantiagoDay(checkIn: CheckInEntry): string {
  return checkIn.created_at ? getSantiagoIsoYmdForUtcInstant(checkIn.created_at) : checkIn.date.slice(0, 10)
}

type CheckInDetailState = { checkIn: CheckInEntry; photoIndex: number }

function EnergyGauge({ value, color }: { value: number; color: string }) {
  const { theme } = useTheme()
  const radius = 34
  const circumference = Math.PI * radius
  const pct = Math.max(0, Math.min(1, value / 10))
  return (
    <Svg accessible accessibilityRole="image" width={100} height={58} viewBox="0 0 80 46" accessibilityLabel={`Energía ${value.toFixed(1)} de 10`}>
      <Path d="M 6 40 A 34 34 0 0 1 74 40" fill="none" stroke={theme.secondary} strokeWidth={8} strokeLinecap="round" />
      <Path
        d="M 6 40 A 34 34 0 0 1 74 40"
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={[circumference, circumference]}
        strokeDashoffset={circumference * (1 - pct)}
      />
    </Svg>
  )
}

export function ProgresoTab({
  data,
  onOpenPhoto,
  reload,
  bodyCompEnabled,
  bodyCompReady,
  bodyCompInlineAllowed,
  workspace,
}: {
  data: CoachClientDetailData
  onOpenPhoto: (photos: string[], index: number) => void
  reload: () => void
  bodyCompEnabled: boolean
  bodyCompReady: boolean
  bodyCompInlineAllowed: boolean
  workspace: ClientActionWorkspace
}) {
  const { theme } = useTheme()
  const hasBodyComp = bodyCompEnabled
  const { client, checkIns } = data
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [checkInDetail, setCheckInDetail] = useState<CheckInDetailState | null>(null)

  const series = useMemo(
    () => [...checkIns]
      .filter((c) => c.weight != null && Number(c.weight) > 0)
      .sort((a, b) => checkInTimestamp(a) - checkInTimestamp(b)),
    [checkIns]
  )
  const points: AreaPoint[] = useMemo(
    () => series.map((c, i) => ({ i, y: Number(c.weight), label: formatDate(c.created_at ?? c.date) })),
    [series]
  )

  const initial = series.length ? Number(series[0]!.weight) : null
  const actual = series.length ? Number(series[series.length - 1]!.weight) : null
  const cambio = initial != null && actual != null ? Math.round((actual - initial) * 10) / 10 : null
  const slopePerDay = useMemo(() => linearRegressionKgPerDay(checkIns.map((c) => ({ created_at: c.created_at ?? c.date, weight: c.weight }))), [checkIns])
  const ritmo30 = Math.round(slopePerDay * 30 * 10) / 10
  const projected4wRange = projectedWeightRangeKg(actual, slopePerDay, 4, 7)

  // Delta anclado al ultimo peso (como web), usando claves calendario de Santiago.
  const lastWeightDay = series.length ? checkInSantiagoDay(series[series.length - 1]!) : null
  const sevenDaysBeforeLastWeight = lastWeightDay ? isoDateAddDays(lastWeightDay, -7) : null
  const delta7d = useMemo(() => {
    if (series.length < 2 || !sevenDaysBeforeLastWeight) return null
    const last = series[series.length - 1]!
    let baseline = [...series].reverse().find((c) => checkInSantiagoDay(c) <= sevenDaysBeforeLastWeight)
    if (!baseline) baseline = series[0]
    if (!baseline || baseline.id === last.id || baseline.weight == null || last.weight == null) return null
    return Math.round((Number(last.weight) - Number(baseline.weight)) * 10) / 10
  }, [series, sevenDaysBeforeLastWeight])

  const bmi = actual != null && client?.height_cm != null ? bmiFromMetric(actual, client.height_cm) : null
  const energyFromDay = isoDateAddDays(getTodayInSantiago().iso, -6)
  const energy7d = useMemo(() => {
    const levels = checkIns
      .filter((c) => checkInSantiagoDay(c) >= energyFromDay && c.energy_level != null)
      .map((c) => Number(c.energy_level))
    return levels.length ? levels.reduce((sum, level) => sum + level, 0) / levels.length : null
  }, [checkIns, energyFromDay])

  const active = activeIdx != null && activeIdx >= 0 && activeIdx < series.length ? series[activeIdx] : null

  if (checkIns.length === 0) {
    return (
      <StatCard>
        <View style={styles.emptyRow}>
          <Scale size={16} color={theme.mutedForeground} />
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: FONT.uiMedium, flex: 1 }]}>Sin check-ins todavía. La composición y tendencias aparecerán cuando el alumno registre peso y fotos.</Text>
        </View>
      </StatCard>
    )
  }

  return (
    <View style={{ gap: 14 }}>
      {/* AreaChart de peso */}
      <StatCard>
        <SectionHeading title="Peso · tendencia" right={
          <View style={styles.weightHeadline}>
            <Text style={[styles.weightValue, { color: theme.foreground, fontFamily: FONT.displayBlack }]}>
              {actual != null ? actual.toFixed(1) : '—'}<Text style={styles.weightUnit}>kg</Text>
            </Text>
            {delta7d != null ? (
              <Text className={delta7d <= 0 ? 'text-success-600' : 'text-ember-700'} style={[styles.weightDelta, { fontFamily: FONT.uiBold }]}>
                {delta7d >= 0 ? '+' : ''}{delta7d.toFixed(1)} kg
              </Text>
            ) : null}
          </View>
        } />
        {client ? <View style={styles.goalEditorRow}><GoalWeightEditor client={client} reload={reload} workspace={workspace} /></View> : null}
        {points.length >= 2 ? (
            <AreaTrend
              points={points}
              color={theme.primary}
              suffix=" kg"
              decimals={1}
              referenceY={client?.goal_weight_kg ?? null}
              height={90}
              showArea={false}
              curveType="linear"
              accessibilityLabel="Tendencia de peso"
              onActiveIndex={(index) => {
                // Mantener el punto elegido despues del scrub para que el tooltip pueda tocarse
                // y abrir el mismo detalle completo que las miniaturas del historial.
                if (index != null) setActiveIdx(index)
              }}
              onActivateIndex={(index) => {
                const checkIn = series[index]
                if (checkIn) setCheckInDetail({ checkIn, photoIndex: 0 })
              }}
            />
        ) : (
          <View style={styles.weightPlaceholder}>
            <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Hace falta al menos dos pesos para la curva.</Text>
          </View>
        )}
          {client?.goal_weight_kg != null && points.length >= 2 ? (
            <View style={styles.goalLegend}>
              <View style={[styles.goalLegendLine, { borderTopColor: theme.success }]} />
              <Text style={[styles.goalLegendText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Objetivo · {client.goal_weight_kg} kg</Text>
            </View>
          ) : null}
          {active ? (
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => setCheckInDetail({ checkIn: active, photoIndex: 0 })}
              accessibilityRole="button"
              accessibilityLabel={`Abrir detalle del check-in de ${formatDate(active.created_at ?? active.date)}`}
              style={[styles.tooltip, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}
            >
              {active.front_photo_url ? (
                <Image source={{ uri: active.front_photo_url }} style={[styles.tipPhoto, { borderColor: theme.border }]} contentFit="cover" />
              ) : null}
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.tipDate, { color: theme.foreground, fontFamily: FONT.display }]}>{formatDate(active.created_at ?? active.date)}</Text>
                <Text style={[styles.tipMeta, { color: theme.primary, fontFamily: FONT.uiBold }]}>
                  {active.weight} kg{active.energy_level != null ? ` · Energía ${active.energy_level}/10` : ''}
                </Text>
                {active.notes ? <Text numberOfLines={2} style={[styles.tipMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{active.notes}</Text> : null}
              </View>
            </TouchableOpacity>
          ) : points.length >= 2 ? (
            <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Toca la gráfica para ver cada check-in.</Text>
          ) : null}
        <View style={styles.progressGrid}>
          <ProgressMetric value={initial != null ? `${initial.toFixed(1)} kg` : '—'} label="Inicial" />
          <ProgressMetric value={cambio != null ? `${cambio > 0 ? '+' : ''}${cambio.toFixed(1)} kg` : '—'} label="Cambio total" colorClass={cambio == null ? undefined : cambio <= 0 ? 'text-success-600' : 'text-ember-700'} />
          <ProgressMetric value={`${ritmo30 >= 0 ? '+' : ''}${ritmo30.toFixed(1)} kg`} label="Ritmo 30d" sub="regresión" info={{ title: 'Regresión lineal', content: 'Ritmo de cambio estimado por regresión lineal sobre tus pesos.' }} />
          <ProgressMetric
            value={projected4wRange && series.length >= 2
              ? projected4wRange.low === projected4wRange.high
                ? `${projected4wRange.point.toFixed(1)} kg`
                : `${projected4wRange.low.toFixed(1)}–${projected4wRange.high.toFixed(1)} kg`
              : '—'}
            label="Proyección 4 sem"
            badge={projected4wRange && series.length >= 2 ? 'estimado' : undefined}
            hint={projected4wRange && series.length >= 2 ? 'extrapolación lineal, no una promesa' : undefined}
            info={{ title: 'Proyección', content: 'Extrapolación lineal; una estimación, no una promesa.' }}
          />
          <ProgressMetric value={energy7d != null ? `${energy7d.toFixed(1)}/10` : '—'} label="Energía media" sub="7 días" />
        </View>
      </StatCard>

      {/* IMC */}
      <StatCard>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleWithInfo}>
            <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]}>IMC</Text>
            <InfoTooltip title="IMC" content="Índice de masa corporal = peso / altura²." size={13} />
          </View>
          {bmi != null ? (
            <View style={styles.bmiHeadline}>
              <Text style={[styles.bmiValue, { color: theme.foreground, fontFamily: FONT.displayBlack }]}>{bmi.toFixed(1)}</Text>
              <Text className={bmiCategory(bmi) === 'Normal' ? 'text-success-600' : 'text-ember-700'} style={[styles.bmiCategory, { fontFamily: FONT.uiBold }]}>{bmiCategory(bmi)}</Text>
            </View>
          ) : null}
        </View>
        {bmi != null ? (
          <>
            <BmiBar bmi={bmi} />
            <Text style={[styles.bmiHeight, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Altura {client!.height_cm! < 3 ? Math.round(client!.height_cm! * 100) : client!.height_cm} cm · de la ficha intake</Text>
          </>
        ) : (
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Añade altura en la ficha del alumno (intake) para ver IMC y la escala.</Text>
        )}
      </StatCard>

      {/* Gauge energía 7d */}
      <StatCard>
        <SectionHeading title="Energía media · 7 días" />
        {energy7d != null ? (
          <View style={styles.energyGaugeRow}>
            <EnergyGauge value={energy7d} color={energy7d >= 7 ? theme.success : energy7d >= 4 ? theme.warning : theme.destructive} />
            <View>
              <Text style={[styles.energyGaugeValue, { color: theme.foreground, fontFamily: FONT.displayBlack }]}>{energy7d.toFixed(1)}<Text style={styles.energyGaugeUnit}>/10</Text></Text>
              <EnergyStars level={energy7d} />
            </View>
          </View>
        ) : (
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin niveles de energía en la última semana.</Text>
        )}
      </StatCard>

      {/* Composición corporal (gateada por módulo body_composition) */}
      {client ? <CompositionSection clientId={client.id} hasModule={hasBodyComp} entitlementsReady={bodyCompReady} inlineAllowed={bodyCompInlineAllowed} workspace={workspace} /> : null}

      {/* Comparador de fotos */}
      <PhotoComparator checkIns={checkIns} />

      {/* Timeline de check-ins */}
      <CheckInHistory checkIns={checkIns} onOpenPhoto={onOpenPhoto} detail={checkInDetail} onDetailChange={setCheckInDetail} />
    </View>
  )
}

function ProgressMetric({ value, label, sub, badge, hint, color, colorClass, info }: { value: string; label: string; sub?: string; badge?: string; hint?: string; color?: string; colorClass?: string; info?: { title: string; content: string } }) {
  const { theme } = useTheme()
  return (
    <View style={[styles.progressMetric, { backgroundColor: theme.secondary, borderRadius: theme.radius.sm }]}>
      <View style={styles.progressMetricTop}>
        <Text numberOfLines={1} className={colorClass} style={[styles.progressMetricValue, { color: colorClass ? undefined : color ?? theme.foreground, fontFamily: FONT.displayBlack }]}>{value}</Text>
        {badge ? (
          <View style={[styles.estimateBadge, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.estimateBadgeText, { color: theme.mutedForeground, fontFamily: FONT.uiSemibold }]}>{badge}</Text>
          </View>
        ) : null}
        {info ? <InfoTooltip title={info.title} content={info.content} size={13} /> : null}
      </View>
      <Text style={[styles.progressMetricLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}{sub ? ` · ${sub}` : ''}</Text>
      {hint ? <Text style={[styles.progressMetricHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{hint}</Text> : null}
    </View>
  )
}

function EnergyStars({ level }: { level: number | null }) {
  const stars = Math.min(5, Math.max(0, Math.round((level ?? 0) / 2)))
  return (
    <View accessible accessibilityRole="image" style={styles.energyStars} accessibilityLabel={`Energía ${level?.toFixed(1) ?? 0} de 10`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} className={i <= stars ? 'text-ember-500' : 'text-ink-200'} style={styles.energyStar}>★</Text>
      ))}
    </View>
  )
}

// Editor de peso objetivo (clients.goal_weight_kg) anclado al chart de peso: al fijarlo,
// AreaTrend dibuja la línea punteada de objetivo (referenceY). Espejo del editor web de Progreso.
function GoalWeightEditor({ client, reload, workspace }: { client: NonNullable<CoachClientDetailData['client']>; reload: () => void; workspace: ClientActionWorkspace }) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const [goal, setGoal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasGoal = client.goal_weight_kg != null

  function openEditor() {
    setGoal(client.goal_weight_kg != null ? String(client.goal_weight_kg) : '')
    setError(null)
    setOpen(true)
  }

  async function save() {
    setError(null)
    const t = goal.trim().replace(',', '.')
    const val = t === '' ? null : Number(t)
    if (val != null && (!Number.isFinite(val) || val < 20 || val > 400)) { setError('El peso debe estar entre 20 y 400 kg.'); return }
    setSaving(true)
    const r = await updateCoachClient(client.id, { goal_weight_kg: val }, workspace)
    setSaving(false)
    if (!r.ok) { setError(r.error ?? 'No se pudo guardar.'); return }
    setOpen(false)
    reload()
  }

  return (
    <>
      <TouchableOpacity onPress={openEditor} hitSlop={8} accessibilityRole="button" accessibilityLabel="Editar peso objetivo" testID="ficha-edit-goal-weight" style={styles.goalTrigger}>
        {hasGoal ? (
          <>
            <Pill label={`Objetivo · ${client.goal_weight_kg} kg`} />
            <Pencil size={13} color={theme.mutedForeground} />
          </>
        ) : (
          <View style={[styles.goalAdd, { borderColor: theme.border, borderRadius: theme.radius.pill }]}>
            <Target size={13} color={theme.primary} />
            <Text style={{ fontSize: 11.5, color: theme.primary, fontFamily: FONT.uiBold }}>Definir objetivo</Text>
          </View>
        )}
      </TouchableOpacity>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Peso objetivo"
        description="Dibuja la línea de objetivo en el chart de peso."
        nativeModal
        snapPoints={['55%']}
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Cancelar" variant="secondary" onPress={() => setOpen(false)} disabled={saving} style={{ flex: 1 }} />
            <Button label={saving ? 'Guardando…' : 'Guardar'} onPress={save} disabled={saving} style={{ flex: 1 }} />
          </View>
        }
      >
        <Input label="Peso objetivo (kg)" value={goal} onChangeText={setGoal} keyboardType="decimal-pad" placeholder="75" hint="Déjalo vacío para quitar el objetivo." testID="goal-weight-input" />
        {error ? <Text accessibilityRole="alert" style={{ color: theme.destructive, fontSize: 13, fontFamily: theme.fontSans }}>{error}</Text> : null}
      </Sheet>
    </>
  )
}

function BmiBar({ bmi }: { bmi: number }) {
  const { theme, branding } = useTheme()
  const sport300 = resolveSportRamp(branding?.primaryColor).sport300
  const pct = Math.max(0, Math.min(1, (bmi - BMI_MIN) / (BMI_MAX - BMI_MIN)))
  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.bmiTrack, { borderRadius: theme.radius.pill }]}>
        <LinearGradient
          colors={[sport300, theme.success, theme.warning, theme.destructive]}
          locations={[0, 0.3, 0.65, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.pill }]}
        />
        <View className="bg-white" style={[styles.bmiMarker, { left: `${pct * 100}%`, borderColor: theme.foreground }]} />
      </View>
      <View style={styles.bmiLabels}>
        {['16', '18.5', '25', '30', '36'].map((label) => (
          <Text key={label} style={[styles.bmiLabel, { color: theme.mutedForeground, fontFamily: FONT.mono }]}>{label}</Text>
        ))}
      </View>
    </View>
  )
}

function PhotoComparator({ checkIns }: { checkIns: CheckInEntry[] }) {
  const { theme } = useTheme()
  const withPhoto = useMemo(
    () => [...checkIns].filter((c) => c.front_photo_url).sort((a, b) => checkInTimestamp(a) - checkInTimestamp(b)),
    [checkIns]
  )
  const [baseId, setBaseId] = useState('')
  const [compareId, setCompareId] = useState('')
  const [comparisonOpen, setComparisonOpen] = useState(false)

  useEffect(() => {
    if (!withPhoto.length) {
      setBaseId('')
      setCompareId('')
      return
    }
    setBaseId((id) => id && withPhoto.some((checkIn) => checkIn.id === id) ? id : withPhoto[0]!.id)
    setCompareId((id) => id && withPhoto.some((checkIn) => checkIn.id === id) ? id : withPhoto[withPhoto.length - 1]!.id)
  }, [withPhoto])

  if (withPhoto.length < 2) return null
  const a = withPhoto.find((checkIn) => checkIn.id === baseId) ?? withPhoto[0]!
  const b = withPhoto.find((checkIn) => checkIn.id === compareId) ?? withPhoto[withPhoto.length - 1]!
  const dW = a.weight != null && b.weight != null ? Math.round((Number(b.weight) - Number(a.weight)) * 10) / 10 : null
  const dE = a.energy_level != null && b.energy_level != null ? b.energy_level - a.energy_level : null
  const options = withPhoto.map((checkIn) => ({
    value: checkIn.id,
    label: `${formatDate(checkIn.created_at ?? checkIn.date)} · ${checkIn.weight != null ? `${checkIn.weight} kg` : '—'}`,
  }))

  return (
    <>
      <StatCard>
        <SectionHeading title="Comparativa de fotos" />
        <View style={styles.comparisonDeltas}>
          <View style={styles.comparisonDeltaItem}>
            <Text style={[styles.comparisonDeltaLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}> Δ Peso </Text>
            <Text className={dW == null ? 'text-muted' : dW <= 0 ? 'text-success-600' : 'text-ember-700'} style={[styles.comparisonDeltaValue, { fontFamily: FONT.uiBold }]}>{dW == null ? '—' : `${dW >= 0 ? '+' : ''}${dW} kg`}</Text>
          </View>
          <View style={styles.comparisonDeltaItem}>
            <Text style={[styles.comparisonDeltaLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}> Δ Energía </Text>
            <Text className={dE == null ? 'text-muted' : dE >= 0 ? 'text-success-600' : 'text-ember-700'} style={[styles.comparisonDeltaValue, { fontFamily: FONT.uiBold }]}>{dE == null ? '—' : `${dE >= 0 ? '+' : ''}${dE}`}</Text>
          </View>
        </View>
        <View style={styles.comparisonSelectors}>
          <View style={styles.comparisonSelector}>
            <Select label="Base" title="Seleccionar foto base" value={a.id} onValueChange={setBaseId} options={options} />
          </View>
          <View style={styles.comparisonSelector}>
            <Select label="Comparar" title="Seleccionar foto para comparar" value={b.id} onValueChange={setCompareId} options={options} />
          </View>
        </View>
        <Button label="Abrir comparativa" variant="secondary" leftIcon={Images} full onPress={() => setComparisonOpen(true)} disabled={a.id === b.id} />
      </StatCard>

      <Sheet
        open={comparisonOpen}
        onClose={() => setComparisonOpen(false)}
        title="Comparativa de Evolución"
        description="Desliza para comparar"
        nativeModal
        forceDark
        snapPoints={['88%']}
      >
        <ComparisonSlider base={a} compare={b} />
      </Sheet>
    </>
  )
}

function ComparisonSlider({ base, compare }: { base: CheckInEntry; compare: CheckInEntry }) {
  const { theme } = useTheme()
  const { height: windowHeight } = useWindowDimensions()
  const [width, setWidth] = useState(1)
  const [reveal, setReveal] = useState(0.5)
  const move = (locationX: number) => setReveal(Math.max(0, Math.min(1, locationX / Math.max(1, width))))
  const stageHeight = Math.min(640, Math.max(320, Math.round(windowHeight * 0.68)))
  return (
    <View style={{ gap: 10 }}>
      <View
        className="bg-ink-950"
        style={[styles.comparisonStage, { height: stageHeight, borderColor: theme.border }]}
        onLayout={(event) => setWidth(Math.max(1, event.nativeEvent.layout.width))}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => move(event.nativeEvent.locationX)}
        onResponderMove={(event) => move(event.nativeEvent.locationX)}
        accessibilityRole="adjustable"
        accessibilityLabel="Desliza para comparar las fotos"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(reveal * 100), text: `${Math.round(reveal * 100)}% antes` }}
        accessibilityActions={[{ name: 'increment', label: 'Mostrar más de antes' }, { name: 'decrement', label: 'Mostrar más de después' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') setReveal((value) => Math.min(1, value + 0.1))
          if (event.nativeEvent.actionName === 'decrement') setReveal((value) => Math.max(0, value - 0.1))
        }}
      >
        <Image source={{ uri: compare.front_photo_url! }} style={StyleSheet.absoluteFill} contentFit="contain" />
        <Text className="bg-sport-500 text-on-sport" style={[styles.comparisonDateBadge, styles.comparisonAfterBadge, { fontFamily: FONT.uiBold }]}>{formatDate(compare.created_at ?? compare.date)}</Text>
        <View style={[styles.comparisonClip, { width: width * reveal }]}>
          <Image source={{ uri: base.front_photo_url! }} style={{ width, height: '100%' }} contentFit="contain" />
          <Text className="bg-white text-ink-950" style={[styles.comparisonDateBadge, styles.comparisonBeforeBadge, { fontFamily: FONT.uiBold }]}>{formatDate(base.created_at ?? base.date)}</Text>
        </View>
        <View className="bg-white" style={[styles.comparisonDivider, { left: width * reveal - 1 }]} />
        <View className="border-ink-200 bg-white" style={[styles.comparisonKnob, { left: width * reveal - 24 }]}>
          <ArrowRightLeft size={20} className="text-ink-950" />
        </View>
      </View>
    </View>
  )
}

function formatCheckInDateTime(checkIn: CheckInEntry): string {
  if (!checkIn.created_at) return formatDate(checkIn.date)
  const date = new Date(checkIn.created_at)
  if (!Number.isFinite(date.getTime())) return formatDate(checkIn.date)
  const day = date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Santiago' })
  const time = date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' })
  return `${day} · ${time}`
}

function CheckInHistory({ checkIns, onOpenPhoto, detail, onDetailChange }: {
  checkIns: CheckInEntry[]
  onOpenPhoto: (photos: string[], index: number) => void
  detail: CheckInDetailState | null
  onDetailChange: (detail: CheckInDetailState | null) => void
}) {
  const { theme } = useTheme()
  const sorted = useMemo(() => [...checkIns].sort((a, b) => checkInTimestamp(b) - checkInTimestamp(a)), [checkIns])
  const photos = detail ? [detail.checkIn.front_photo_url, detail.checkIn.side_photo_url, detail.checkIn.back_photo_url].filter(Boolean) as string[] : []
  return (
    <View style={{ gap: 10 }}>
      <SectionHeading title="Historial de check-ins" />
      {sorted.map((checkIn) => (
        <CheckInRow key={checkIn.id} c={checkIn} onOpenDetail={(photoIndex) => onDetailChange({ checkIn, photoIndex })} />
      ))}
      <Sheet
        open={detail != null}
        onClose={() => onDetailChange(null)}
        title={detail ? `Check-in · ${formatDate(detail.checkIn.created_at ?? detail.checkIn.date)}` : 'Check-in'}
        nativeModal
        snapPoints={['88%']}
      >
        {detail ? (
          <View style={{ gap: 14 }}>
            {photos[detail.photoIndex] ? (
              <TouchableOpacity
                onPress={() => onOpenPhoto(photos, detail.photoIndex)}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Abrir foto del check-in a pantalla completa"
              >
                <Image source={{ uri: photos[detail.photoIndex]! }} style={styles.detailPhoto} contentFit="cover" transition={150} />
              </TouchableOpacity>
            ) : null}
            <View style={styles.detailMetrics}>
              <Text style={[styles.detailWeight, { color: theme.foreground, fontFamily: FONT.displayBlack }]}>{detail.checkIn.weight != null ? detail.checkIn.weight : '—'}<Text style={[styles.detailUnit, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}> kg</Text></Text>
              {detail.checkIn.energy_level != null ? (
                <View style={styles.detailEnergy}>
                  <EnergyStars level={detail.checkIn.energy_level} />
                  <Text style={[styles.compMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{detail.checkIn.energy_level}/10</Text>
                </View>
              ) : null}
            </View>
            {detail.checkIn.notes ? <Text style={[styles.detailNotes, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{detail.checkIn.notes}</Text> : null}
          </View>
        ) : null}
      </Sheet>
    </View>
  )
}

function CheckInRow({ c, onOpenDetail }: { c: CheckInEntry; onOpenDetail: (photoIndex: number) => void }) {
  const { theme } = useTheme()
  const photos = [c.front_photo_url, c.side_photo_url, c.back_photo_url].filter(Boolean) as string[]
  const hasFront = Boolean(c.front_photo_url)
  const extraPhotos = hasFront ? photos.slice(1) : photos
  const extraOffset = hasFront ? 1 : 0
  return (
    <View style={[styles.ciCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <Text style={[styles.ciDate, { color: theme.foreground, fontFamily: FONT.uiExtra }]}>{formatCheckInDateTime(c)}</Text>
      <View style={styles.ciContent}>
        {c.front_photo_url ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => onOpenDetail(0)} accessibilityRole="button" accessibilityLabel="Abrir foto frontal del check-in">
            <Image source={{ uri: c.front_photo_url }} style={[styles.ciPrimaryPhoto, { borderColor: theme.border }]} contentFit="cover" transition={150} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.ciBody}>
          <View style={styles.ciMetrics}>
            <Text style={[styles.ciWeight, { color: theme.foreground, fontFamily: FONT.displayBlack }]}>{c.weight != null ? c.weight : '—'}<Text style={[styles.ciUnit, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}> kg</Text></Text>
            <EnergyStars level={c.energy_level} />
          </View>
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans, fontStyle: c.notes ? 'normal' : 'italic' }]}>{c.notes || 'Sin notas'}</Text>
          {extraPhotos.length ? (
            <View style={styles.ciPhotos}>
              {extraPhotos.map((photo, index) => (
                <TouchableOpacity key={`${photo}-${index}`} activeOpacity={0.85} onPress={() => onOpenDetail(index + extraOffset)} accessibilityRole="button" accessibilityLabel={`Abrir foto adicional ${index + 1} del check-in`}>
                  <Image source={{ uri: photo }} style={[styles.ciExtraPhoto, { borderColor: theme.border }]} contentFit="cover" transition={150} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
}

// ── Composición corporal ─────────────────────────────────────────────────────
// Sección del módulo de pago `body_composition` dentro del tab Progreso, espejo del
// CompositionSection web (ProgressBodyCompositionB6). Con módulo OFF muestra teaser y no consulta;
// con módulo ON carga la medición real.
// Lectura read-only por PostgREST (RLS bcm_select = techo: el coach solo ve a SUS alumnos); las
// MUTACIONES viven en la pantalla /coach/bodycomp/[clientId] (endpoints /api/mobile/bodycomp/*).
// Las series NUNCA se mezclan entre métodos (el % grasa BIA e ISAK no es comparable).

function readBia(row: BodyCompRow): BiaMetrics {
  return row.method === 'bia' && row.metrics && typeof row.metrics === 'object' ? (row.metrics as BiaMetrics) : {}
}
function bcDeviceLabel(row: BodyCompRow): string {
  const dev = [row.device_brand, row.device_model].filter(Boolean).join(' ')
  const date = formatBodyCompDate(row.measured_at)
  return dev ? `${dev} · ${date}` : date
}

function CompositionSection({ clientId, hasModule, entitlementsReady, inlineAllowed, workspace }: {
  clientId: string
  hasModule: boolean
  entitlementsReady: boolean
  inlineAllowed: boolean
  workspace: ClientActionWorkspace
}) {
  const { theme } = useTheme()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<BodyCompRow[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useFocusEffect(useCallback(() => {
    // Guard de money-safety: aunque el padre solo monta con módulo ON, no pegamos a DB sin él.
    if (!entitlementsReady || !hasModule || !inlineAllowed) {
      setRows([])
      setLoadError(null)
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        const scoped = await listScopedMeasurements(clientId, workspace)
        if (!alive) return
        setRows([...scoped.bia, ...scoped.isak].sort((a, b) => b.measured_at.localeCompare(a.measured_at)))
      } catch (error) {
        if (!alive) return
        setRows([])
        setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar las mediciones.')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [clientId, hasModule, entitlementsReady, inlineAllowed, reloadKey, workspace.kind, workspace.teamId, workspace.orgId]))

  const bia = useMemo(() => rows.filter((r) => r.method === 'bia'), [rows])
  const isak = useMemo(() => rows.filter((r) => r.method === 'isak'), [rows])
  const hasBia = bia.length > 0
  const hasIsak = isak.length > 0
  const [method, setMethod] = useState<BodyCompMethod>('bia')
  const [metric, setMetric] = useState<'fat' | 'muscle' | 'adipose'>('fat')
  // Alinear el método visible con lo que tenga datos (BIA prioritario), sin pisar la elección manual.
  useEffect(() => {
    if (!hasBia && !hasIsak) return
    setMethod((m) => (m === 'bia' ? (hasBia ? 'bia' : 'isak') : hasIsak ? 'isak' : 'bia'))
  }, [hasBia, hasIsak])

  useEffect(() => {
    if (method === 'bia' && metric === 'adipose') setMetric('fat')
  }, [method, metric])

  const goCapture = () => router.push(`/coach/bodycomp/${clientId}`)

  if (!entitlementsReady) {
    return (
      <StatCard>
        <SectionHeading title="Composición corporal" />
        <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Cargando módulos…</Text>
      </StatCard>
    )
  }

  if (!hasModule) {
    return (
      <StatCard>
        <SectionHeading title="Composición corporal" />
        <View style={[styles.teaserStage, { borderRadius: theme.radius.md }]}>
          <View pointerEvents="none" style={styles.teaserPreview}>
            <View style={styles.progressGrid}>
              <ProgressMetric value="18.4%" label="% Grasa" />
              <ProgressMetric value="34.2 kg" label="Masa muscular" />
            </View>
            <AreaTrend
              points={[
                { i: 0, y: 30, label: '' },
                { i: 1, y: 48, label: '' },
                { i: 2, y: 42, label: '' },
                { i: 3, y: 62, label: '' },
                { i: 4, y: 56, label: '' },
                { i: 5, y: 74, label: '' },
              ]}
              color={theme.primary}
              suffix="%"
              decimals={1}
              height={70}
              showArea={false}
              curveType="linear"
            />
          </View>
          <BlurView pointerEvents="none" intensity={14} tint={theme.scheme === 'dark' ? 'dark' : 'light'} experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
          <View style={styles.teaserBody}>
            <View style={[styles.teaserIcon, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.pill }]}>
              <Ruler size={20} color={theme.mutedForeground} />
            </View>
            <Text style={[styles.teaserTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]}>Composición corporal</Text>
            <Text style={[styles.teaserCopy, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>%Grasa, masa muscular y antropometría (protocolo ISAK). Parte del módulo Composición corporal, incluido en los planes pagos.</Text>
            <Button label="Mejorar mi plan" variant="sport" onPress={() => router.push('/coach/modules')} style={{ marginTop: 2 }} />
          </View>
        </View>
      </StatCard>
    )
  }

  if (!inlineAllowed) {
    return (
      <StatCard>
        <SectionHeading title="Composición corporal" right={<Pill label="Módulo" tone="success" />} />
        <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Las mediciones se consultan y registran desde el módulo Composición corporal.
        </Text>
        <Button label="Abrir módulo" variant="sport" onPress={goCapture} testID="progreso-bodycomp-open" style={{ marginTop: 4 }} />
      </StatCard>
    )
  }

  if (loading) {
    return (
      <StatCard>
        <SectionHeading title="Composición corporal" />
        <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Cargando mediciones…</Text>
      </StatCard>
    )
  }

  if (loadError) {
    return (
      <StatCard>
        <SectionHeading title="Composición corporal" />
        <Text style={[cd.sub, { color: theme.destructive, fontFamily: theme.fontSans }]}>{loadError}</Text>
        <View style={styles.bodycompErrorActions}>
          <Button label="Reintentar" variant="secondary" onPress={() => setReloadKey((value) => value + 1)} style={{ flex: 1 }} />
          <Button label="Abrir módulo" variant="sport" onPress={goCapture} style={{ flex: 1 }} />
        </View>
      </StatCard>
    )
  }

  if (!hasBia && !hasIsak) {
    return (
      <StatCard>
        <SectionHeading title="Composición corporal" right={<Pill label="Módulo" tone="success" />} />
        <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Sin mediciones todavía. Captura bioimpedancia o antropometría (ISAK) desde el módulo Composición corporal.
        </Text>
        <Button label="Nueva medición" onPress={goCapture} testID="progreso-bodycomp-new" style={{ marginTop: 4 }} />
      </StatCard>
    )
  }

  const showBia = hasBia && (method === 'bia' || !hasIsak)
  const series = showBia ? bia : isak

  // Puntos de tendencia del % grasa (serie primaria) — ascendente por fecha, sin mezclar métodos.
  const asc = [...series].sort((a, b) => a.measured_at.localeCompare(b.measured_at))
  const metricOf = (r: BodyCompRow): number | null => {
    if (showBia) {
      const value = readBia(r)
      return metric === 'muscle' ? value.skeletalMuscleMassKg ?? null : value.bodyFatPercent ?? null
    }
    const value = readIsakView(r)
    if (!value) return null
    if (metric === 'muscle') return value.fractionation.muscle.kg
    if (metric === 'adipose') return value.fractionation.adipose.kg
    return value.bodyFat.percent
  }
  const points: AreaPoint[] = []
  for (const r of asc) {
    const y = metricOf(r)
    if (y != null) points.push({ i: points.length, y, label: formatBodyCompDate(r.measured_at) })
  }

  const latest = series[0]!
  const prev = series[1] ?? null
  const latestMetric = metricOf(latest)
  const previousMetric = prev ? metricOf(prev) : null
  const activeDelta = latestMetric != null && previousMetric != null ? latestMetric - previousMetric : null

  return (
    <StatCard>
      <SectionHeading title="Composición corporal" />

      {hasBia && hasIsak ? (
        <SegmentedTabs
          size="sm"
          value={method}
          onChange={setMethod}
          items={[
            { value: 'bia', label: 'Bioimpedancia' },
            { value: 'isak', label: 'Antropometría' },
          ]}
        />
      ) : null}

      {showBia ? (
        <BiaTiles latest={readBia(latest)} prev={prev ? readBia(prev) : null} deviceLabel={bcDeviceLabel(latest)} />
      ) : (
        <IsakTiles latest={readIsakView(latest)} validated={latest.is_validated} />
      )}

      <View
        className="border border-subtle bg-surface-card"
        style={[styles.bodycompSubcard, { borderRadius: theme.radius.card }]}
      >
        <SegmentedTabs
          size="sm"
          value={metric}
          onChange={setMetric}
          items={showBia
            ? [{ value: 'fat', label: '% Grasa' }, { value: 'muscle', label: 'Masa muscular' }]
            : [{ value: 'fat', label: '% Grasa' }, { value: 'muscle', label: 'Masa muscular' }, { value: 'adipose', label: 'Masa adiposa' }]}
        />

        {activeDelta != null ? (
          <Text
            className={activeDelta > 0 ? 'text-danger-600' : activeDelta < 0 ? 'text-success-600' : 'text-muted'}
            style={[styles.activeSeriesDelta, { fontFamily: FONT.uiBold }]}
          >
            Δ {activeDelta > 0 ? '+' : ''}{activeDelta.toFixed(1)}{metric === 'fat' ? '%' : ' kg'}
          </Text>
        ) : null}

        {points.length >= 1 ? (
          <View style={{ gap: 4 }}>
            <Text style={[cd.listHeading, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{metric === 'fat' ? '% Grasa' : metric === 'muscle' ? 'Masa muscular' : 'Masa adiposa'} · tendencia</Text>
            <AreaTrend
              points={points}
              color={showBia ? theme.primary : theme.success}
              suffix={metric === 'fat' ? '%' : ' kg'}
              decimals={1}
              height={224}
              showArea={false}
              curveType="monotoneX"
              allowSinglePoint
              showXAxisLabels
              showTooltipLabel
              accessiblePoints
              accessibilityLabel={`Tendencia de ${metric === 'fat' ? 'porcentaje de grasa' : metric === 'muscle' ? 'masa muscular' : 'masa adiposa'}`}
            />
          </View>
        ) : null}
      </View>

      <View style={{ gap: 7 }}>
        <Text style={[cd.listHeading, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Historial de mediciones</Text>
        {series.map((row) => {
          const biaMetrics = row.method === 'bia' ? readBia(row) : null
          const isakMetrics = row.method === 'isak' ? readIsakView(row) : null
          const summary = biaMetrics
            ? [
                biaMetrics.bodyFatPercent != null ? `${biaMetrics.bodyFatPercent.toFixed(1)}% grasa` : null,
                biaMetrics.skeletalMuscleMassKg != null ? `${biaMetrics.skeletalMuscleMassKg.toFixed(1)} kg músculo` : null,
              ].filter(Boolean).join(' · ')
            : isakMetrics
              ? `${isakMetrics.bodyFat.percent.toFixed(1)}% grasa · ${isakMetrics.fractionation.muscle.kg.toFixed(1)} kg músculo`
              : ''
          return (
          <View
            key={row.id}
            className="bg-surface-sunken"
            style={[styles.measurementRow, { borderRadius: theme.radius.control }]}
          >
            <View style={{ flex: 1 }}>
              <View style={styles.measurementTitleRow}>
                <Text numberOfLines={1} style={[styles.measurementTitle, { color: theme.foreground, fontFamily: FONT.uiSemibold }]}>{bcDeviceLabel(row)}</Text>
                {row.method === 'isak' && !row.is_validated ? <Pill label="Preliminar" tone="warning" /> : null}
              </View>
              {summary ? <Text numberOfLines={1} style={[styles.measurementMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{summary}</Text> : null}
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Eliminar medición"
              disabled={deletingId === row.id}
              onPress={() => Alert.alert(
                'Eliminar medición',
                'Esta medición se quitará del historial.',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Eliminar', style: 'destructive', onPress: async () => {
                      setDeletingId(row.id)
                      try {
                        await deleteScopedMeasurement(clientId, row.id, workspace)
                        setReloadKey((value) => value + 1)
                      } catch (error) {
                        Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo eliminar la medición.')
                      } finally {
                        setDeletingId(null)
                      }
                    },
                  },
                ],
              )}
              style={styles.measurementDelete}
            >
              <Trash2 size={16} color={theme.destructive} />
            </TouchableOpacity>
          </View>
          )
        })}
      </View>

      <Button label="Nueva medición" variant="secondary" onPress={goCapture} testID="progreso-bodycomp-new" />
    </StatCard>
  )
}

function metricDelta(latest: number | null | undefined, previous: number | null | undefined): number | null {
  return latest != null && previous != null ? latest - previous : null
}

type BiaMetricTileProps = {
  label: string
  value: string
  delta: number | null
  deltaValue: string | null
  higherIsBetter?: boolean
}

function BiaMetricTile({ label, value, delta, deltaValue, higherIsBetter }: BiaMetricTileProps) {
  const { theme } = useTheme()
  const improvement = delta != null && delta !== 0 && (higherIsBetter ? delta > 0 : delta < 0)
  const Arrow = delta != null && delta > 0 ? ArrowUp : ArrowDown

  return (
    <View
      className="border border-subtle bg-surface-sunken"
      style={[styles.bodyMetricTile, { borderRadius: theme.radius.control }]}
    >
      <Text numberOfLines={1} className="text-muted" style={[styles.bodyMetricLabel, { fontFamily: FONT.uiExtra }]}>
        {label.toUpperCase()}
      </Text>
      <Text className="text-strong" style={[styles.bodyMetricValue, { fontFamily: FONT.displayBlack }]}>
        {value}
      </Text>
      {delta != null && delta !== 0 && deltaValue ? (
        <View style={styles.bodyMetricDeltaRow}>
          <Arrow size={11} color={improvement ? theme.success : theme.destructive} strokeWidth={2.5} />
          <Text
            style={[
              styles.bodyMetricDelta,
              { color: improvement ? theme.success : theme.destructive, fontFamily: FONT.uiBold },
            ]}
          >
            {deltaValue}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function BiaTiles({ latest, prev, deviceLabel }: { latest: BiaMetrics; prev: BiaMetrics | null; deviceLabel: string }) {
  const { theme } = useTheme()
  const metrics = [
    latest.bodyFatPercent != null ? { label: '% Grasa', value: `${latest.bodyFatPercent.toFixed(1)}%`, delta: metricDelta(latest.bodyFatPercent, prev?.bodyFatPercent), fmt: (value: number) => `${value.toFixed(1)}%` } : null,
    latest.skeletalMuscleMassKg != null ? { label: 'Masa muscular', value: `${latest.skeletalMuscleMassKg.toFixed(1)} kg`, delta: metricDelta(latest.skeletalMuscleMassKg, prev?.skeletalMuscleMassKg), fmt: (value: number) => `${value.toFixed(1)} kg`, higherIsBetter: true } : null,
    latest.fatMassKg != null ? { label: 'Masa grasa', value: `${latest.fatMassKg.toFixed(1)} kg`, delta: metricDelta(latest.fatMassKg, prev?.fatMassKg), fmt: (value: number) => `${value.toFixed(1)} kg` } : null,
    latest.visceralFatLevel != null ? { label: 'Grasa visceral', value: latest.visceralFatLevel.toFixed(1), delta: metricDelta(latest.visceralFatLevel, prev?.visceralFatLevel), fmt: (value: number) => value.toFixed(1) } : null,
    latest.basalMetabolicRateKcal != null ? { label: 'Metabolismo basal', value: `${Math.round(latest.basalMetabolicRateKcal)} kcal`, delta: metricDelta(latest.basalMetabolicRateKcal, prev?.basalMetabolicRateKcal), fmt: (value: number) => `${Math.round(value)} kcal`, higherIsBetter: true } : null,
    latest.phaseAngleDeg != null ? { label: 'Ángulo de fase', value: `${latest.phaseAngleDeg.toFixed(1)}°`, delta: metricDelta(latest.phaseAngleDeg, prev?.phaseAngleDeg), fmt: (value: number) => `${value.toFixed(1)}°`, higherIsBetter: true } : null,
    latest.totalBodyWaterL != null ? { label: 'Agua corporal', value: `${latest.totalBodyWaterL.toFixed(1)} L`, delta: metricDelta(latest.totalBodyWaterL, prev?.totalBodyWaterL), fmt: (value: number) => `${value.toFixed(1)} L` } : null,
  ].filter((metric): metric is NonNullable<typeof metric> => metric != null)

  return (
    <View
      className="border border-subtle bg-surface-card"
      style={[styles.bodycompSubcard, { borderRadius: theme.radius.card }]}
    >
      <View style={styles.bodycompSubcardHeader}>
        <Text className="text-muted" style={[styles.bodycompSubcardTitle, { fontFamily: FONT.uiExtra }]}>ÚLTIMA MEDICIÓN</Text>
        <Text className="text-muted" style={[styles.bodycompDevice, { fontFamily: FONT.uiSemibold }]}>{deviceLabel}</Text>
      </View>
      <View style={styles.bodyMetricGrid}>
        {metrics.map((metric) => (
          <BiaMetricTile
            key={metric.label}
            label={metric.label}
            value={metric.value}
            delta={metric.delta}
            deltaValue={metric.delta == null ? null : metric.fmt(Math.abs(metric.delta))}
            higherIsBetter={metric.higherIsBetter}
          />
        ))}
      </View>
    </View>
  )
}

function IsakTiles({ latest, validated }: { latest: IsakView | null; validated: boolean }) {
  const { theme } = useTheme()
  if (!latest) return null
  const f = latest.fractionation
  const s = latest.somatotype
  const components = [
    { label: 'Muscular', value: f.muscle },
    { label: 'Adiposo', value: f.adipose },
    { label: 'Óseo', value: f.bone },
    { label: 'Residual', value: f.residual },
    { label: 'Piel', value: f.skin },
  ]
  return (
    <View
      className="border border-subtle bg-surface-card"
      style={[styles.bodycompSubcard, { borderRadius: theme.radius.card }]}
    >
      <View style={styles.bodycompSubcardHeader}>
        <Text className="text-muted" style={[styles.bodycompSubcardTitle, { fontFamily: FONT.uiExtra }]}>ÚLTIMA MEDICIÓN</Text>
        {!validated ? <Pill label="Preliminar" tone="warning" /> : null}
      </View>
      <View style={cd.grid2}>
        {components.map(({ label, value }) => (
          <MetricBox key={label} value={`${value.kg.toFixed(1)} kg`} label={label} sub={`${value.pct.toFixed(1)}%`} />
        ))}
      </View>
      <Text style={[styles.massValidity, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        Σ masas {f.predictedMassKg.toFixed(1)} kg · peso {f.measuredWeightKg.toFixed(1)} kg · Δ{' '}
        <Text style={{ color: Math.abs(f.massDifferenceKg) <= 3 ? theme.success : theme.warning, fontFamily: FONT.uiBold }}>
          {f.massDifferenceKg > 0 ? '+' : ''}{f.massDifferenceKg.toFixed(1)} kg
        </Text>
      </Text>
      <View style={cd.grid2}>
        <MetricBox value={`${s.endomorphy.toFixed(1)} – ${s.mesomorphy.toFixed(1)} – ${s.ectomorphy.toFixed(1)}`} label="Somatotipo" sub="Endo – Meso – Ecto" />
        <MetricBox value={`${latest.bodyFat.percent.toFixed(1)}%`} label={`% Grasa${validated ? '' : ' (prelim.)'}`} sub={latest.bodyFat.equation} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  sectionTitleWithInfo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sectionTitle: { flex: 1, fontSize: 17, fontFamily: FONT.displayBold, letterSpacing: -0.34 },
  weightHeadline: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  goalEditorRow: { alignItems: 'flex-end' },
  weightValue: { fontSize: 22, letterSpacing: -0.35, fontVariant: ['tabular-nums'] },
  weightUnit: { fontSize: 12 },
  weightDelta: { fontSize: 13, fontVariant: ['tabular-nums'] },
  weightPlaceholder: { height: 90, alignItems: 'center', justifyContent: 'center' },
  progressGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  progressMetric: { width: '31%', minWidth: 88, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  progressMetricTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  progressMetricValue: { fontSize: 15, lineHeight: 17, letterSpacing: -0.2, fontVariant: ['tabular-nums'], flexShrink: 1 },
  progressMetricLabel: { fontSize: 10, lineHeight: 14 },
  progressMetricHint: { fontSize: 9, lineHeight: 12, marginTop: 1 },
  estimateBadge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  estimateBadgeText: { fontSize: 8.5, lineHeight: 11, textTransform: 'uppercase', letterSpacing: 0.35 },
  energyStars: { flexDirection: 'row', gap: 2, marginTop: 3 },
  energyStar: { fontSize: 15, lineHeight: 17 },
  energyGaugeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  energyGaugeValue: { fontSize: 26, letterSpacing: -0.45, fontVariant: ['tabular-nums'] },
  energyGaugeUnit: { fontSize: 13 },
  goalTrigger: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goalAdd: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  goalLegend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  goalLegendLine: { width: 14, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed' },
  goalLegendText: { fontSize: 11.5 },
  tooltip: { flexDirection: 'row', gap: 10, borderWidth: 1, padding: 10 },
  tipPhoto: { width: 48, height: 60, borderRadius: 8, borderWidth: 1 },
  tipDate: { fontSize: 13 },
  tipMeta: { fontSize: 12 },
  bmiHeadline: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  bmiValue: { fontSize: 22, letterSpacing: -0.35, fontVariant: ['tabular-nums'] },
  bmiCategory: { fontSize: 13 },
  bmiTrack: { height: 8, position: 'relative', marginTop: 2 },
  bmiMarker: { position: 'absolute', top: -3, width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginLeft: -7 },
  bmiLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  bmiLabel: { fontSize: 10 },
  bmiHeight: { fontSize: 11, marginTop: 1 },
  compMeta: { fontSize: 12 },
  comparisonSelectors: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  comparisonSelector: { flex: 1, minWidth: 0 },
  comparisonDeltas: { flexDirection: 'row', gap: 18 },
  comparisonDeltaItem: { flexDirection: 'row', alignItems: 'baseline' },
  comparisonDeltaLabel: { fontSize: 11 },
  comparisonDeltaValue: { fontSize: 13, fontVariant: ['tabular-nums'] },
  comparisonStage: { overflow: 'hidden', borderWidth: 1, borderRadius: 14 },
  comparisonClip: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  comparisonDivider: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  comparisonKnob: { position: 'absolute', top: '50%', marginTop: -24, width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  comparisonDateBadge: { position: 'absolute', bottom: 24, zIndex: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5 },
  comparisonBeforeBadge: { left: 24 },
  comparisonAfterBadge: { right: 24 },
  ciCard: { borderWidth: 1, padding: 14, gap: 8 },
  ciDate: { fontSize: 14 },
  ciContent: { flexDirection: 'row', gap: 12 },
  ciBody: { flex: 1, minWidth: 0, gap: 5 },
  ciMetrics: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ciWeight: { fontSize: 17 },
  ciUnit: { fontSize: 12 },
  ciPrimaryPhoto: { width: 60, height: 60, borderRadius: 8, borderWidth: 1 },
  ciPhotos: { flexDirection: 'row', gap: 8, marginTop: 2 },
  ciExtraPhoto: { width: 44, height: 52, borderRadius: 8, borderWidth: 1 },
  detailPhoto: { width: '100%', aspectRatio: 3 / 4, borderRadius: 14 },
  detailMetrics: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  detailWeight: { fontSize: 20, fontVariant: ['tabular-nums'] },
  detailUnit: { fontSize: 12 },
  detailEnergy: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailNotes: { fontSize: 13.5, lineHeight: 19 },
  teaserStage: { minHeight: 230, overflow: 'hidden', position: 'relative' },
  teaserPreview: { opacity: 0.55, gap: 8, padding: 4 },
  teaserBody: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14 },
  teaserIcon: { width: 42, height: 42, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  teaserTitle: { fontSize: 14, letterSpacing: -0.2, textAlign: 'center' },
  teaserCopy: { fontSize: 12, lineHeight: 16, textAlign: 'center', maxWidth: 320 },
  activeSeriesDelta: { fontSize: 12, textAlign: 'right', fontVariant: ['tabular-nums'] },
  bodycompSubcard: { padding: 12, gap: 12 },
  bodycompSubcardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  bodycompSubcardTitle: { fontSize: 12, letterSpacing: 1.2 },
  bodycompDevice: { maxWidth: '50%', fontSize: 11, textAlign: 'right' },
  bodyMetricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bodyMetricTile: { width: '31%', paddingHorizontal: 10, paddingVertical: 9, gap: 2 },
  bodyMetricLabel: { fontSize: 9, lineHeight: 12, letterSpacing: 0.75 },
  bodyMetricValue: { fontSize: 16, lineHeight: 20, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  bodyMetricDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  bodyMetricDelta: { fontSize: 10, lineHeight: 13, fontVariant: ['tabular-nums'] },
  preliminaryRow: { alignItems: 'flex-end' },
  massValidity: { fontSize: 10, lineHeight: 14 },
  bodycompErrorActions: { flexDirection: 'row', gap: 8 },
  measurementRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  measurementTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  measurementTitle: { fontSize: 12, flexShrink: 1 },
  measurementMeta: { fontSize: 11, marginTop: 2 },
  measurementDelete: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
})
