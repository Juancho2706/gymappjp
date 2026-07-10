import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { ArrowDownUp, Dumbbell, Filter, Plus, Search } from 'lucide-react-native'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { selectWithFallback } from '../../../lib/db-compat'
import { useTheme } from '../../../context/ThemeContext'
import { GLOWS, SHADOWS } from '../../../lib/shadows'
import { FONT, textStyle } from '../../../lib/typography'
import { EmptyState, Input, NativeDialog, ScreenHeader, SegmentedTabs } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { themedIcon } from '../../../components/coach/programs/themed-icon'
import { ProgramLibraryHero } from '../../../components/coach/programs/ProgramLibraryHero'
import { ProgramCard } from '../../../components/coach/programs/ProgramCard'
import { ProgramPreviewCard } from '../../../components/coach/programs/ProgramPreviewCard'
import { AssignTemplateForm } from '../../../components/coach/programs/AssignTemplateForm'
import { DuplicateForm } from '../../../components/coach/programs/DuplicateForm'
import {
  assignTemplateToClients,
  duplicateProgramAsTemplate,
  syncProgramFromTemplate,
} from '../../../components/coach/programs/library-actions'
import {
  buildLibraryStats,
  defaultDuplicateName,
  matchesProgram,
  normalizeProgram,
  type ClientLite,
  type FilterPhases,
  type FilterStatus,
  type FilterStructure,
  type FilterType,
  type ProgramItem,
} from '../../../components/coach/programs/program-model'

const IconFilter = themedIcon(Filter)
const IconPlus = themedIcon(Plus)
const IconSort = themedIcon(ArrowDownUp)

type SortKey = 'recent' | 'name'

const T_PILL = textStyle('3xs', FONT.uiBold)
const T_RESULT = textStyle('2xs', FONT.ui)
const T_TOGGLE = textStyle('3xs', FONT.uiBold)

