import { useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Activity, GitCompare, Pencil, Ruler, Scale, Target, TrendingUp, Zap } from 'lucide-react-native'
import type { BiaMetrics, IsakResult } from '@eva/bodycomp'
import { useTheme } from '../../../context/ThemeContext'
import { Button, EmptyState, Input, Sheet, SegmentedTabs } from '../../../components'
import { AreaTrend, type AreaPoint } from '../charts/AreaTrend'
import { RadialGauge } from '../charts/RadialGauge'
import { StatCard, CardHeader, MetricBox, Pill, cd, formatDate } from './shared'
import { useEntitlements } from '../../../lib/entitlements'
import { supabase } from '../../../lib/supabase'
import {
  linearRegressionKgPerDay,
  bmiFromMetric,
  bmiCategory,
  avgEnergySince,
  energyColorHex,
} from '../../../lib/profile-analytics'
import { updateCoachClient, type CoachClientDetailData, type CheckInEntry } from '../../../lib/coach-client-detail'

const BMI_MIN = 15
const BMI_MAX = 40
const BMI_SEGMENTS = [
  { upTo: 18.5, color: '#3B82F6' },
  { upTo: 25, color: '#10B981' },
  { upTo: 30, color: '#F59E0B' },
  { upTo: 40, color: '#EF4444' },
]

