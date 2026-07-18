import { useCallback, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Pencil } from 'lucide-react-native'
import {
  formatDuration,
  formatPace,
  hrZonesFromMax,
  hrZonesKarvonen,
  kmhFromPace,
  maxHrTanaka,
  paceKmToMile,
  paceToTimeSec,
  resolveClientZones,
  ageFromBirthDate,
  type ResolvedClientZones,
} from '@eva/cardio'
import { INTERVAL_TEMPLATES, intervalTotalDurationSec } from '@eva/workout-engine'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { useEntitlements } from '../../../lib/entitlements'
import { listCardioClients, type CardioClientRow } from '../../../lib/cardio-coach'
import { AppBackground } from '../../../components/AppBackground'
import { Badge, type BadgeTone } from '../../../components/Badge'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { ModuleOffNotice } from '../../../components/ModuleOffNotice'
import { Select } from '../../../components/Select'
import { SegmentedTabs } from '../../../components/SegmentedTabs'
import { CardioHeader, CardioZoneList } from '../../../components/coach/CardioShared'

/**
 * Hub del modulo Cardio (E6-03) — espejo mobile de `apps/web/.../coach/cardio`
 * (CardioToolsClient). Tres herramientas en SegmentedTabs: Zonas (Tanaka/Karvonen por
 * alumno o manual), Pace (conversiones) y Plantillas (INTERVAL_TEMPLATES del sistema).
 * Todo el calculo es client-side puro con @eva/cardio + @eva/workout-engine (misma fuente
 * de verdad que la web, sin drift). Gate `hasModule('cardio')` + ModuleOffNotice; sin el
 * modulo NO se listan alumnos (cero fetch). Empty-state con 0 alumnos: cae al calculo
 * manual (NO hereda el crash web con 0 alumnos — memoria module_page_crash_no_clients).
 */

type Tool = 'zonas' | 'pace' | 'plantillas'

/** Tono de Badge por zona sugerida de una plantilla (aqua → danger). */
const TEMPLATE_ZONE_TONE: Record<number, BadgeTone> = { 1: 'aqua', 2: 'success', 3: 'sport', 4: 'warning', 5: 'danger' }

