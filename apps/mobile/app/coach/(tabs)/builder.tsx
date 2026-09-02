import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowDownUp, CalendarClock, ChevronRight, ClipboardList, Dumbbell, LayoutGrid, LayoutTemplate, List, Plus, Search, SearchX } from 'lucide-react-native'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { useWorkspace } from '../../../lib/workspace'
import { selectWithFallback } from '../../../lib/db-compat'
import { useTheme } from '../../../context/ThemeContext'
import { SHADOWS } from '../../../lib/shadows'
import { FONT, textStyle } from '../../../lib/typography'
import { Input, NativeDialog } from '../../../components'
import { Sheet } from '../../../components/Sheet'
import { captureAppEvent } from '../../../lib/analytics'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { DomainOffNotice } from '../../../components/coach/DomainOffNotice'
import { useDomainGuard } from '../../../lib/domain-guard'
import { useCoachTabbarScroll } from '../../../components/coach/CoachTabbarScroll'
import { COACH_TABBAR_CLEARANCE } from '../../../components/coach/CoachMobileChrome'
import { themedIcon, type ThemedIcon } from '../../../components/coach/programs/themed-icon'
import { ProgramRow } from '../../../components/coach/programs/ProgramRow'
import { ProgramPreviewCard } from '../../../components/coach/programs/ProgramPreviewCard'
import { FirstTemplateSheet } from '../../../components/coach/FirstTemplateSheet'
import { postCoachOnboardingEvent, useCoachOnboarding } from '../../../lib/coach-dashboard'
import { builderParamsAfterTemplate, resolveGuidedEntry } from '../../../lib/templates'
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
// Iconos del empty state contextual. Se envuelven ACA, a nivel de modulo, y no dentro de
// `LibraryEmptyState`: `themedIcon` devuelve un COMPONENTE, y crear componentes en render
// remonta el subarbol en cada pasada (pierde estado y anima de cero). `themedIcon` cachea por
// icono, asi que el wrapper es el mismo objeto igual — lo que cambiaba era el ORDEN de creacion,
// no el resultado; hoisting lo vuelve explicito y calla `react-hooks/static-components`.
const IconSearchX = themedIcon(SearchX)
const IconSearch = themedIcon(Search)
const IconCalendarClock = themedIcon(CalendarClock)
const IconLayoutTemplate = themedIcon(LayoutTemplate)
const IconDumbbell = themedIcon(Dumbbell)

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

/**
 * Header de la biblioteca (1:1 web): eyebrow «Biblioteca» + título «Programas» + «Nueva».
 * Extraído para que la rama de dominio apagado pinte EXACTAMENTE el mismo encabezado que la
 * pantalla real (mockup 9801fec7 C: «conserva el título Programas»), sin duplicar el markup.
 * `showNew=false` deja el chasis sin la acción de crear.
 */
