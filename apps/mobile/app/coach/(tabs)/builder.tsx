import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import {
  CalendarDays,
  CheckCircle2,
  Dumbbell,
  Eye,
  Filter,
  Layers3,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Users,
} from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { useTheme } from '../../../context/ThemeContext'
import { Button, EmptyState, NativeDialog, ScreenHeader, SegmentedTabs } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'

type FilterType = 'all' | 'templates' | 'assigned'
type FilterStatus = 'all' | 'active' | 'inactive'
type FilterStructure = 'all' | 'weekly' | 'cycle'
type FilterPhases = 'all' | 'with' | 'without'

type ClientLite = {
  id: string
  full_name: string
  workout_programs?: { id: string; name: string; is_active?: boolean | null }[] | null
}

type ProgramBlock = {
  id: string
  order_index: number
  sets: number
  reps: string
  section: string | null
  tempo: string | null
  rir: string | null
  rest_time: string | null
  notes: string | null
  superset_group: string | null
  exercise?: { name: string | null } | null
}

type ProgramPlan = {
  id: string
  day_of_week: number | null
  title: string
  workout_blocks?: ProgramBlock[] | null
}

type ProgramItem = {
  id: string
  name: string
  client_id: string | null
  weeks_to_repeat: number | null
  start_date: string | null
  created_at: string
  updated_at?: string | null
  is_active?: boolean | null
  program_phases?: { name: string; weeks: number; color?: string }[] | null
  program_structure_type?: 'weekly' | 'cycle' | null
  cycle_length?: number | null
  ab_mode?: boolean | null
  duration_type?: 'weeks' | 'async' | 'calendar_days' | null
  source_template_id?: string | null
  client?: { id: string; full_name: string } | null
  workout_plans?: ProgramPlan[] | null
}

type ProgramStats = {
  daysWithWork: number
  blockCount: number
  structureKind: 'weekly' | 'cycle'
  hasPhases: boolean
  lastActivityIso: string
}

