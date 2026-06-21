import { useEffect, useMemo, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, HeartPulse, Lock, Pencil, Timer, Users } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { ScreenHeader, Button } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { hasModule } from '../../../lib/entitlements'
import { listCardioClients, type CardioClientRow } from '../../../lib/cardio-data'
import {
  ageFromBirthDate,
  formatDuration,
  formatPace,
  hrZonesFromMax,
  hrZonesKarvonen,
  intervalTotalDurationSec,
  kmhFromPace,
  maxHrClassic,
  maxHrTanaka,
  paceKmToMile,
  paceToTimeSec,
  parsePaceStr,
  resolveClientZones,
  ZONE_DESCRIPTIONS,
  INTERVAL_TEMPLATES,
  type ResolvedClientZones,
} from '../../../lib/cardio'

export default function CardioHubScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [entitled, setEntitled] = useState(false)
  const [clients, setClients] = useState<CardioClientRow[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [manualAge, setManualAge] = useState('30')
  const [manualResting, setManualResting] = useState('')
  const [paceStr, setPaceStr] = useState('5:00')
  const [distanceKm, setDistanceKm] = useState('5')

  useEffect(() => {
    ;(async () => {
      try {
        const ok = await hasModule('cardio')
        setEntitled(ok)
        if (ok) setClients(await listCardioClients())
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const selected = clients.find((c) => c.id === selectedId) ?? null

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

  const classicRef = useMemo(() => {
    const age = selected ? ageFromBirthDate(selected.birth_date) : parseInt(manualAge, 10)
    return age != null && Number.isFinite(age) && age > 0 && age <= 110 ? maxHrClassic(age) : null
  }, [selected, manualAge])

  const paceSec = parsePaceStr(paceStr)
  const distKm = parseFloat(distanceKm.replace(',', '.'))
  const paceValid = paceSec != null && Number.isFinite(distKm) && distKm > 0

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando cardio…" />
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
      <ScreenHeader title="Cardio" subtitle="Zonas FC · pace · intervalos" />

      {!entitled ? (
        <View style={styles.offWrap}>
          <View style={[styles.offCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
            <Lock size={26} color={theme.mutedForeground} />
            <Text style={[styles.offTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Módulo no habilitado</Text>
            <Text style={[styles.offText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Cardio es un módulo de pago. Activalo desde la web para usar las zonas de frecuencia cardiaca, el calculador de pace y las plantillas de intervalos.
            </Text>
            <Button label="Ver en la web" onPress={() => Linking.openURL('https://eva-app.cl/coach/subscription').catch(() => {})} full />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* ── Zonas FC ── */}
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
            <View style={styles.sectionHead}>
              <HeartPulse size={18} color={theme.primary} />
              <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Zonas de frecuencia cardiaca</Text>
            </View>

            <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>ALUMNO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <SelChip theme={theme} label="Cálculo manual" active={selectedId === ''} onPress={() => setSelectedId('')} />
              {clients.map((c) => (
                <SelChip key={c.id} theme={theme} label={c.full_name ?? 'Sin nombre'} active={selectedId === c.id} onPress={() => setSelectedId(c.id)} />
              ))}
            </ScrollView>

            {!selected ? (
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>EDAD</Text>
                  <TextInput
                    value={manualAge}
                    onChangeText={(v) => /^\d*$/.test(v) && setManualAge(v)}
                    keyboardType="number-pad"
                    style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans }]}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>FC REPOSO (OPCIONAL)</Text>
                  <TextInput
                    value={manualResting}
                    onChangeText={(v) => /^\d*$/.test(v) && setManualResting(v)}
                    keyboardType="number-pad"
                    placeholder="60"
                    placeholderTextColor={theme.mutedForeground}
                    style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans }]}
                  />
                </View>
              </View>
            ) : (
              <View style={[styles.selInfo, { borderColor: theme.border }]}>
                <Text style={[styles.selInfoText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  {selected.birth_date
                    ? `Edad ${ageFromBirthDate(selected.birth_date) ?? '—'} · FC reposo ${selected.resting_hr ?? '—'}${selected.max_hr_override ? ` · FCmax ${selected.max_hr_override}` : ''}`
                    : 'Sin fecha de nacimiento registrada.'}
                </Text>
                <TouchableOpacity
                  onPress={() => router.push(`/coach/cardio/${selected.id}`)}
                  style={[styles.editBtn, { borderColor: theme.primary }]}
                  activeOpacity={0.8}
                >
                  <Pencil size={12} color={theme.primary} />
                  <Text style={[styles.editBtnText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Editar perfil</Text>
                </TouchableOpacity>
              </View>
            )}

            {zonesResult ? (
              <>
                <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  FCmax <Text style={{ color: theme.foreground, fontFamily: 'Montserrat_700Bold' }}>{zonesResult.maxHr} bpm</Text>{' '}
                  ({zonesResult.maxHrMethod === 'override' ? 'medida' : 'Tanaka'})
                  {classicRef != null && zonesResult.maxHrMethod !== 'override' ? ` · clásica ${classicRef}` : ''}
                  {' · '}{zonesResult.zoneMethod === 'karvonen' ? `Karvonen (reposo ${zonesResult.restingHr})` : '%FCmax'}
                </Text>
                <View style={styles.zoneGrid}>
                  {zonesResult.zones.map((z) => (
                    <View key={z.zone} style={[styles.zoneCard, { borderColor: theme.border }]}>
                      <Text style={[styles.zoneTag, { color: theme.primary, fontFamily: 'Montserrat_800ExtraBold' }]}>Z{z.zone}</Text>
                      <Text style={[styles.zoneRange, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{z.minBpm}–{z.maxBpm}</Text>
                      <Text style={[styles.zoneDesc, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{ZONE_DESCRIPTIONS[z.zone]}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {selected ? 'Sin fecha de nacimiento ni FCmax no se derivan zonas — editá el perfil.' : 'Ingresá una edad válida.'}
              </Text>
            )}
          </View>

          {/* ── Pace ── */}
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
            <View style={styles.sectionHead}>
              <Timer size={18} color={theme.primary} />
              <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Pace · tiempo · velocidad</Text>
            </View>
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>PACE (MIN/KM)</Text>
                <TextInput
                  value={paceStr}
                  onChangeText={setPaceStr}
                  placeholder="5:00"
                  placeholderTextColor={theme.mutedForeground}
                  style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans }]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>DISTANCIA (KM)</Text>
                <TextInput
                  value={distanceKm}
                  onChangeText={setDistanceKm}
                  keyboardType="decimal-pad"
                  style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans }]}
                />
              </View>
            </View>
            {paceValid && paceSec != null ? (
              <View style={styles.metricGrid}>
                <Metric theme={theme} label="Tiempo total" value={formatDuration(paceToTimeSec(paceSec, distKm))} />
                <Metric theme={theme} label="Velocidad" value={`${kmhFromPace(paceSec)} km/h`} />
                <Metric theme={theme} label="Pace /milla" value={`${formatPace(paceKmToMile(paceSec))}`} />
                <Metric theme={theme} label="Pace /km" value={`${formatPace(paceSec)}`} />
              </View>
            ) : (
              <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Pace en formato m:ss y distancia mayor a 0.</Text>
            )}
          </View>

          {/* ── Plantillas ── */}
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
            <View style={styles.sectionHead}>
              <Users size={18} color={theme.primary} />
              <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Plantillas de intervalos</Text>
            </View>
            <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Disponibles en el builder al prescribir un bloque cardio.
            </Text>
            {INTERVAL_TEMPLATES.map((tpl) => {
              const total = intervalTotalDurationSec(tpl.config)
              return (
                <View key={tpl.id} style={[styles.tplCard, { borderColor: theme.border }]}>
                  <Text style={[styles.tplName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{tpl.name}</Text>
                  <Text style={[styles.tplDesc, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{tpl.description}</Text>
                  <Text style={[styles.tplMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    {tpl.suggestedHrZone ? `Zona sugerida Z${tpl.suggestedHrZone}` : 'Sin zona sugerida'}
                    {total > 0 ? ` · ~${formatDuration(total)} cronometrables` : ' · por distancia'}
                  </Text>
                </View>
              )
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function SelChip({ theme, label, active, onPress }: { theme: any; label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={[styles.selChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary + '14' : 'transparent' }]}>
      <Text numberOfLines={1} style={{ fontSize: 12.5, fontFamily: 'Inter_600SemiBold', color: active ? theme.primary : theme.mutedForeground }}>{label}</Text>
    </TouchableOpacity>
  )
}

function Metric({ theme, label, value }: { theme: any; label: string; value: string }) {
  return (
    <View style={[styles.metric, { borderColor: theme.border }]}>
      <Text style={[styles.metricLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backRow: { paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, alignSelf: 'flex-start' },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 14 },
  section: { padding: 16, borderWidth: 1, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase' },
  fieldLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  chipRow: { gap: 8, paddingVertical: 2 },
  selChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, maxWidth: 200 },
  row2: { flexDirection: 'row', gap: 12 },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15, textAlign: 'center' },
  selInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  selInfoText: { flex: 1, fontSize: 12, lineHeight: 16 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  editBtnText: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  hint: { fontSize: 12, lineHeight: 17 },
  zoneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  zoneCard: { flexGrow: 1, flexBasis: '18%', minWidth: 58, borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', gap: 2 },
  zoneTag: { fontSize: 10, letterSpacing: 1 },
  zoneRange: { fontSize: 13 },
  zoneDesc: { fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexGrow: 1, flexBasis: '46%', borderWidth: 1, borderRadius: 10, padding: 10, alignItems: 'center', gap: 2 },
  metricLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3 },
  metricValue: { fontSize: 15 },
  tplCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 3 },
  tplName: { fontSize: 14 },
  tplDesc: { fontSize: 12, lineHeight: 16 },
  tplMeta: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },
  offWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  offCard: { borderWidth: 1, padding: 24, alignItems: 'center', gap: 12 },
  offTitle: { fontSize: 18 },
  offText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
})