function LibraryHeader({ showNew, onNew }: { showNew: boolean; onNew?: () => void }) {
  return (
    <View className="flex-row items-end justify-between gap-space-3 px-space-5 pb-space-3 pt-space-6">
      <View className="min-w-0 flex-1">
        <Text style={T_EYEBROW} className="text-muted">Biblioteca</Text>
        <Text numberOfLines={1} style={T_TITLE} className="text-strong">Programas</Text>
      </View>
      {showNew ? (
        <Pressable
          testID="new-template-button"
          accessibilityRole="button"
          accessibilityLabel="Crear programa o ejercicio"
          onPress={onNew}
          className="shrink-0 flex-row items-center gap-space-2 rounded-control bg-sport-500 px-space-4 py-space-3 active:opacity-85"
        >
          <IconPlus size={16} className="text-on-sport" />
          <Text style={T_NUEVA} className="text-on-sport">Nueva</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export default function BuilderScreen() {
  const { onScroll } = useCoachTabbarScroll()
  const insets = useSafeAreaInsets()
  const { theme, resolvedScheme } = useTheme()
  const router = useRouter()
  const workspace = useWorkspace()
  // Paso 3 de la guía: la ruta llega marcada con `?primera=1` (`RN_FIRST_STEP_PARAM` de
  // @eva/onboarding; el literal se repite acá porque Expo Router tipa los params por nombre).
  const { primera } = useLocalSearchParams<{ primera?: string }>()
  const onboarding = useCoachOnboarding()
  // Master switch del dominio Entrenamiento (Ola de orden W1). Preferencia del coach, NO permiso:
  // fail-open y sin relacion con el plan. Ver el contrato de consumo en `lib/domain-guard.ts` —
  // nada de early-return antes de los hooks; se gatea el efecto y se elige rama abajo.
  const training = useDomainGuard('training')
  const demoClientId = onboarding?.onboardingV2.demoClientId ?? null
  const demoName = onboarding?.onboardingV2.demoName ?? null
  const [firstTemplateOpen, setFirstTemplateOpen] = useState(false)
  // «+ Nueva» ya no adivina: pregunta qué crear (programa o ejercicio propio). Antes empujaba
  // derecho al lienzo del builder y el ejercicio personalizado quedaba escondido en otro tab.
  const [newSheetOpen, setNewSheetOpen] = useState(false)
  // La marca se consume UNA vez: sin esto, volver al tab desde el builder reabriría la sheet.
  const guidedConsumedRef = useRef(false)
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
    if (!workspace.ready || !training.ready) return
    // Entrenamiento apagado ⇒ CERO consulta a la biblioteca (money-safety): la pantalla no lee
    // programas que no va a mostrar. `setLoading(false)` deja pasar la rama del aviso.
    if (!training.enabled) {
      setLoading(false)
      return
    }
    loadLibrary().catch(() => setLoading(false))
  }, [workspace.ready, workspace.kind, workspace.teamId, workspace.orgId, training.ready, training.enabled])

  async function loadLibrary() {
    setLoading(true)
    const coach = await getCoachProfile()
    if (!coach) {
      setLoading(false)
      return
    }

    const planBlock = `
          client:clients(id, full_name, is_archived),
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
      (() => {
        let query: any = supabase
        .from('clients')
        .select('id, full_name, workout_programs(id, name, is_active)')
        .eq('coach_id', coach.id)
        .eq('is_archived', false)
        .order('full_name')
        if (workspace.orgId) query = query.eq('org_id', workspace.orgId).is('team_id', null)
        else if (workspace.teamId) query = query.is('org_id', null).eq('team_id', workspace.teamId)
        else query = query.is('org_id', null).is('team_id', null)
        return query
      })(),
    ])

    const visibleClientIds = new Set(((clientsRes.data as unknown as ClientLite[] | null) ?? []).map((client) => client.id))
    const scopedPrograms = ((programRes.data as unknown as ProgramItem[] | null) ?? [])
      .filter((program) => !program.client_id || visibleClientIds.has(program.client_id))
      .map(normalizeProgram)
    setPrograms(scopedPrograms)
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

  /**
   * Entrada guiada del paso 3 (`?primera=1`), hallazgo 5 del QA del owner 22-08: hasta ahora la
   * guía dejaba al coach en la biblioteca sin decirle qué hacer. Con la marca en la ruta y el
   * alumno de ejemplo sembrado se abre la sheet «Tu primera rutina para {demo}».
   *
   * Sin demo (rama `other`, o el coach lo borró) NO se abre nada y el tab se comporta como
   * siempre: la sheet arma sobre alguien, y el paso 3 sin alumno no tiene sujeto.
   *
   * El parámetro se limpia apenas se consume para que volver desde el lienzo no lo reabra — pero
   * NO antes de que la foto del panel esté publicada: en un arranque en frío o por deep link el
   * primer render llega sin snapshot, y consumir ahí quemaba el paso 3 en silencio (la sheet ya no
   * podía abrir cuando llegaba el `demoClientId`). La decisión vive en `resolveGuidedEntry`.
   */
  useEffect(() => {
    // Con Entrenamiento apagado la marca NO se consume: quemarla acá dejaría al coach sin paso 3
    // cuando vuelva a prender el dominio (la sheet no se abriría nunca más).
    if (!training.ready || !training.enabled) return
    const decision = resolveGuidedEntry({
      raw: primera,
      snapshotReady: onboarding != null,
      hasDemo: demoClientId != null,
      alreadyConsumed: guidedConsumedRef.current,
    })
    if (!decision.consume) return
    guidedConsumedRef.current = true
    router.setParams({ primera: '' })
    if (decision.openSheet) setFirstTemplateOpen(true)
  }, [primera, onboarding, demoClientId, router, training.ready, training.enabled])

  function openNewTemplate() {
    router.push({ pathname: '/coach/program-builder', params: { mode: 'template' } })
  }

  /**
   * Elección de la hoja «¿Qué querés crear?». Se cierra la hoja y se navega en el MISMO tick: es el
   * patrón que ya usa el resto de la app para «elegir opción → ir a otra pantalla» (acciones rápidas
   * del panel, `CoachDashboardSections.tsx:726`, y el sheet de doble intención del alumno). El
   * `setTimeout` de 300ms que existe en ese archivo está reservado para el caso distinto de abrir
   * OTRO overlay encima; navegar no compite con la animación de cierre porque el Modal se desmonta
   * con la pantalla que lo hospeda.
   */
  function chooseNewProgram() {
    setNewSheetOpen(false)
    captureAppEvent('library_new_choice', { choice: 'program' })
    openNewTemplate()
  }

  function chooseNewExercise() {
    setNewSheetOpen(false)
    captureAppEvent('library_new_choice', { choice: 'exercise' })
    router.push({ pathname: '/coach/ejercicios', params: { create: '1' } })
  }

  /** Lienzo del paso 3: el alumno de ejemplo, la marca guiada y (si se sembró) el programa. */
  function openGuidedBuilder(programId: string | null) {
    if (demoClientId == null) return
    setFirstTemplateOpen(false)
    router.push({
      pathname: '/coach/program-builder',
      params: builderParamsAfterTemplate({ clientId: demoClientId, clientName: demoName, programId }),
    })
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

  // Dominio Entrenamiento apagado: se conserva el chasis y el título «Programas» (mockup 9801fec7,
  // decisión 3A) y se reemplaza SOLO el cuerpo. Sin «Nueva»: no se ofrece crear en una sección que
  // el propio coach apagó. Va DESPUÉS del loader para que no haya flash de la lista real.
  if (!training.enabled) {
    return (
      <View className="flex-1 bg-surface-app">
        <AppBackground />
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <LibraryHeader showNew={false} />
          <DomainOffNotice domain="training" />
        </SafeAreaView>
      </View>
    )
  }

  const tabCounts: Record<FilterType, number> = { all: programs.length, templates: stats.templates, assigned: stats.active }

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      {/* QA F4: el header quedaba bajo el status bar — edges 'top' espeja el hub
          nutrición (insets.top, coach/nutrition-v2/index.tsx:361). */}
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <LibraryHeader
          showNew
          onNew={() => {
            captureAppEvent('library_new_pressed')
            setNewSheetOpen(true)
          }}
        />

        <FlashList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + COACH_TABBAR_CLEARANCE }}
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

      {/* «¿Qué querés crear?» — desambigua el «+ Nueva» del header. `nativeModal`: bajo gorhom 5.2.14
          + reanimated 4 el sheet puede montar fuera de pantalla al primer present (ver SheetProps). */}
      <Sheet
        open={newSheetOpen}
        onClose={() => setNewSheetOpen(false)}
        nativeModal
        title="¿Qué querés crear?"
        description="Elegí qué sumar a tu biblioteca."
        snapPoints={['42%']}
      >
        <View style={{ gap: 16 }}>
          {/* `dark:bg-*-100/[0.16|0.18]`: en dark los tokens `-100` son el color sólido (pensados para
              usarse con alpha, ver Badge.tsx) — sin el alpha la fila quedaría pintada entera. */}
          <TouchableOpacity
            testID="new-choice-program"
            onPress={chooseNewProgram}
            activeOpacity={0.85}
            accessibilityRole="button"
            className="rounded-control border border-sport-500/25 bg-sport-100 dark:bg-sport-100/[0.16]"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 }}
          >
            <View className="bg-sport-500" style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
              <ClipboardList size={17} color="#fff" strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 14 }}>Programa nuevo</Text>
              <Text className="text-muted" numberOfLines={2} style={{ fontFamily: FONT.ui, fontSize: 11.5, marginTop: 1 }}>Plantilla o rutina para asignar a tus alumnos</Text>
            </View>
            <ChevronRight size={18} color={theme.mutedForeground} />
          </TouchableOpacity>

          <TouchableOpacity
            testID="new-choice-exercise"
            onPress={chooseNewExercise}
            activeOpacity={0.85}
            accessibilityRole="button"
            className="rounded-control border border-success-500/25 bg-success-100 dark:bg-success-100/[0.18]"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 }}
          >
            <View className="bg-success-500" style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
              <Dumbbell size={17} color="#fff" strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 14 }}>Ejercicio personalizado</Text>
              <Text className="text-muted" numberOfLines={2} style={{ fontFamily: FONT.ui, fontSize: 11.5, marginTop: 1 }}>Queda en tu biblioteca para usarlo en cualquier programa</Text>
            </View>
            <ChevronRight size={18} color={theme.mutedForeground} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setNewSheetOpen(false)} activeOpacity={0.7} accessibilityRole="button" style={{ paddingVertical: 6 }}>
            <Text className="text-muted" style={{ textAlign: 'center', fontFamily: FONT.uiSemibold, fontSize: 13.5 }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </Sheet>

      {/* Paso 3 de la guía. `demoClientId` no puede ser null acá: el efecto solo abre con demo. */}
      {demoClientId != null ? (
        <FirstTemplateSheet
          open={firstTemplateOpen}
          demoName={demoName}
          demoClientId={demoClientId}
          onClose={() => setFirstTemplateOpen(false)}
          onApplied={({ templateId, programId }) => {
            // Telemetría del funnel. El `stepKey` REAL viaja en `metadata.step`: la firma de
            // `postCoachOnboardingEvent` fija la columna en un valor de la guía v1 (ver
            // `lib/coach-dashboard.ts`, GUIDE_EVENT_STEP_KEY) aunque el endpoint ya acepta los
            // step keys v2 — deuda anotada, no se toca desde acá.
            void postCoachOnboardingEvent('step_completed', {
              step: 'first_artifact',
              surface: 'builder',
              templateId,
              seeded: programId != null,
            })
            openGuidedBuilder(programId)
          }}
          onSkip={() => openGuidedBuilder(null)}
        />
      ) : null}

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

      <NativeDialog open={!!duplicateProgram} title="Duplicar como plantilla" onClose={() => setDuplicateProgram(null)} maxWidth={440} scrollable>
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
      ? { icon: IconSearchX, title: 'Sin resultados', sub: `No encontramos programas para «${trimmed}». Prueba otro término o quita el filtro.`, cta: 'Limpiar búsqueda', ctaIcon: IconSearch, act: onClearSearch }
      : hasPrograms && filterType === 'assigned'
        ? { icon: IconCalendarClock, title: 'Nada en curso', sub: 'Cuando asignes una plantilla a un alumno, su programa activo aparece aquí.', cta: 'Ver plantillas', ctaIcon: IconLayoutTemplate, act: onShowTemplates }
        : hasPrograms && filterType === 'templates'
          ? { icon: IconLayoutTemplate, title: 'Sin plantillas todavía', sub: 'Crea una plantilla reutilizable y asígnala a tus alumnos en segundos.', cta: 'Crear plantilla', ctaIcon: IconPlus, act: onNewTemplate }
          : { icon: IconDumbbell, title: 'Tu biblioteca está vacía', sub: 'Crea tu primera plantilla de entrenamiento para empezar a asignar.', cta: 'Crear plantilla', ctaIcon: IconPlus, act: onNewTemplate }
  const EmptyIcon = cfg.icon
  const CtaIcon = cfg.ctaIcon
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