/** mm:ss desde segundos (referencia de 5K del perfil). */
function formatRef5k(sec: number | null): string {
  if (sec == null || sec <= 0) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function parsePaceStr(str: string): number | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(str.trim())
  if (match) return parseInt(match[1], 10) * 60 + parseInt(match[2], 10)
  const n = parseInt(str.trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export default function CardioHubScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const { hasModule, ready } = useEntitlements()
  const enabled = hasModule('cardio')

  const [tool, setTool] = useState<Tool>('zonas')
  const [clients, setClients] = useState<CardioClientRow[]>([])
  const [loadingClients, setLoadingClients] = useState(true)

  // Recarga al enfocar → tras editar un perfil (volver de [clientId]) el resumen/zonas se
  // actualizan. Sin modulo NO se pega a la DB (money-safety: cero fetch).
  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setLoadingClients(false)
        return
      }
      let cancelled = false
      void (async () => {
        setLoadingClients(true)
        try {
          const rows = await listCardioClients()
          if (!cancelled) setClients(rows)
        } finally {
          if (!cancelled) setLoadingClients(false)
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
      <CardioHeader title="Cardio" subtitle="Herramientas" onBack={() => router.back()} showBadge />
      {!ready ? (
        <EvaLoaderScreen subtitle="Cargando…" />
      ) : !enabled ? (
        <ModuleOffNotice moduleKey="cardio" />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <SegmentedTabs
            items={[
              { value: 'zonas', label: 'Zonas' },
              { value: 'pace', label: 'Pace' },
              { value: 'plantillas', label: 'Plantillas' },
            ]}
            value={tool}
            onChange={setTool}
          />
          {tool === 'zonas' ? (
            <ZonesTool
              clients={clients}
              loading={loadingClients}
              onEditProfile={(id) => router.push(`/coach/cardio/${id}`)}
            />
          ) : tool === 'pace' ? (
            <PaceTool />
          ) : (
            <TemplatesTool />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

/* ── Tool · Zonas de frecuencia cardiaca ─────────────────────────────────────── */
function ZonesTool({
  clients,
  loading,
  onEditProfile,
}: {
  clients: CardioClientRow[]
  loading: boolean
  onEditProfile: (clientId: string) => void
}) {
  const { theme } = useTheme()
  const [selectedId, setSelectedId] = useState('')
  const [manualAge, setManualAge] = useState('40')
  const [manualResting, setManualResting] = useState('')

  const selected = clients.find((c) => c.id === selectedId) ?? null

  const options = useMemo(
    () => [
      { value: '', label: 'Cálculo manual' },
      ...clients.map((c) => ({ value: c.id, label: c.full_name ?? 'Sin nombre' })),
    ],
    [clients],
  )

  const zonesResult = useMemo<ResolvedClientZones | null>(() => {
    if (selected) {
      return resolveClientZones({
        birthDate: selected.birth_date,
        restingHr: selected.resting_hr,
        maxHrOverride: selected.max_hr_override,
      })
    }
    const age = parseInt(manualAge, 10)
    if (!Number.isFinite(age) || age <= 0 || age > 110) return null
    const maxHr = maxHrTanaka(age)
    const resting = parseInt(manualResting, 10)
    if (Number.isFinite(resting) && resting >= 25 && resting < maxHr) {
      return { maxHr, maxHrMethod: 'tanaka', zoneMethod: 'karvonen', restingHr: resting, zones: hrZonesKarvonen(maxHr, resting) }
    }
    return { maxHr, maxHrMethod: 'tanaka', zoneMethod: 'percent_max', restingHr: null, zones: hrZonesFromMax(maxHr) }
  }, [selected, manualAge, manualResting])

  return (
    <View style={styles.toolBody}>
      <Card padding="md" style={{ gap: 12 }}>
        <Select
          label="Alumno"
          title="Elegir alumno"
          value={selectedId}
          onValueChange={setSelectedId}
          options={options}
          searchable={clients.length > 6}
        />
        {!loading && clients.length === 0 ? (
          <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
            Aún no tienes alumnos. Usa el cálculo manual o agrégalos desde Alumnos.
          </Text>
        ) : null}

        {!selected ? (
          <View style={styles.manualRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: FONT.uiSemibold }]}>Edad</Text>
              <TextInput
                testID="cardio-manual-age"
                value={manualAge}
                onChangeText={(t) => /^\d*$/.test(t) && setManualAge(t)}
                keyboardType="number-pad"
                placeholderTextColor={theme.mutedForeground}
                style={[styles.numInput, { borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: FONT.uiSemibold }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: FONT.uiSemibold }]}>
                FC reposo <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui }}>(opc.)</Text>
              </Text>
              <TextInput
                testID="cardio-manual-resting"
                value={manualResting}
                onChangeText={(t) => /^\d*$/.test(t) && setManualResting(t)}
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor={theme.mutedForeground}
                style={[styles.numInput, { borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: FONT.uiSemibold }]}
              />
            </View>
          </View>
        ) : (
          <View style={[styles.summary, { backgroundColor: theme.secondary }]}>
            <SummaryStat label="Edad" value={ageFromBirthDate(selected.birth_date)?.toString() ?? '—'} />
            <SummaryStat label="FC reposo" value={selected.resting_hr?.toString() ?? '—'} />
            <SummaryStat label="FC máx" value={selected.max_hr_override?.toString() ?? '—'} />
            <SummaryStat label="Ref 5K" value={formatRef5k(selected.ref_5k_time_sec)} mono />
          </View>
        )}
      </Card>

      {zonesResult ? (
        <Card padding="md">
          <View style={styles.resultHead}>
            <Text style={[styles.maxHr, { color: theme.foreground, fontFamily: FONT.displayBlack }]}>
              {zonesResult.maxHr}
              <Text style={[styles.maxHrUnit, { color: theme.mutedForeground, fontFamily: FONT.uiSemibold }]}> bpm máx</Text>
            </Text>
            <Text style={[styles.method, { color: theme.mutedForeground, fontFamily: FONT.uiSemibold }]}>
              {zonesResult.maxHrMethod === 'override' ? 'FC máx medida' : 'Tanaka'}
              {'\n'}
              {zonesResult.zoneMethod === 'karvonen' ? `Karvonen (reposo ${zonesResult.restingHr})` : '%FC máx'}
            </Text>
          </View>
          <CardioZoneList zones={zonesResult.zones} />
          {selected ? (
            <Button
              label="Editar perfil cardio"
              variant="secondary"
              leftIcon={Pencil}
              onPress={() => onEditProfile(selected.id)}
              style={{ marginTop: 14 }}
              testID="cardio-edit-profile"
            />
          ) : null}
        </Card>
      ) : (
        <Card padding="lg">
          {selected ? (
            <View style={{ gap: 14, alignItems: 'center' }}>
              <Text style={[styles.emptyTxt, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
                Sin edad ni FC máx no se pueden derivar zonas — completa el perfil del alumno.
              </Text>
              <Button
                label="Editar perfil cardio"
                variant="sport"
                leftIcon={Pencil}
                onPress={() => onEditProfile(selected.id)}
                testID="cardio-edit-profile-empty"
              />
            </View>
          ) : (
            <Text style={[styles.emptyTxt, { color: theme.mutedForeground, fontFamily: FONT.ui, textAlign: 'center' }]}>
              Ingresa una edad válida para calcular las zonas.
            </Text>
          )}
        </Card>
      )}
    </View>
  )
}

function SummaryStat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { theme } = useTheme()
  return (
    <View style={styles.summaryStat}>
      <Text style={[styles.summaryLabel, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: theme.foreground, fontFamily: mono ? FONT.monoBold : FONT.uiBold }]}>{value}</Text>
    </View>
  )
}

/* ── Tool · Calculadora de pace ──────────────────────────────────────────────── */
function PaceTool() {
  const { theme } = useTheme()
  const [paceStr, setPaceStr] = useState('5:00')
  const [distanceKm, setDistanceKm] = useState('5')

  const paceSec = parsePaceStr(paceStr)
  const distKm = parseFloat(distanceKm.replace(',', '.'))
  const paceValid = paceSec != null && Number.isFinite(distKm) && distKm > 0

  const metrics: [string, string][] = paceValid && paceSec != null
    ? [
        ['Tiempo total', formatDuration(paceToTimeSec(paceSec, distKm))],
        ['Velocidad', `${kmhFromPace(paceSec)} km/h`],
        ['Pace / milla', `${formatPace(paceKmToMile(paceSec))} /mi`],
        ['Pace / km', `${formatPace(paceSec)} /km`],
      ]
    : []

  return (
    <View style={styles.toolBody}>
      <Card padding="md">
        <View style={styles.manualRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: FONT.uiSemibold }]}>Pace (min/km)</Text>
            <TextInput
              testID="cardio-pace-input"
              value={paceStr}
              onChangeText={setPaceStr}
              placeholder="5:00"
              placeholderTextColor={theme.mutedForeground}
              keyboardType="numbers-and-punctuation"
              style={[styles.numInput, { borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: FONT.monoMedium }]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: FONT.uiSemibold }]}>Distancia (km)</Text>
            <TextInput
              testID="cardio-distance-input"
              value={distanceKm}
              onChangeText={setDistanceKm}
              keyboardType="decimal-pad"
              placeholderTextColor={theme.mutedForeground}
              style={[styles.numInput, { borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: FONT.monoMedium }]}
            />
          </View>
        </View>
      </Card>
      {paceValid ? (
        <View style={styles.metricGrid}>
          {metrics.map(([label, value]) => (
            <Card key={label} padding="md" style={styles.metricCard}>
              <Text style={[styles.metricLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>{label.toUpperCase()}</Text>
              <Text style={[styles.metricValue, { color: theme.foreground, fontFamily: FONT.displayBlack }]}>{value}</Text>
            </Card>
          ))}
        </View>
      ) : (
        <Card padding="lg">
          <Text style={[styles.emptyTxt, { color: theme.mutedForeground, fontFamily: FONT.ui, textAlign: 'center' }]}>
            Pace en formato m:ss y distancia mayor a 0.
          </Text>
        </Card>
      )}
    </View>
  )
}

/* ── Tool · Plantillas de intervalos ─────────────────────────────────────────── */
function TemplatesTool() {
  const { theme } = useTheme()
  return (
    <View style={styles.toolBody}>
      <Text style={[styles.templatesIntro, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
        Plantillas del sistema. Se aplican al prescribir un bloque cardio en el builder.
      </Text>
      {INTERVAL_TEMPLATES.map((tpl) => {
        const total = intervalTotalDurationSec(tpl.config)
        return (
          <Card key={tpl.id} padding="md" style={{ gap: 5 }}>
            <View style={styles.tplHead}>
              <Text style={[styles.tplName, { color: theme.foreground, fontFamily: FONT.uiBold }]} numberOfLines={1}>
                {tpl.name}
              </Text>
              {tpl.suggestedHrZone ? (
                <Badge tone={TEMPLATE_ZONE_TONE[tpl.suggestedHrZone] ?? 'sport'} variant="soft" size="sm">
                  Z{tpl.suggestedHrZone}
                </Badge>
              ) : null}
            </View>
            <Text style={[styles.tplDesc, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>{tpl.description}</Text>
            <Text style={[styles.tplMeta, { color: theme.textSecondary, fontFamily: FONT.mono }]}>
              {total > 0 ? `~${formatDuration(total)} cronometrables` : 'por distancia'}
            </Text>
          </Card>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 14 },
  toolBody: { gap: 14 },
  hint: { fontSize: 12, lineHeight: 17 },
  manualRow: { flexDirection: 'row', gap: 10 },
  fieldLabel: { fontSize: 12, marginBottom: 6 },
  numInput: { height: 46, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, fontSize: 15 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, columnGap: 18, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  summaryStat: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  summaryLabel: { fontSize: 12.5 },
  summaryValue: { fontSize: 13 },
  resultHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  maxHr: { fontSize: 30, letterSpacing: -0.9 },
  maxHrUnit: { fontSize: 13, letterSpacing: 0 },
  method: { fontSize: 11, lineHeight: 15, textAlign: 'right' },
  emptyTxt: { fontSize: 13.5, lineHeight: 20 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: { flexGrow: 1, flexBasis: '46%', gap: 6 },
  metricLabel: { fontSize: 11, letterSpacing: 0.5 },
  metricValue: { fontSize: 22, letterSpacing: -0.7 },
  templatesIntro: { fontSize: 12.5, lineHeight: 18 },
  tplHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  tplName: { flex: 1, fontSize: 15 },
  tplDesc: { fontSize: 13, lineHeight: 18 },
  tplMeta: { fontSize: 11.5 },
})