const DAY_LABELS = ['', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

export default function BuilderScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [programs, setPrograms] = useState<ProgramItem[]>([])
  const [clients, setClients] = useState<ClientLite[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterStructure, setFilterStructure] = useState<FilterStructure>('all')
  const [filterPhases, setFilterPhases] = useState<FilterPhases>('all')
  const [compact, setCompact] = useState(false)
  const [preview, setPreview] = useState<ProgramItem | null>(null)

  useEffect(() => {
    loadLibrary()
  }, [])

  async function loadLibrary() {
    setLoading(true)
    const coach = await getCoachProfile()
    if (!coach) {
      setLoading(false)
      return
    }

    const [programRes, clientsRes] = await Promise.all([
      supabase
        .from('workout_programs')
        .select(`
          id, name, client_id, weeks_to_repeat, start_date, created_at, updated_at, is_active,
          program_phases, program_structure_type, cycle_length, ab_mode, duration_type, source_template_id,
          client:clients(id, full_name),
          workout_plans (
            id, day_of_week, title,
            workout_blocks (
              id, order_index, sets, reps, section, tempo, rir, rest_time, notes, superset_group,
              exercise:exercises(name)
            )
          )
        `)
        .eq('coach_id', coach.id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('clients')
        .select('id, full_name, workout_programs(id, name, is_active)')
        .eq('coach_id', coach.id)
        .eq('is_archived', false)
        .order('full_name'),
    ])

    setPrograms(((programRes.data as unknown as ProgramItem[] | null) ?? []).map(normalizeProgram))
    setClients((clientsRes.data as unknown as ClientLite[] | null) ?? [])
    setLoading(false)
  }

  const stats = useMemo(() => {
    const templates = programs.filter((p) => !p.client_id).length
    const active = programs.filter((p) => p.client_id && p.is_active).length
    const noProgram = clients.filter((c) => !((c.workout_programs ?? []).some((p) => p.is_active))).length
    return { templates, active, noProgram, total: programs.length }
  }, [clients, programs])

  const filtered = useMemo(() => {
    return programs.filter((program) =>
      matchesProgram(program, { search, filterType, filterStatus, filterStructure, filterPhases })
    )
  }, [programs, search, filterType, filterStatus, filterStructure, filterPhases])

  function openNewTemplate() {
    Alert.alert(
      'Nueva plantilla',
      'El creador de plantillas se mejora en el siguiente bloque. Por ahora crea o edita programas desde un alumno activo.',
      [{ text: 'OK' }]
    )
  }

  function editProgram(program: ProgramItem) {
    if (!program.client_id || !program.client?.full_name) {
      Alert.alert('Plantilla', 'La edicion directa de plantillas queda para el siguiente bloque del builder.')
      return
    }
    router.push({
      pathname: '/coach/program-builder',
      params: { clientId: program.client_id, clientName: program.client.full_name },
    })
  }

  if (loading) {
    return (
      <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando biblioteca..." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader title="Programas" subtitle="Plantillas, planes activos y alumnos asignados." />

      <View style={styles.content}>
        <LibraryHero stats={stats} theme={theme} onNewTemplate={openNewTemplate} />

        <View style={[styles.toolbar, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
          <View style={[styles.searchBox, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
            <Search size={16} color={theme.mutedForeground} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar programa o alumno..."
              placeholderTextColor={theme.mutedForeground}
              style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]}
            />
          </View>

          <SegmentedTabs<FilterType>
            items={[
              { value: 'all', label: 'Todos' },
              { value: 'templates', label: 'Plantillas' },
              { value: 'assigned', label: 'En curso' },
            ]}
            value={filterType}
            onChange={setFilterType}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <FilterPill label="Activos" active={filterStatus === 'active'} onPress={() => setFilterStatus(filterStatus === 'active' ? 'all' : 'active')} theme={theme} />
            <FilterPill label="Inactivos" active={filterStatus === 'inactive'} onPress={() => setFilterStatus(filterStatus === 'inactive' ? 'all' : 'inactive')} theme={theme} />
            <FilterPill label="Semanal" active={filterStructure === 'weekly'} onPress={() => setFilterStructure(filterStructure === 'weekly' ? 'all' : 'weekly')} theme={theme} />
            <FilterPill label="Ciclo" active={filterStructure === 'cycle'} onPress={() => setFilterStructure(filterStructure === 'cycle' ? 'all' : 'cycle')} theme={theme} />
            <FilterPill label="Con fases" active={filterPhases === 'with'} onPress={() => setFilterPhases(filterPhases === 'with' ? 'all' : 'with')} theme={theme} />
          </ScrollView>

          <View style={styles.toolbarFooter}>
            <View style={styles.resultLabel}>
              <Filter size={14} color={theme.mutedForeground} />
              <Text style={[styles.resultText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {filtered.length} de {programs.length}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setCompact((v) => !v)} style={[styles.viewToggle, { borderColor: theme.border, borderRadius: theme.radius.lg }]}>
              <Text style={[styles.viewToggleText, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
                {compact ? 'Compacta' : 'Comoda'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {filtered.length ? (
          <FlashList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <MotiView
                from={{ opacity: 0, translateY: 10 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 260, delay: Math.min(index * 24, 220) }}
              >
                <ProgramCard
                  program={item}
                  compact={compact}
                  theme={theme}
                  onPreview={() => setPreview(item)}
                  onEdit={() => editProgram(item)}
                />
              </MotiView>
            )}
          />
        ) : (
          <EmptyState
            icon={Dumbbell}
            title={programs.length ? 'Sin resultados' : 'Aun no tienes programas'}
            subtitle={programs.length ? 'Prueba otro filtro o busqueda.' : 'Crea una plantilla o un programa desde un alumno.'}
          />
        )}
      </View>

      <TouchableOpacity style={[styles.fab, { backgroundColor: theme.primary }]} onPress={openNewTemplate} activeOpacity={0.86}>
        <Plus size={24} color={theme.primaryForeground} />
      </TouchableOpacity>

      <NativeDialog open={!!preview} title={preview?.name ?? 'Vista previa'} onClose={() => setPreview(null)} maxWidth={520}>
        {preview ? <ProgramPreview program={preview} theme={theme} onEdit={() => { const p = preview; setPreview(null); editProgram(p) }} /> : null}
      </NativeDialog>
    </SafeAreaView>
  )
}

function LibraryHero({ stats, theme, onNewTemplate }: { stats: { templates: number; active: number; noProgram: number; total: number }; theme: any; onNewTemplate: () => void }) {
  return (
    <View style={[styles.hero, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
      <View style={styles.heroTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.eyebrowRow}>
            <Sparkles size={14} color={theme.primary} />
            <Text style={[styles.eyebrow, { color: theme.primary, fontFamily: 'Montserrat_800ExtraBold' }]}>BIBLIOTECA</Text>
          </View>
          <Text style={[styles.heroTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>Programas reutilizables</Text>
          <Text style={[styles.heroSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Revisa plantillas, alumnos con plan activo y estructura del programa antes de entrar al builder.
          </Text>
        </View>
        <TouchableOpacity style={[styles.newButton, { backgroundColor: theme.primary, borderRadius: theme.radius.lg }]} onPress={onNewTemplate}>
          <Plus size={18} color={theme.primaryForeground} />
        </TouchableOpacity>
      </View>

      <View style={styles.statGrid}>
        <HeroStat icon={Layers3} label="Plantillas" value={stats.templates} color={theme.primary} theme={theme} />
        <HeroStat icon={ListChecks} label="Activos" value={stats.active} color={theme.success} theme={theme} />
        <HeroStat icon={Users} label="Sin plan" value={stats.noProgram} color="#F59E0B" theme={theme} />
        <HeroStat icon={Dumbbell} label="Total" value={stats.total} color="#8B5CF6" theme={theme} />
      </View>
    </View>
  )
}

function HeroStat({ icon: Icon, label, value, color, theme }: { icon: any; label: string; value: number; color: string; theme: any }) {
  return (
    <View style={[styles.heroStat, { backgroundColor: color + '12', borderColor: color + '33', borderRadius: theme.radius.lg }]}>
      <Icon size={15} color={color} />
      <Text style={[styles.heroStatValue, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{value}</Text>
      <Text style={[styles.heroStatLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>{label}</Text>
    </View>
  )
}

function ProgramCard({ program, compact, theme, onPreview, onEdit }: { program: ProgramItem; compact: boolean; theme: any; onPreview: () => void; onEdit: () => void }) {
  const stats = getProgramStats(program)
  const isTemplate = !program.client_id
  const accent = isTemplate ? theme.primary : program.is_active ? theme.success : theme.mutedForeground
  const days = sortedPlans(program).filter((plan) => (plan.workout_blocks?.length ?? 0) > 0)
  const exercises = firstExerciseNames(program)

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPreview} style={[styles.programCard, compact && styles.programCardCompact, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
      <View style={[styles.accentBar, { backgroundColor: accent, borderTopLeftRadius: theme.radius.xl, borderBottomLeftRadius: theme.radius.xl }]} />
      <View style={styles.programBody}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.cardTitleRow}>
              <Text numberOfLines={1} style={[styles.cardTitle, compact && { fontSize: 14 }, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{program.name}</Text>
              <StatusBadge program={program} theme={theme} />
            </View>
            <Text numberOfLines={1} style={[styles.cardMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {stats.daysWithWork} dias · {stats.blockCount} bloques · {program.weeks_to_repeat ?? 1} sem.{stats.structureKind === 'cycle' ? ` · ciclo ${program.cycle_length ?? '?'}d` : ''}
            </Text>
            {!isTemplate && program.client?.full_name ? (
              <View style={styles.clientLine}>
                <View style={[styles.avatar, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '44' }]}>
                  <Text style={[styles.avatarText, { color: theme.primary, fontFamily: 'Montserrat_800ExtraBold' }]}>{initials(program.client.full_name)}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.clientName, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{program.client.full_name}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {!compact ? (
          <>
            <View style={styles.badgeRow}>
              {program.ab_mode ? <SmallBadge label="A/B" theme={theme} /> : null}
              {stats.hasPhases ? <SmallBadge label="Fases" theme={theme} /> : null}
              {program.duration_type === 'async' ? <SmallBadge label="Flexible" theme={theme} /> : null}
              {program.source_template_id ? <SmallBadge label="Vinculado" theme={theme} /> : null}
            </View>

            <View style={styles.dayRail}>
              {days.slice(0, 7).map((plan) => (
                <View key={plan.id} style={[styles.dayNode, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.md }]}>
                  <Text style={[styles.dayNodeLabel, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>{dayLabel(plan.day_of_week)}</Text>
                  <Text style={[styles.dayNodeCount, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{plan.workout_blocks?.length ?? 0}</Text>
                </View>
              ))}
            </View>

            {exercises.length ? (
              <View style={styles.exerciseWrap}>
                {exercises.map((name) => <SmallBadge key={name} label={name} theme={theme} muted />)}
              </View>
            ) : null}
          </>
        ) : null}

        <View style={styles.cardActions}>
          <ActionButton icon={Eye} label="Preview" onPress={onPreview} theme={theme} />
          <ActionButton icon={Pencil} label="Editar" onPress={onEdit} theme={theme} />
          {isTemplate ? <ActionButton icon={Users} label="Asignar" onPress={() => Alert.alert('Asignar plantilla', 'Lo portamos en el siguiente bloque.')} theme={theme} /> : null}
        </View>
      </View>
    </TouchableOpacity>
  )
}

function StatusBadge({ program, theme }: { program: ProgramItem; theme: any }) {
  const isTemplate = !program.client_id
  const color = isTemplate ? theme.primary : program.is_active ? theme.success : theme.mutedForeground
  const label = isTemplate ? 'Plantilla' : program.is_active ? 'Activo' : 'Inactivo'
  return (
    <View style={[styles.statusBadge, { backgroundColor: color + '14', borderColor: color + '44', borderRadius: theme.radius.sm }]}>
      {program.is_active ? <CheckCircle2 size={10} color={color} /> : null}
      <Text style={[styles.statusText, { color, fontFamily: 'Inter_800ExtraBold' }]}>{label}</Text>
    </View>
  )
}

function ProgramPreview({ program, theme, onEdit }: { program: ProgramItem; theme: any; onEdit: () => void }) {
  const plans = sortedPlans(program)
  const stats = getProgramStats(program)
  const phases = program.program_phases ?? []

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.previewScroll}>
      <View style={styles.previewStats}>
        <PreviewMetric icon={CalendarDays} label="Dias" value={stats.daysWithWork} theme={theme} />
        <PreviewMetric icon={Dumbbell} label="Bloques" value={stats.blockCount} theme={theme} />
        <PreviewMetric icon={Layers3} label="Semanas" value={program.weeks_to_repeat ?? 1} theme={theme} />
      </View>

      {phases.length ? (
        <View style={{ gap: 8 }}>
          <Text style={[styles.previewSectionTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>FASES</Text>
          <View style={styles.phaseBar}>
            {phases.map((phase, i) => (
              <View key={`${phase.name}-${i}`} style={{ flex: Math.max(1, phase.weeks ?? 1), backgroundColor: phase.color || theme.primary }} />
            ))}
          </View>
          <View style={styles.exerciseWrap}>
            {phases.map((phase, i) => <SmallBadge key={`${phase.name}-${i}`} label={`${phase.name} · ${phase.weeks} sem.`} theme={theme} muted />)}
          </View>
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        <Text style={[styles.previewSectionTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>ESTRUCTURA</Text>
        {plans.length ? plans.map((plan) => (
          <View key={plan.id} style={[styles.previewDay, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
            <View style={styles.previewDayHead}>
              <View style={[styles.previewDayIndex, { backgroundColor: theme.primary }]}>
                <Text style={[styles.previewDayIndexText, { color: theme.primaryForeground, fontFamily: 'Montserrat_800ExtraBold' }]}>{dayLabel(plan.day_of_week)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.previewDayTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{plan.title}</Text>
                <Text style={[styles.cardMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{plan.workout_blocks?.length ?? 0} ejercicios</Text>
              </View>
            </View>
            {sortedBlocks(plan).slice(0, 8).map((block, i) => (
              <View key={block.id} style={[styles.blockRow, i < Math.min(sortedBlocks(plan).length, 8) - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[styles.blockName, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{block.exercise?.name ?? 'Ejercicio'}</Text>
                  <Text numberOfLines={1} style={[styles.cardMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    {[block.tempo && `Tempo ${block.tempo}`, block.rir && `${block.rir} RIR`, block.rest_time && `Desc. ${block.rest_time}`].filter(Boolean).join(' · ') || 'Bloque principal'}
                  </Text>
                </View>
                <Text style={[styles.blockDose, { color: theme.primary, fontFamily: 'Montserrat_800ExtraBold' }]}>{block.sets}x{block.reps}</Text>
              </View>
            ))}
          </View>
        )) : (
          <Text style={[styles.cardMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Este programa aun no tiene dias configurados.</Text>
        )}
      </View>

      <View style={styles.previewActions}>
        <Button label="Editar" leftIcon={Pencil} onPress={onEdit} full />
      </View>
    </ScrollView>
  )
}

function PreviewMetric({ icon: Icon, label, value, theme }: { icon: any; label: string; value: number; theme: any }) {
  return (
    <View style={[styles.previewMetric, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <Icon size={15} color={theme.primary} />
      <Text style={[styles.previewMetricValue, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{value}</Text>
      <Text style={[styles.previewMetricLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
    </View>
  )
}

function ActionButton({ icon: Icon, label, onPress, theme }: { icon: any; label: string; onPress: () => void; theme: any }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.actionButton, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <Icon size={14} color={theme.primary} />
      <Text style={[styles.actionText, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>{label}</Text>
    </TouchableOpacity>
  )
}

function FilterPill({ label, active, onPress, theme }: { label: string; active: boolean; onPress: () => void; theme: any }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.filterPill, { backgroundColor: active ? theme.primary : theme.secondary, borderColor: active ? theme.primary : theme.border, borderRadius: theme.radius.lg }]}
    >
      <Text style={[styles.filterPillText, { color: active ? theme.primaryForeground : theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{label}</Text>
    </TouchableOpacity>
  )
}

function SmallBadge({ label, theme, muted }: { label: string; theme: any; muted?: boolean }) {
  const color = muted ? theme.mutedForeground : theme.primary
  return (
    <View style={[styles.smallBadge, { backgroundColor: muted ? theme.secondary : color + '12', borderColor: muted ? theme.border : color + '33', borderRadius: theme.radius.sm }]}>
      <Text numberOfLines={1} style={[styles.smallBadgeText, { color, fontFamily: 'Inter_700Bold' }]}>{label}</Text>
    </View>
  )
}

function normalizeProgram(program: ProgramItem): ProgramItem {
  return {
    ...program,
    program_structure_type: program.program_structure_type ?? 'weekly',
    weeks_to_repeat: program.weeks_to_repeat ?? 1,
    workout_plans: sortedPlans(program),
  }
}

function getProgramStats(program: ProgramItem): ProgramStats {
  const plans = program.workout_plans ?? []
  const blockCount = plans.reduce((sum, plan) => sum + (plan.workout_blocks?.length ?? 0), 0)
  const daysWithWork = plans.filter((plan) => (plan.workout_blocks?.length ?? 0) > 0).length
  return {
    daysWithWork,
    blockCount,
    structureKind: (program.program_structure_type || 'weekly') as 'weekly' | 'cycle',
    hasPhases: (program.program_phases?.length ?? 0) > 0,
    lastActivityIso: program.updated_at || program.created_at,
  }
}

function matchesProgram(program: ProgramItem, filters: { search: string; filterType: FilterType; filterStatus: FilterStatus; filterStructure: FilterStructure; filterPhases: FilterPhases }) {
  const query = filters.search.trim().toLowerCase()
  const stats = getProgramStats(program)
  const matchesSearch =
    !query ||
    program.name.toLowerCase().includes(query) ||
    (program.client?.full_name?.toLowerCase().includes(query) ?? false) ||
    firstExerciseNames(program).some((name) => name.toLowerCase().includes(query))

  const matchesType =
    filters.filterType === 'templates'
      ? !program.client_id
      : filters.filterType === 'assigned'
        ? !!program.client_id && !!program.is_active
        : true
  const matchesStatus =
    filters.filterStatus === 'all'
      ? true
      : filters.filterStatus === 'active'
        ? !!program.client_id && !!program.is_active
        : !!program.client_id && !program.is_active
  const matchesStructure = filters.filterStructure === 'all' || stats.structureKind === filters.filterStructure
  const matchesPhases =
    filters.filterPhases === 'all'
      ? true
      : filters.filterPhases === 'with'
        ? stats.hasPhases
        : !stats.hasPhases

  return matchesSearch && matchesType && matchesStatus && matchesStructure && matchesPhases
}

function sortedPlans(program: ProgramItem): ProgramPlan[] {
  return [...(program.workout_plans ?? [])].sort((a, b) => (a.day_of_week ?? 99) - (b.day_of_week ?? 99))
}

function sortedBlocks(plan: ProgramPlan): ProgramBlock[] {
  return [...(plan.workout_blocks ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
}

function firstExerciseNames(program: ProgramItem): string[] {
  const seen = new Set<string>()
  for (const plan of sortedPlans(program)) {
    for (const block of sortedBlocks(plan)) {
      const name = block.exercise?.name?.trim()
      if (name) seen.add(name)
      if (seen.size >= 4) return [...seen]
    }
  }
  return [...seen]
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'EV'
}

function dayLabel(day: number | null): string {
  if (!day) return 'D'
  return DAY_LABELS[day] ?? `D${day}`
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  content: { flex: 1, paddingHorizontal: 16, gap: 12 },
  hero: { borderWidth: 1, padding: 16, gap: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { fontSize: 10, letterSpacing: 1.3 },
  heroTitle: { fontSize: 22, letterSpacing: -0.5, marginTop: 3 },
  heroSub: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  newButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  statGrid: { flexDirection: 'row', gap: 8 },
  heroStat: { flex: 1, borderWidth: 1, padding: 10, gap: 3 },
  heroStatValue: { fontSize: 17, letterSpacing: -0.3 },
  heroStatLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  toolbar: { borderWidth: 1, padding: 12, gap: 10 },
  searchBox: { minHeight: 44, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  filterRow: { gap: 8, paddingVertical: 2 },
  filterPill: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  filterPillText: { fontSize: 11 },
  toolbarFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  resultLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultText: { fontSize: 12 },
  viewToggle: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  viewToggleText: { fontSize: 11 },
  listContent: { paddingBottom: 96 },
  programCard: { marginBottom: 10, borderWidth: 1, flexDirection: 'row', overflow: 'hidden' },
  programCardCompact: { minHeight: 104 },
  accentBar: { width: 5 },
  programBody: { flex: 1, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', gap: 10 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, minWidth: 0, fontSize: 16, letterSpacing: -0.25 },
  cardMeta: { fontSize: 12, lineHeight: 17 },
  statusBadge: { borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4 },
  statusText: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.6 },
  clientLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  avatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10 },
  clientName: { flex: 1, fontSize: 13 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  smallBadge: { maxWidth: '100%', borderWidth: 1, paddingHorizontal: 7, paddingVertical: 4 },
  smallBadgeText: { fontSize: 10 },
  dayRail: { flexDirection: 'row', gap: 6 },
  dayNode: { minWidth: 42, borderWidth: 1, paddingVertical: 7, paddingHorizontal: 6, alignItems: 'center', gap: 2 },
  dayNodeLabel: { fontSize: 10, textTransform: 'uppercase' },
  dayNodeCount: { fontSize: 14 },
  exerciseWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2 },
  actionButton: { borderWidth: 1, minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  actionText: { fontSize: 11 },
  previewScroll: { gap: 14, paddingBottom: 8 },
  previewStats: { flexDirection: 'row', gap: 8 },
  previewMetric: { flex: 1, borderWidth: 1, padding: 10, gap: 3 },
  previewMetricValue: { fontSize: 17 },
  previewMetricLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  previewSectionTitle: { fontSize: 11, letterSpacing: 1 },
  phaseBar: { height: 9, borderRadius: 99, overflow: 'hidden', flexDirection: 'row' },
  previewDay: { borderWidth: 1, padding: 12, gap: 8 },
  previewDayHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  previewDayIndex: { minWidth: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  previewDayIndexText: { fontSize: 11 },
  previewDayTitle: { fontSize: 14 },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  blockName: { fontSize: 13 },
  blockDose: { fontSize: 12 },
  previewActions: { paddingTop: 4 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
})
