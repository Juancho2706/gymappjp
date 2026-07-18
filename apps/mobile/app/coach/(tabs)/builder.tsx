import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { ArrowDownUp, CalendarClock, Dumbbell, LayoutGrid, LayoutTemplate, List, Plus, Search, SearchX } from 'lucide-react-native'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { selectWithFallback } from '../../../lib/db-compat'
import { useTheme } from '../../../context/ThemeContext'
import { SHADOWS } from '../../../lib/shadows'
import { FONT, textStyle } from '../../../lib/typography'
import { Input, NativeDialog } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { useCoachTabbarScroll } from '../../../components/coach/CoachTabbarScroll'
import { themedIcon, type ThemedIcon } from '../../../components/coach/programs/themed-icon'
import { ProgramRow } from '../../../components/coach/programs/ProgramRow'
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

const IconPlus = themedIcon(Plus)
const IconSort = themedIcon(ArrowDownUp)
const IconList = themedIcon(List)
const IconGrid = themedIcon(LayoutGrid)

type SortKey = 'recent' | 'name'

// Header (1:1 web mobile): eyebrow 12px bold uppercase · título display 26px black.
const T_EYEBROW = { fontFamily: FONT.uiBold, fontSize: 12, letterSpacing: 0.96, textTransform: 'uppercase' as const }
const T_TITLE = { fontFamily: FONT.displayBlack, fontSize: 26, lineHeight: 29, letterSpacing: -0.78 }
const T_NAV = textStyle('xs', FONT.uiBold)
const T_TAB_COUNT = { fontFamily: FONT.mono, fontSize: 17, lineHeight: 19 }
const T_TAB_LABEL = { fontFamily: FONT.uiBold, fontSize: 11 }
const T_NUEVA = textStyle('sm', FONT.uiBold)
const T_EMPTY_TITLE = { fontFamily: FONT.displayBold, fontSize: 17, lineHeight: 21 }
const T_EMPTY_SUB = textStyle('xs', FONT.ui, { lh: 'normal' })

const TABS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'templates', label: 'Plantillas' },
  { value: 'assigned', label: 'En curso' },
]

