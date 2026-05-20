import { useEffect, useRef, useState } from 'react'
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { ChevronDown, ChevronUp, Droplets } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../context/ThemeContext'
import { upsertDailyHabits } from '../lib/habits.queries'
import type { HabitsData } from '../lib/habits.queries'

const WATER_OPTIONS = [250, 500, 750, 1000, 1500, 2000, 2500, 3000]
const SLEEP_OPTIONS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]
const FASTING_OPTIONS = [12, 14, 16, 18, 20, 24]
const SUPPLEMENT_OPTIONS = ['Creatina', 'Proteína', 'Omega-3', 'Vitamina D', 'Magnesio', 'Zinc', 'Multivitamínico']

interface Props {
  clientId: string
  logDate: string
  isToday: boolean
  initialData: HabitsData | null
}

export function HabitsTracker({ clientId, logDate, isToday, initialData }: Props) {
  const { theme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [water, setWater] = useState(initialData?.water_ml ?? null)
  const [sleep, setSleep] = useState(initialData?.sleep_hours ?? null)
  const [fasting, setFasting] = useState(initialData?.fasting_hours ?? null)
  const [steps, setSteps] = useState(initialData?.steps?.toString() ?? '')
  const [supplements, setSupplements] = useState<string[]>(initialData?.supplements ?? [])
  const [notes, setNotes] = useState(initialData?.notes ?? '')
  const [showNotes, setShowNotes] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function save(patch: Partial<HabitsData>) {
    if (!isToday) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      upsertDailyHabits(clientId, logDate, patch)
    }, 800)
  }

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  function handleWater(val: number) {
    const next = water === val ? null : val
    setWater(next)
    save({ water_ml: next })
  }

  function handleSleep(val: number) {
    const next = sleep === val ? null : val
    setSleep(next)
    save({ sleep_hours: next })
  }

  function handleFasting(val: number) {
    const next = fasting === val ? null : val
    setFasting(next)
    save({ fasting_hours: next })
  }

  function handleSteps(val: string) {
    setSteps(val)
    const n = parseInt(val, 10)
    save({ steps: isNaN(n) ? null : n })
  }

  function handleSupplement(s: string) {
    const next = supplements.includes(s)
      ? supplements.filter((x) => x !== s)
      : [...supplements, s]
    setSupplements(next)
    save({ supplements: next })
  }

  function handleNotes(val: string) {
    setNotes(val)
    save({ notes: val || null })
  }

  const readOnly = !isToday

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
      <TouchableOpacity style={styles.header} onPress={() => setIsOpen(!isOpen)} activeOpacity={0.75}>
        <Droplets size={16} color={theme.primary} strokeWidth={2} />
        <Text style={[styles.headerTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          Hábitos del día
        </Text>
        {water != null && (
          <View style={[styles.badge, { backgroundColor: theme.primary + '20' }]}>
            <Text style={[styles.badgeText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
              {water >= 1000 ? `${water / 1000}L` : `${water}ml`}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {isOpen
          ? <ChevronUp size={18} color={theme.mutedForeground} strokeWidth={2} />
          : <ChevronDown size={18} color={theme.mutedForeground} strokeWidth={2} />
        }
      </TouchableOpacity>

      {isOpen && (
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: 180 }}
          style={[styles.body, { borderTopColor: theme.border }]}
        >
          {/* Agua */}
          <Section label="Agua" theme={theme}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={WATER_OPTIONS}
              keyExtractor={(n) => String(n)}
              contentContainerStyle={{ gap: 6 }}
              renderItem={({ item }) => {
                const selected = water === item
                return (
                  <Chip
                    label={item >= 1000 ? `${item / 1000}L` : `${item}ml`}
                    selected={selected}
                    disabled={readOnly}
                    onPress={() => handleWater(item)}
                    theme={theme}
                  />
                )
              }}
            />
          </Section>

          {/* Sueño */}
          <Section label="Sueño (h)" theme={theme}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={SLEEP_OPTIONS}
              keyExtractor={(n) => String(n)}
              contentContainerStyle={{ gap: 6 }}
              renderItem={({ item }) => (
                <Chip
                  label={`${item}h`}
                  selected={sleep === item}
                  disabled={readOnly}
                  onPress={() => handleSleep(item)}
                  theme={theme}
                />
              )}
            />
          </Section>

          {/* Ayuno */}
          <Section label="Ayuno (h)" theme={theme}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={FASTING_OPTIONS}
              keyExtractor={(n) => String(n)}
              contentContainerStyle={{ gap: 6 }}
              renderItem={({ item }) => (
                <Chip
                  label={`${item}h`}
                  selected={fasting === item}
                  disabled={readOnly}
                  onPress={() => handleFasting(item)}
                  theme={theme}
                />
              )}
            />
          </Section>

          {/* Pasos */}
          <Section label="Pasos" theme={theme}>
            <TextInput
              style={[
                styles.stepsInput,
                {
                  borderColor: theme.border,
                  color: theme.foreground,
                  backgroundColor: theme.secondary,
                  borderRadius: theme.radius.lg,
                  fontFamily: theme.fontSans,
                },
              ]}
              placeholder="ej. 8000"
              placeholderTextColor={theme.mutedForeground}
              value={steps}
              onChangeText={handleSteps}
              keyboardType="number-pad"
              editable={!readOnly}
            />
          </Section>

          {/* Suplementos */}
          <Section label="Suplementos" theme={theme}>
            <View style={styles.supplementsWrap}>
              {SUPPLEMENT_OPTIONS.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  selected={supplements.includes(s)}
                  disabled={readOnly}
                  onPress={() => handleSupplement(s)}
                  theme={theme}
                />
              ))}
            </View>
          </Section>

          {/* Notas */}
          {!showNotes && !readOnly ? (
            <TouchableOpacity onPress={() => setShowNotes(true)} activeOpacity={0.7}>
              <Text style={[styles.addNotes, { color: theme.primary, fontFamily: theme.fontSans }]}>
                + Agregar notas
              </Text>
            </TouchableOpacity>
          ) : (showNotes || notes) ? (
            <Section label="Notas" theme={theme}>
              <TextInput
                style={[
                  styles.notesInput,
                  {
                    borderColor: theme.border,
                    color: theme.foreground,
                    backgroundColor: theme.secondary,
                    borderRadius: theme.radius.lg,
                    fontFamily: theme.fontSans,
                  },
                ]}
                placeholder="¿Algo relevante del día?"
                placeholderTextColor={theme.mutedForeground}
                value={notes}
                onChangeText={handleNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!readOnly}
              />
            </Section>
          ) : null}
        </MotiView>
      )}
    </View>
  )
}

function Section({ label, theme, children }: { label: string; theme: any; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
        {label}
      </Text>
      {children}
    </View>
  )
}

function Chip({
  label, selected, disabled, onPress, theme,
}: {
  label: string; selected: boolean; disabled: boolean; onPress: () => void; theme: any
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.secondary,
          borderColor: selected ? theme.primary : theme.border,
          borderRadius: theme.radius.md,
          opacity: disabled && !selected ? 0.5 : 1,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? theme.primaryForeground : theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  headerTitle: { fontSize: 14 },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 11 },
  body: { borderTopWidth: 1, padding: 14, gap: 16 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  chip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13 },
  supplementsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stepsInput: { borderWidth: 1, height: 44, paddingHorizontal: 14, fontSize: 14 },
  notesInput: { borderWidth: 1, padding: 12, fontSize: 13, minHeight: 80 },
  addNotes: { fontSize: 13, paddingVertical: 4 },
})