export function ProgresoTab({ data, onOpenPhoto, reload }: { data: CoachClientDetailData; onOpenPhoto: (photos: string[], index: number) => void; reload: () => void }) {
  const { theme } = useTheme()
  const { hasModule } = useEntitlements()
  const hasBodyComp = hasModule('body_composition')
  const { client, checkIns } = data
  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  const series = useMemo(
    () => [...checkIns].filter((c) => c.weight != null).sort((a, b) => a.date.localeCompare(b.date)),
    [checkIns]
  )
  const points: AreaPoint[] = useMemo(
    () => series.map((c, i) => ({ i, y: Number(c.weight), label: formatDate(c.date) })),
    [series]
  )

  const initial = client?.initial_weight_kg ?? (series.length ? Number(series[0]!.weight) : null)
  const actual = series.length ? Number(series[series.length - 1]!.weight) : null
  const cambio = initial != null && actual != null ? Math.round((actual - initial) * 10) / 10 : null
  const slopePerDay = useMemo(() => linearRegressionKgPerDay(checkIns.map((c) => ({ created_at: c.created_at ?? c.date, weight: c.weight }))), [checkIns])
  const ritmo30 = Math.round(slopePerDay * 30 * 10) / 10
  const proyeccion4w = actual != null ? Math.round((actual + slopePerDay * 28) * 10) / 10 : null

  const bmi = actual != null && client?.height_cm != null ? bmiFromMetric(actual, client.height_cm) : null
  const energy7d = useMemo(() => avgEnergySince(checkIns.map((c) => ({ created_at: c.created_at ?? c.date, energy_level: c.energy_level })), new Date(Date.now() - 7 * 86400000)), [checkIns])

  const active = activeIdx != null && activeIdx >= 0 && activeIdx < series.length ? series[activeIdx] : null

  if (checkIns.length === 0) {
    return <EmptyState icon={Activity} title="Sin progreso" subtitle="Este alumno aún no registra check-ins." />
  }

  return (
    <View style={{ gap: 14 }}>
      {/* AreaChart de peso */}
      {points.length >= 1 ? (
        <StatCard>
          <CardHeader icon={Scale} title="Peso · tendencia" right={
            client ? <GoalWeightEditor client={client} reload={reload} /> : null
          } />
          <Text style={[styles.bmiValue, { color: theme.foreground, fontFamily: 'Archivo_800ExtraBold' }]}>{actual?.toFixed(1)} kg</Text>
          {points.length >= 2 ? (
            <AreaTrend
              points={points}
              color={theme.primary}
              suffix=" kg"
              decimals={1}
              referenceY={client?.goal_weight_kg ?? null}
              onActiveIndex={setActiveIdx}
            />
          ) : (
            <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Registra otro check-in para ver la tendencia.</Text>
          )}
          {active ? (
            <View style={[styles.tooltip, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
              {active.front_photo_url ? (
                <Image source={{ uri: active.front_photo_url }} style={[styles.tipPhoto, { borderColor: theme.border }]} contentFit="cover" />
              ) : null}
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.tipDate, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>{formatDate(active.date)}</Text>
                <Text style={[styles.tipMeta, { color: theme.primary, fontFamily: 'HankenGrotesk_700Bold' }]}>
                  {active.weight} kg{active.energy_level != null ? ` · Energía ${active.energy_level}/10` : ''}
                </Text>
                {active.notes ? <Text numberOfLines={2} style={[styles.tipMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{active.notes}</Text> : null}
              </View>
            </View>
          ) : points.length >= 2 ? (
            <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Toca la gráfica para ver cada check-in.</Text>
          ) : null}
        </StatCard>
      ) : null}

      {/* Stats de composición */}
      <View style={cd.grid2}>
        <MetricBox value={initial != null ? `${initial} kg` : '—'} label="Peso inicial" />
        <MetricBox value={actual != null ? `${actual} kg` : '—'} label="Peso actual" />
        <MetricBox value={cambio != null ? `${cambio > 0 ? '+' : ''}${cambio} kg` : '—'} label="Cambio total" color={cambio == null ? undefined : cambio > 0 ? '#EF4444' : theme.success} />
        <MetricBox value={`${ritmo30 > 0 ? '+' : ''}${ritmo30} kg`} label="Ritmo 30d" color={ritmo30 > 0 ? '#EF4444' : ritmo30 < 0 ? theme.success : undefined} />
        <MetricBox value={proyeccion4w != null ? `${proyeccion4w} kg` : '—'} label="Proyección 4 sem" sub="regresión lineal" />
      </View>

      {/* IMC */}
      {bmi != null ? (
        <StatCard>
          <CardHeader icon={TrendingUp} title="Índice de masa corporal" right={<Pill label={bmiCategory(bmi)} />} />
          <Text style={[styles.bmiValue, { color: theme.foreground, fontFamily: 'Archivo_800ExtraBold' }]}>{bmi.toFixed(1)}</Text>
          <BmiBar bmi={bmi} />
        </StatCard>
      ) : null}

      {/* Gauge energía 7d */}
      {energy7d != null ? (
        <StatCard>
          <CardHeader icon={Zap} title="Energía promedio (7d)" />
          <View style={{ alignItems: 'center' }}>
            <RadialGauge value={energy7d} max={10} label="de 10" display={energy7d.toFixed(1)} color={energyColorHex(Math.round(energy7d))} />
          </View>
        </StatCard>
      ) : null}

      {/* Composición corporal (gateada por módulo body_composition) */}
      {client ? <CompositionSection clientId={client.id} hasModule={hasBodyComp} /> : null}

      {/* Comparador de fotos */}
      <PhotoComparator checkIns={checkIns} onOpenPhoto={onOpenPhoto} />

      {/* Timeline de check-ins */}
      <View style={{ gap: 10 }}>
        <Text style={[cd.listHeading, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Historial de check-ins</Text>
        {checkIns.map((c) => (
          <CheckInRow key={c.id} c={c} onOpenPhoto={onOpenPhoto} />
        ))}
      </View>
    </View>
  )
}

// Editor de peso objetivo (clients.goal_weight_kg) anclado al chart de peso: al fijarlo,
// AreaTrend dibuja la línea punteada de objetivo (referenceY). Espejo del editor web de Progreso.
function GoalWeightEditor({ client, reload }: { client: NonNullable<CoachClientDetailData['client']>; reload: () => void }) {
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
    const r = await updateCoachClient(client.id, { goal_weight_kg: val })
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
            <Pill label={`Objetivo ${client.goal_weight_kg} kg`} />
            <Pencil size={13} color={theme.mutedForeground} />
          </>
        ) : (
          <View style={[styles.goalAdd, { borderColor: theme.border }]}>
            <Target size={13} color={theme.primary} />
            <Text style={{ fontSize: 11.5, color: theme.primary, fontFamily: 'HankenGrotesk_700Bold' }}>Definir objetivo</Text>
          </View>
        )}
      </TouchableOpacity>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Peso objetivo"
        description="Dibuja la línea de objetivo en el chart de peso."
        snapPoints={['55%']}
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Cancelar" variant="secondary" onPress={() => setOpen(false)} disabled={saving} style={{ flex: 1 }} />
            <Button label={saving ? 'Guardando…' : 'Guardar'} onPress={save} disabled={saving} style={{ flex: 1 }} />
          </View>
        }
      >
        <Input label="Peso objetivo (kg)" value={goal} onChangeText={setGoal} keyboardType="decimal-pad" placeholder="75" hint="Déjalo vacío para quitar el objetivo." testID="goal-weight-input" />
        {error ? <Text style={{ color: theme.destructive, fontSize: 13, fontFamily: theme.fontSans }}>{error}</Text> : null}
      </Sheet>
    </>
  )
}

function BmiBar({ bmi }: { bmi: number }) {
  const { theme } = useTheme()
  const pct = Math.max(0, Math.min(1, (bmi - BMI_MIN) / (BMI_MAX - BMI_MIN)))
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.bmiTrack}>
        {BMI_SEGMENTS.map((seg, i) => {
          const lo = i === 0 ? BMI_MIN : BMI_SEGMENTS[i - 1]!.upTo
          const w = ((seg.upTo - lo) / (BMI_MAX - BMI_MIN)) * 100
          return <View key={i} style={{ width: `${w}%`, backgroundColor: seg.color }} />
        })}
        <View style={[styles.bmiMarker, { left: `${pct * 100}%` }]} />
      </View>
      <View style={styles.bmiLabels}>
        <Text style={[styles.bmiLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Bajo</Text>
        <Text style={[styles.bmiLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Normal</Text>
        <Text style={[styles.bmiLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sobre</Text>
        <Text style={[styles.bmiLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Obes.</Text>
      </View>
    </View>
  )
}

function PhotoComparator({ checkIns, onOpenPhoto }: { checkIns: CheckInEntry[]; onOpenPhoto: (photos: string[], index: number) => void }) {
  const { theme } = useTheme()
  const withPhoto = useMemo(
    () => [...checkIns].filter((c) => c.front_photo_url).sort((a, b) => a.date.localeCompare(b.date)),
    [checkIns]
  )
  const [aIdx, setAIdx] = useState(0)
  const [bIdx, setBIdx] = useState(() => Math.max(0, withPhoto.length - 1))

  if (withPhoto.length < 2) return null
  const a = withPhoto[Math.min(aIdx, withPhoto.length - 1)]!
  const b = withPhoto[Math.min(bIdx, withPhoto.length - 1)]!
  const dW = a.weight != null && b.weight != null ? Math.round((Number(b.weight) - Number(a.weight)) * 10) / 10 : null
  const dE = a.energy_level != null && b.energy_level != null ? b.energy_level - a.energy_level : null

  return (
    <StatCard>
      <CardHeader icon={GitCompare} title="Comparador antes / después" />
      <View style={styles.compRow}>
        <CompCol label="Antes" c={a} onOpen={() => onOpenPhoto([a.front_photo_url!], 0)} />
        <CompCol label="Después" c={b} onOpen={() => onOpenPhoto([b.front_photo_url!], 0)} />
      </View>
      <View style={cd.grid2}>
        {dW != null ? <MetricBox value={`${dW > 0 ? '+' : ''}${dW} kg`} label="Δ peso" color={dW > 0 ? '#EF4444' : theme.success} /> : null}
        {dE != null ? <MetricBox value={`${dE > 0 ? '+' : ''}${dE}`} label="Δ energía" color={dE >= 0 ? theme.success : '#EF4444'} /> : null}
      </View>
      <Text style={[styles.compHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Antes</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
        {withPhoto.map((c, i) => (
          <SelChip key={`a${c.id}`} label={formatDate(c.date)} on={i === aIdx} onPress={() => setAIdx(i)} />
        ))}
      </ScrollView>
      <Text style={[styles.compHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Después</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
        {withPhoto.map((c, i) => (
          <SelChip key={`b${c.id}`} label={formatDate(c.date)} on={i === bIdx} onPress={() => setBIdx(i)} />
        ))}
      </ScrollView>
    </StatCard>
  )
}

function CompCol({ label, c, onOpen }: { label: string; c: CheckInEntry; onOpen: () => void }) {
  const { theme } = useTheme()
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <Text style={[styles.compLabel, { color: theme.mutedForeground, fontFamily: 'HankenGrotesk_700Bold' }]}>{label}</Text>
      <TouchableOpacity activeOpacity={0.85} onPress={onOpen}>
        <Image source={{ uri: c.front_photo_url! }} style={[styles.compPhoto, { borderColor: theme.border }]} contentFit="cover" transition={150} />
      </TouchableOpacity>
      <Text style={[styles.compMeta, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>{c.weight != null ? `${c.weight} kg` : '—'}</Text>
      <Text style={[styles.compMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{formatDate(c.date)}</Text>
    </View>
  )
}

function SelChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { theme } = useTheme()
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.selChip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '1A' : 'transparent' }]}>
      <Text style={{ fontSize: 11.5, fontFamily: 'HankenGrotesk_600SemiBold', color: on ? theme.primary : theme.mutedForeground }}>{label}</Text>
    </TouchableOpacity>
  )
}

function CheckInRow({ c, onOpenPhoto }: { c: CheckInEntry; onOpenPhoto: (photos: string[], index: number) => void }) {
  const { theme } = useTheme()
  const photos = [c.front_photo_url, c.side_photo_url, c.back_photo_url].filter(Boolean) as string[]
  return (
    <View style={[styles.ciCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <View style={cd.headerRow}>
        <Text style={[styles.ciDate, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>{formatDate(c.date)}</Text>
        {c.weight != null ? <Text style={[styles.ciWeight, { color: theme.primary, fontFamily: 'Archivo_700Bold' }]}>{c.weight} kg</Text> : null}
      </View>
      {c.energy_level != null ? (
        <View style={styles.ciEnergyRow}>
          <Text style={[styles.ciEnergyLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Energía</Text>
          <View style={[styles.ciEnergyTrack, { backgroundColor: theme.muted }]}>
            <View style={{ width: `${(c.energy_level / 10) * 100}%`, height: '100%', borderRadius: 99, backgroundColor: energyColorHex(c.energy_level) }} />
          </View>
          <Text style={[styles.ciEnergyVal, { color: theme.foreground, fontFamily: theme.fontSans }]}>{c.energy_level}/10</Text>
        </View>
      ) : null}
      {c.notes ? <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{c.notes}</Text> : null}
      {photos.length ? (
        <View style={styles.ciPhotos}>
          {photos.map((p, i) => (
            <TouchableOpacity key={i} activeOpacity={0.85} onPress={() => onOpenPhoto(photos, i)}>
              <Image source={{ uri: p }} style={styles.ciPhoto} contentFit="cover" transition={150} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  )
}

// ── Composición corporal ─────────────────────────────────────────────────────
// Sección del módulo de pago `body_composition` dentro del tab Progreso, espejo del
// CompositionSection web (ProgressBodyCompositionB6). Solo se MONTA cuando hasModule es true
// (money-safety: sin módulo => cero fetch, cero render — el padre no renderiza este componente).
// Lectura read-only por PostgREST (RLS bcm_select = techo: el coach solo ve a SUS alumnos); las
// MUTACIONES viven en la pantalla /coach/bodycomp/[clientId] (endpoints /api/mobile/bodycomp/*).
// Las series NUNCA se mezclan entre métodos (el % grasa BIA e ISAK no es comparable).

type BodyCompMethod = 'bia' | 'isak'
interface BodyCompRow {
  id: string
  method: BodyCompMethod
  measured_at: string
  weight_kg: number | null
  height_cm: number | null
  device_brand: string | null
  device_model: string | null
  equation_used: string | null
  metrics: unknown
  notes: string | null
}

const BC_COLUMNS = 'id, method, measured_at, weight_kg, height_cm, device_brand, device_model, equation_used, metrics, notes'

function readBia(row: BodyCompRow): BiaMetrics {
  return row.method === 'bia' && row.metrics && typeof row.metrics === 'object' ? (row.metrics as BiaMetrics) : {}
}
function readIsak(row: BodyCompRow): IsakResult | null {
  if (row.method !== 'isak') return null
  const m = row.metrics as Partial<IsakResult> | null
  return m && typeof m === 'object' && m.fractionation ? (m as IsakResult) : null
}
function bcDeviceLabel(row: BodyCompRow): string {
  const dev = [row.device_brand, row.device_model].filter(Boolean).join(' ')
  return dev ? `${dev} · ${formatDate(row.measured_at)}` : formatDate(row.measured_at)
}

function CompositionSection({ clientId, hasModule }: { clientId: string; hasModule: boolean }) {
  const { theme } = useTheme()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<BodyCompRow[]>([])

  useEffect(() => {
    // Guard de money-safety: aunque el padre solo monta con módulo ON, no pegamos a DB sin él.
    if (!hasModule) {
      setRows([])
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    ;(async () => {
      const { data } = await supabase
        .from('body_composition_measurements')
        .select(BC_COLUMNS)
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .order('measured_at', { ascending: false })
      if (!alive) return
      setRows(Array.isArray(data) ? (data as unknown as BodyCompRow[]) : [])
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [clientId, hasModule])

  const bia = useMemo(() => rows.filter((r) => r.method === 'bia'), [rows])
  const isak = useMemo(() => rows.filter((r) => r.method === 'isak'), [rows])
  const hasBia = bia.length > 0
  const hasIsak = isak.length > 0
  const [method, setMethod] = useState<BodyCompMethod>('bia')
  // Alinear el método visible con lo que tenga datos (BIA prioritario), sin pisar la elección manual.
  useEffect(() => {
    if (!hasBia && !hasIsak) return
    setMethod((m) => (m === 'bia' ? (hasBia ? 'bia' : 'isak') : hasIsak ? 'isak' : 'bia'))
  }, [hasBia, hasIsak])

  const goCapture = () => router.push(`/coach/bodycomp/${clientId}`)

  if (!hasModule) {
    return (
      <StatCard>
        <CardHeader icon={Ruler} title="Composición corporal" />
        <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>El módulo de composición corporal está desactivado.</Text>
        <Button label="Desbloquear" variant="outline" onPress={() => router.push('/coach/(tabs)/settings')} style={{ marginTop: 4 }} />
      </StatCard>
    )
  }

  if (loading) {
    return (
      <StatCard>
        <CardHeader icon={Ruler} title="Composición corporal" />
        <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Cargando mediciones…</Text>
      </StatCard>
    )
  }

  if (!hasBia && !hasIsak) {
    return (
      <StatCard>
        <CardHeader icon={Ruler} title="Composición corporal" right={<Pill label="Módulo" tone="success" />} />
        <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Sin mediciones todavía. Captura bioimpedancia (BIA) o antropometría (ISAK) para ver la evolución.
        </Text>
        <Button label="Nueva medición" onPress={goCapture} testID="progreso-bodycomp-new" style={{ marginTop: 4 }} />
      </StatCard>
    )
  }

  const showBia = hasBia && (method === 'bia' || !hasIsak)
  const series = showBia ? bia : isak

  // Puntos de tendencia del % grasa (serie primaria) — ascendente por fecha, sin mezclar métodos.
  const asc = [...series].sort((a, b) => a.measured_at.localeCompare(b.measured_at))
  const fatOf = (r: BodyCompRow): number | null => {
    if (showBia) return readBia(r).bodyFatPercent ?? null
    return readIsak(r)?.bodyFat.percent ?? null
  }
  const points: AreaPoint[] = []
  for (const r of asc) {
    const y = fatOf(r)
    if (y != null) points.push({ i: points.length, y, label: formatDate(r.measured_at) })
  }

  const latest = series[0]!
  const prev = series[1] ?? null

  return (
    <StatCard>
      <CardHeader icon={Ruler} title="Composición corporal" right={<Pill label={bcDeviceLabel(latest)} />} />

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

      {showBia ? <BiaTiles latest={readBia(latest)} prev={prev ? readBia(prev) : null} /> : <IsakTiles latest={readIsak(latest)} prev={prev ? readIsak(prev) : null} />}

      {points.length >= 2 ? (
        <View style={{ gap: 4 }}>
          <Text style={[cd.listHeading, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>% Grasa · tendencia</Text>
          <AreaTrend points={points} color={theme.primary} suffix="%" decimals={1} height={160} />
        </View>
      ) : null}

      <Button label="Nueva medición" variant="secondary" onPress={goCapture} testID="progreso-bodycomp-new" />
    </StatCard>
  )
}

function deltaTile(delta: number | null, lowerIsBetter: boolean, theme: ReturnType<typeof useTheme>['theme']): { sub?: string; subColor?: string } {
  if (delta == null || Math.abs(delta) < 0.05) return {}
  const good = lowerIsBetter ? delta < 0 : delta > 0
  return { sub: `${delta > 0 ? '+' : ''}${delta.toFixed(1)} vs. anterior`, subColor: good ? theme.success : '#EF4444' }
}

function BiaTiles({ latest, prev }: { latest: BiaMetrics; prev: BiaMetrics | null }) {
  const { theme } = useTheme()
  const dFat = latest.bodyFatPercent != null && prev?.bodyFatPercent != null ? Math.round((latest.bodyFatPercent - prev.bodyFatPercent) * 10) / 10 : null
  const dMus = latest.skeletalMuscleMassKg != null && prev?.skeletalMuscleMassKg != null ? Math.round((latest.skeletalMuscleMassKg - prev.skeletalMuscleMassKg) * 10) / 10 : null
  const visceral = latest.visceralFatLevel ?? latest.visceralFatAreaCm2 ?? null
  return (
    <View style={cd.grid2}>
      {latest.bodyFatPercent != null ? <MetricBox value={`${latest.bodyFatPercent.toFixed(1)}%`} label="% Grasa" {...deltaTile(dFat, true, theme)} /> : null}
      {latest.skeletalMuscleMassKg != null ? <MetricBox value={`${latest.skeletalMuscleMassKg.toFixed(1)} kg`} label="Masa muscular" {...deltaTile(dMus, false, theme)} /> : null}
      {latest.phaseAngleDeg != null ? <MetricBox value={`${latest.phaseAngleDeg.toFixed(1)}°`} label="Ángulo de fase" /> : null}
      {visceral != null ? <MetricBox value={`${visceral}`} label="Grasa visceral" /> : null}
    </View>
  )
}

function IsakTiles({ latest, prev }: { latest: IsakResult | null; prev: IsakResult | null }) {
  const { theme } = useTheme()
  if (!latest) return null
  const s = latest.somatotype
  const dFat = prev ? Math.round((latest.bodyFat.percent - prev.bodyFat.percent) * 10) / 10 : null
  const dMus = prev ? Math.round((latest.fractionation.muscle.kg - prev.fractionation.muscle.kg) * 10) / 10 : null
  return (
    <View style={cd.grid2}>
      <MetricBox value={`${latest.bodyFat.percent.toFixed(1)}%`} label="% Grasa" {...deltaTile(dFat, true, theme)} />
      <MetricBox value={`${latest.fractionation.muscle.kg.toFixed(1)} kg`} label="Masa muscular" {...deltaTile(dMus, false, theme)} />
      <MetricBox value={`${latest.fractionation.adipose.kg.toFixed(1)} kg`} label="Masa adiposa" />
      <MetricBox value={`${s.endomorphy.toFixed(1)}-${s.mesomorphy.toFixed(1)}-${s.ectomorphy.toFixed(1)}`} label="Somatotipo" sub="endo·meso·ecto" />
    </View>
  )
}

const styles = StyleSheet.create({
  goalTrigger: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goalAdd: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  tooltip: { flexDirection: 'row', gap: 10, borderWidth: 1, padding: 10 },
  tipPhoto: { width: 48, height: 60, borderRadius: 8, borderWidth: 1 },
  tipDate: { fontSize: 13 },
  tipMeta: { fontSize: 12 },
  bmiValue: { fontSize: 30, letterSpacing: -0.5 },
  bmiTrack: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', position: 'relative' },
  bmiMarker: { position: 'absolute', top: -4, width: 5, height: 20, borderRadius: 3, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#0F172A', marginLeft: -2.5 },
  bmiLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  bmiLabel: { fontSize: 9.5 },
  compRow: { flexDirection: 'row', gap: 14 },
  compLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  compPhoto: { width: 120, height: 150, borderRadius: 12, borderWidth: 1 },
  compMeta: { fontSize: 12 },
  compHint: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 },
  chipScroll: { gap: 6 },
  selChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  ciCard: { borderWidth: 1, padding: 14, gap: 8 },
  ciDate: { fontSize: 14 },
  ciWeight: { fontSize: 15 },
  ciEnergyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ciEnergyLabel: { fontSize: 12, width: 54 },
  ciEnergyTrack: { flex: 1, height: 6, borderRadius: 99, overflow: 'hidden' },
  ciEnergyVal: { fontSize: 12, width: 38, textAlign: 'right' },
  ciPhotos: { flexDirection: 'row', gap: 8, marginTop: 2 },
  ciPhoto: { width: 64, height: 80, borderRadius: 10 },
})