export default function BuilderScreen() {
  const { onScroll } = useCoachTabbarScroll()
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

  const tabCounts: Record<FilterType, number> = { all: programs.length, templates: stats.templates, assigned: stats.active }

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView edges={[]} style={{ flex: 1 }}>
        {/* Header minimal (1:1 web): eyebrow + Programas + Nueva */}
        <View className="flex-row items-end justify-between gap-space-3 px-space-5 pb-space-3 pt-space-6">
          <View className="min-w-0 flex-1">
            <Text style={T_EYEBROW} className="text-muted">Biblioteca</Text>
            <Text numberOfLines={1} style={T_TITLE} className="text-strong">Programas</Text>
          </View>
          <Pressable
            testID="new-template-button"
            accessibilityRole="button"
            accessibilityLabel="Nueva plantilla"
            onPress={openNewTemplate}
            className="shrink-0 flex-row items-center gap-space-2 rounded-control bg-sport-500 px-space-4 py-space-3 active:opacity-85"
          >
            <IconPlus size={16} className="text-on-sport" />
            <Text style={T_NUEVA} className="text-on-sport">Nueva</Text>
          </Pressable>
        </View>

        <FlashList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          ListHeaderComponent={
            <View className="gap-space-3 pb-space-3">
              {/* Navegación a catálogo / áreas */}
              <View className="flex-row gap-space-2">
                <NavButton icon={IconList} label="Ejercicios" onPress={() => router.push('/coach/ejercicios')} />
                <NavButton icon={IconGrid} label="Áreas" onPress={() => router.push('/coach/settings/areas')} />
              </View>

              {/* Búsqueda + orden */}
              <View className="flex-row items-center gap-space-2">
                <View className="flex-1">
                  <Input
                    leftIcon={Search}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Buscar programa o alumno..."
                    autoCapitalize="none"
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                  />
                </View>
                <Pressable
                  testID="sort-toggle"
                  accessibilityRole="button"
                  accessibilityLabel="Ordenar"
                  onPress={() => setSortKey((k) => (k === 'recent' ? 'name' : 'recent'))}
                  className={`h-[42px] w-[42px] items-center justify-center rounded-control border ${sortKey === 'name' ? 'border-sport-500 bg-sport-100 dark:bg-sport-100/20' : 'border-subtle bg-surface-card'}`}
                >
                  <IconSort size={16} className={sortKey === 'name' ? 'text-sport-600' : 'text-strong'} />
                </Pressable>
              </View>

              {/* Tabs-stats accionables: count (eva-metric) + label */}
              <View className="flex-row gap-[3px] rounded-control bg-surface-sunken p-[3px]">
                {TABS.map((t) => {
                  const on = filterType === t.value
                  return (
                    <Pressable
                      key={t.value}
                      testID={`tab-${t.value}`}
                      onPress={() => setFilterType(t.value)}
                      style={on ? SHADOWS[resolvedScheme].sm : undefined}
                      className={`h-[46px] flex-1 items-center justify-center rounded-control ${on ? 'bg-surface-card' : ''}`}
                    >
                      <Text style={T_TAB_COUNT} className={on ? 'text-strong' : 'text-muted'}>{tabCounts[t.value]}</Text>
                      <Text style={T_TAB_LABEL} className={on ? 'text-strong' : 'text-muted'}>{t.label}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          }
          ListEmptyComponent={
            <LibraryEmptyState
              hasPrograms={programs.length > 0}
              filterType={filterType}
              search={search}
              onNewTemplate={openNewTemplate}
              onClearSearch={() => setSearch('')}
              onShowTemplates={() => setFilterType('templates')}
            />
          }
          renderItem={({ item, index }) => (
            <MotiView
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 260, delay: Math.min(index * 24, 220) }}
            >
              <ProgramRow program={item} onOpen={() => setPreview(item)} />
            </MotiView>
          )}
        />
      </SafeAreaView>

      <NativeDialog open={!!preview} title={preview?.name ?? 'Vista previa'} onClose={() => setPreview(null)} maxWidth={520}>
        {preview ? (
          <ProgramPreviewCard
            program={preview}
            busy={actionBusy?.endsWith(preview.id) ?? false}
            onEdit={() => { const p = preview; setPreview(null); editProgram(p) }}
            onAssign={() => { const p = preview; setPreview(null); openAssign(p) }}
            onDuplicate={() => { const p = preview; setPreview(null); openDuplicate(p) }}
            onSync={() => { const p = preview; setPreview(null); confirmSync(p) }}
            onDelete={() => { const p = preview; setPreview(null); confirmDelete(p) }}
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

/** Botón de navegación a catálogo (1:1 web: border-[1.5px], icono + label 13px bold). */
function NavButton({ icon: Icon, label, onPress }: { icon: ThemedIcon; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-1 flex-row items-center justify-center gap-space-2 rounded-control border-[1.5px] border-subtle bg-surface-card px-space-3 py-space-3 active:opacity-80"
    >
      <Icon size={16} className="text-strong" />
      <Text style={T_NAV} className="text-strong">{label}</Text>
    </Pressable>
  )
}

/** Empty state contextual (1:1 web LibraryEmptyState): tile 60px sport + título display + CTA. */
function LibraryEmptyState({
  hasPrograms,
  filterType,
  search,
  onNewTemplate,
  onClearSearch,
  onShowTemplates,
}: {
  hasPrograms: boolean
  filterType: FilterType
  search: string
  onNewTemplate: () => void
  onClearSearch: () => void
  onShowTemplates: () => void
}) {
  const trimmed = search.trim()
  const cfg =
    hasPrograms && trimmed
      ? { icon: SearchX, title: 'Sin resultados', sub: `No encontramos programas para «${trimmed}». Prueba otro término o quita el filtro.`, cta: 'Limpiar búsqueda', ctaIcon: Search, act: onClearSearch }
      : hasPrograms && filterType === 'assigned'
        ? { icon: CalendarClock, title: 'Nada en curso', sub: 'Cuando asignes una plantilla a un alumno, su programa activo aparece aquí.', cta: 'Ver plantillas', ctaIcon: LayoutTemplate, act: onShowTemplates }
        : hasPrograms && filterType === 'templates'
          ? { icon: LayoutTemplate, title: 'Sin plantillas todavía', sub: 'Crea una plantilla reutilizable y asígnala a tus alumnos en segundos.', cta: 'Crear plantilla', ctaIcon: Plus, act: onNewTemplate }
          : { icon: Dumbbell, title: 'Tu biblioteca está vacía', sub: 'Crea tu primera plantilla de entrenamiento para empezar a asignar.', cta: 'Crear plantilla', ctaIcon: Plus, act: onNewTemplate }
  const EmptyIcon = themedIcon(cfg.icon)
  const CtaIcon = themedIcon(cfg.ctaIcon)
  return (
    <View className="items-center px-space-4 pt-space-6">
      <View className="mb-space-4 h-[60px] w-[60px] items-center justify-center rounded-card bg-sport-100 dark:bg-sport-100/20">
        <EmptyIcon size={27} className="text-sport-600" />
      </View>
      <Text style={T_EMPTY_TITLE} className="text-strong">{cfg.title}</Text>
      <Text style={[T_EMPTY_SUB, { maxWidth: 252, textAlign: 'center', marginTop: 6 }]} className="text-muted">{cfg.sub}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={cfg.act}
        className="mt-space-4 flex-row items-center gap-space-2 rounded-control bg-sport-500 px-space-4 py-space-3 active:opacity-85"
      >
        <CtaIcon size={16} className="text-on-sport" />
        <Text style={T_NUEVA} className="text-on-sport">{cfg.cta}</Text>
      </Pressable>
    </View>
  )
}

// Flujos de datos (duplicar / asignar / sincronizar) viven en
// `components/coach/programs/library-actions.ts` — port 1:1, sin cambios de lógica.