export default function BuilderScreen() {
  const { resolvedScheme } = useTheme()
  const router = useRouter()
  const [programs, setPrograms] = useState<ProgramItem[]>([])
  const [clients, setClients] = useState<ClientLite[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterStructure, setFilterStructure] = useState<FilterStructure>('all')
  const [filterPhases, setFilterPhases] = useState<FilterPhases>('all')
  const [sortKey, setSortKey] = useState<SortKey>('recent')
  const [compact, setCompact] = useState(false)
  const [preview, setPreview] = useState<ProgramItem | null>(null)
  const [assignProgram, setAssignProgram] = useState<ProgramItem | null>(null)
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [assignDurationWeeks, setAssignDurationWeeks] = useState('4')
  const [duplicateProgram, setDuplicateProgram] = useState<ProgramItem | null>(null)
  const [duplicateName, setDuplicateName] = useState('')
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  useEffect(() => {
    loadLibrary().catch(() => setLoading(false))
  }, [])

  async function loadLibrary() {
    setLoading(true)
    const coach = await getCoachProfile()
    if (!coach) {
      setLoading(false)
      return
    }

    const planBlock = `
          client:clients(id, full_name),
          workout_plans (
            id, day_of_week, title, group_name, week_variant, assigned_date,
            workout_blocks (
              *,
              exercise:exercises(name)
            )
          )`
    const baseCols = `id, name, client_id, weeks_to_repeat, start_date, end_date, duration_days, start_date_flexible,
          program_notes, created_at, updated_at, is_active, program_phases, program_structure_type, cycle_length,
          ab_mode, duration_type, source_template_id`
    const richCols = `id, name, client_id, org_id, weeks_to_repeat, start_date, end_date, duration_days, start_date_flexible,
          program_notes, created_at, updated_at, is_active, program_phases, program_structure_type, cycle_length,
          ab_mode, duration_type, source_template_id,${planBlock}`
    const minCols = `${baseCols},${planBlock}`

    const [programRes, clientsRes] = await Promise.all([
      // Rich (con org_id) → fallback sin org_id para prod standalone.
      selectWithFallback<any>(
        () => supabase.from('workout_programs').select(richCols).eq('coach_id', coach.id).order('updated_at', { ascending: false }),
        () => supabase.from('workout_programs').select(minCols).eq('coach_id', coach.id).order('updated_at', { ascending: false })
      ),
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

  const stats = useMemo(() => buildLibraryStats(programs, clients), [clients, programs])

  const filtered = useMemo(() => {
    const list = programs.filter((program) =>
      matchesProgram(program, { search, filterType, filterStatus, filterStructure, filterPhases })
    )
    // Orden (espejo web): Recientes = última actividad desc · Nombre = A→Z.
    return [...list].sort((a, b) =>
      sortKey === 'name'
        ? a.name.localeCompare(b.name)
        : (b.updated_at ?? b.created_at ?? '').localeCompare(a.updated_at ?? a.created_at ?? '')
    )
  }, [programs, search, filterType, filterStatus, filterStructure, filterPhases, sortKey])

  function openNewTemplate() {
    router.push({ pathname: '/coach/program-builder', params: { mode: 'template' } })
  }

  function editProgram(program: ProgramItem) {
    if (!program.client_id) {
      // Template → edit by program id (client_id null).
      router.push({ pathname: '/coach/program-builder', params: { templateId: program.id } })
      return
    }
    router.push({
      pathname: '/coach/program-builder',
      params: { clientId: program.client_id, clientName: program.client?.full_name ?? '' },
    })
  }

  function openAssign(program: ProgramItem) {
    if (program.client_id) return
    setAssignProgram(program)
    setSelectedClientIds([])
    setAssignDurationWeeks(String(program.weeks_to_repeat ?? 4))
  }

  function openDuplicate(program: ProgramItem) {
    setDuplicateProgram(program)
    setDuplicateName(defaultDuplicateName(program))
  }

  async function confirmDuplicate() {
    if (!duplicateProgram) return
    const name = duplicateName.trim()
    if (name.length < 2 || name.length > 100) {
      Alert.alert('Nombre invalido', 'Usa entre 2 y 100 caracteres.')
      return
    }
    setActionBusy(`duplicate-${duplicateProgram.id}`)
    const result = await duplicateProgramAsTemplate(duplicateProgram, name)
    setActionBusy(null)
    if (!result.ok) {
      Alert.alert('No se pudo duplicar', result.error ?? 'Intenta nuevamente.')
      return
    }
    setDuplicateProgram(null)
    setDuplicateName('')
    await loadLibrary()
  }

  async function confirmAssign() {
    if (!assignProgram) return
    if (!selectedClientIds.length) {
      Alert.alert('Selecciona alumnos', 'Elige al menos un alumno para asignar esta plantilla.')
      return
    }
    const weeks = Math.max(1, Math.min(52, Number(assignDurationWeeks) || assignProgram.weeks_to_repeat || 4))
    setActionBusy(`assign-${assignProgram.id}`)
    const result = await assignTemplateToClients(assignProgram, selectedClientIds, { durationWeeks: weeks })
    setActionBusy(null)
    if (!result.ok) {
      Alert.alert('No se pudo asignar', result.error ?? 'Intenta nuevamente.')
      return
    }
    setAssignProgram(null)
    setSelectedClientIds([])
    await loadLibrary()
  }

  function confirmDelete(program: ProgramItem) {
    Alert.alert(
      program.client_id ? 'Eliminar programa' : 'Eliminar plantilla',
      program.client_id
        ? `Se eliminara "${program.name}" de ${program.client?.full_name ?? 'este alumno'}.`
        : `Se eliminara la plantilla "${program.name}".`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setActionBusy(`delete-${program.id}`)
            const { error } = await supabase.from('workout_programs').delete().eq('id', program.id)
            setActionBusy(null)
            if (error) Alert.alert('No se pudo eliminar', error.message)
            else loadLibrary()
          },
        },
      ]
    )
  }

  function toggleSelectedClient(clientId: string) {
    setSelectedClientIds((prev) => (prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]))
  }

  function confirmSync(program: ProgramItem) {
    Alert.alert(
      'Sincronizar con plantilla',
      `Se traen los cambios de la plantilla base a "${program.name}".\n\n• Los ejercicios marcados como override (ajustes manuales del alumno) se conservan.\n• El resto se reemplaza con la versión de la plantilla.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sincronizar',
          onPress: async () => {
            setActionBusy(`sync-${program.id}`)
            const result = await syncProgramFromTemplate(program)
            setActionBusy(null)
            if (!result.ok) {
              Alert.alert('No se pudo sincronizar', result.error ?? 'Intenta nuevamente.')
              return
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
            await loadLibrary()
          },
        },
      ]
    )
  }

  if (loading) {
    return (
      <View className="flex-1 bg-surface-app">
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando biblioteca..." />
      </View>
    )
  }

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView edges={[]} style={{ flex: 1 }}>
        <ScreenHeader title="Programas" subtitle="Plantillas, planes activos y alumnos asignados." />

        <FlashList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View className="gap-space-4 pb-space-4">
              <ProgramLibraryHero
                stats={stats}
                onNewTemplate={openNewTemplate}
                onExercises={() => router.push('/coach/ejercicios')}
                onAreas={() => router.push('/coach/settings/areas')}
              />

              <View
                className="gap-space-3 rounded-card border border-subtle bg-surface-card p-space-4"
                style={SHADOWS[resolvedScheme].sm}
              >
                <Input
                  leftIcon={Search}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Buscar programa o alumno..."
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />

                <SegmentedTabs<FilterType>
                  items={[
                    { value: 'all', label: 'Todos' },
                    { value: 'templates', label: 'Plantillas' },
                    { value: 'assigned', label: 'En curso' },
                  ]}
                  value={filterType}
                  onChange={setFilterType}
                />

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                  <FilterPill label="Activos" active={filterStatus === 'active'} onPress={() => setFilterStatus(filterStatus === 'active' ? 'all' : 'active')} />
                  <FilterPill label="Inactivos" active={filterStatus === 'inactive'} onPress={() => setFilterStatus(filterStatus === 'inactive' ? 'all' : 'inactive')} />
                  <FilterPill label="Semanal" active={filterStructure === 'weekly'} onPress={() => setFilterStructure(filterStructure === 'weekly' ? 'all' : 'weekly')} />
                  <FilterPill label="Ciclo" active={filterStructure === 'cycle'} onPress={() => setFilterStructure(filterStructure === 'cycle' ? 'all' : 'cycle')} />
                  <FilterPill label="Con fases" active={filterPhases === 'with'} onPress={() => setFilterPhases(filterPhases === 'with' ? 'all' : 'with')} />
                </ScrollView>

                {/* Orden (espejo del popover web Recientes/Nombre). */}
                <View className="flex-row items-center gap-space-2">
                  <IconSort size={13} className="text-muted" />
                  <Text style={T_RESULT} className="text-muted">Ordenar</Text>
                  <FilterPill label="Recientes" active={sortKey === 'recent'} onPress={() => setSortKey('recent')} />
                  <FilterPill label="Nombre" active={sortKey === 'name'} onPress={() => setSortKey('name')} />
                </View>

                <View className="flex-row items-center justify-between gap-space-3">
                  <View className="flex-row items-center gap-space-2">
                    <IconFilter size={14} className="text-muted" />
                    <Text style={T_RESULT} className="text-muted">
                      {filtered.length} de {programs.length}
                    </Text>
                  </View>
                  <Pressable
                    testID="view-toggle"
                    onPress={() => setCompact((v) => !v)}
                    className="rounded-control border border-subtle px-space-4 py-space-2 active:opacity-70"
                  >
                    <Text style={T_TOGGLE} className="text-strong">
                      {compact ? 'Compacta' : 'Comoda'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon={Dumbbell}
              title={programs.length ? 'Sin resultados' : 'Aun no tienes programas'}
              subtitle={programs.length ? 'Prueba otro filtro o busqueda.' : 'Crea una plantilla o un programa desde un alumno.'}
            />
          }
          renderItem={({ item, index }) => (
            <MotiView
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 260, delay: Math.min(index * 24, 220) }}
            >
              <ProgramCard
                program={item}
                compact={compact}
                busy={actionBusy?.endsWith(item.id) ?? false}
                onPreview={() => setPreview(item)}
                onEdit={() => editProgram(item)}
                onAssign={() => openAssign(item)}
                onDuplicate={() => openDuplicate(item)}
                onDelete={() => confirmDelete(item)}
                onSync={() => confirmSync(item)}
              />
            </MotiView>
          )}
        />
      </SafeAreaView>

      <Pressable
        testID="new-template-fab"
        accessibilityRole="button"
        accessibilityLabel="Nueva plantilla"
        onPress={openNewTemplate}
        className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-sport-500 active:opacity-85"
        style={GLOWS.sport}
      >
        <IconPlus size={24} className="text-on-sport" />
      </Pressable>

      <NativeDialog open={!!preview} title={preview?.name ?? 'Vista previa'} onClose={() => setPreview(null)} maxWidth={520}>
        {preview ? (
          <ProgramPreviewCard
            program={preview}
            onEdit={() => { const p = preview; setPreview(null); editProgram(p) }}
            onAssign={() => { const p = preview; setPreview(null); openAssign(p) }}
            onDuplicate={() => { const p = preview; setPreview(null); openDuplicate(p) }}
          />
        ) : null}
      </NativeDialog>

      <NativeDialog open={!!assignProgram} title={assignProgram ? `Asignar ${assignProgram.name}` : 'Asignar'} onClose={() => setAssignProgram(null)} maxWidth={520}>
        {assignProgram ? (
          <AssignTemplateForm
            program={assignProgram}
            clients={clients}
            selectedClientIds={selectedClientIds}
            durationWeeks={assignDurationWeeks}
            busy={actionBusy === `assign-${assignProgram.id}`}
            onToggleClient={toggleSelectedClient}
            onDurationChange={setAssignDurationWeeks}
            onCancel={() => setAssignProgram(null)}
            onConfirm={confirmAssign}
          />
        ) : null}
      </NativeDialog>

      <NativeDialog open={!!duplicateProgram} title="Duplicar como plantilla" onClose={() => setDuplicateProgram(null)} maxWidth={440}>
        {duplicateProgram ? (
          <DuplicateForm
            name={duplicateName}
            busy={actionBusy === `duplicate-${duplicateProgram.id}`}
            onChangeName={setDuplicateName}
            onCancel={() => setDuplicateProgram(null)}
            onConfirm={confirmDuplicate}
          />
        ) : null}
      </NativeDialog>
    </View>
  )
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      testID={`filter-pill-${label.toLowerCase().replace(/\s+/g, '-')}`}
      onPress={onPress}
      className={`rounded-control border px-space-4 py-space-3 active:opacity-80 ${
        active ? 'border-sport-500 bg-sport-500' : 'border-subtle bg-surface-sunken'
      }`}
    >
      <Text style={T_PILL} className={active ? 'text-on-sport' : 'text-muted'}>
        {label}
      </Text>
    </Pressable>
  )
}

// Flujos de datos (duplicar / asignar / sincronizar) viven en
// `components/coach/programs/library-actions.ts` — port 1:1, sin cambios de lógica.
