import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Clipboard from 'expo-clipboard'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  Apple,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileUp,
  LayoutGrid,
  Link as LinkIcon,
  MoreVertical,
  Search,
  SearchX,
  SlidersHorizontal,
  Table2,
  Users,
  UserPlus,
  X,
} from 'lucide-react-native'
import { deriveSportTokens } from '@eva/brand-kit'
import { useTheme } from '../../../context/ThemeContext'
import { useEntitlements } from '../../../lib/entitlements'
import { Button, Input, NativeDialog } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { useCoachTabbarScroll } from '../../../components/coach/CoachTabbarScroll'
import { DirRowCard } from '../../../components/coach/directory/DirRowCard'
import { ClientActionsSheet } from '../../../components/coach/directory/ClientActionsSheet'
import { DirectorySummary } from '../../../components/coach/directory/DirectorySummary'
import { DirectoryAlertBanner } from '../../../components/coach/directory/DirectoryAlertBanner'
import { DirectoryOptionSheet } from '../../../components/coach/directory/DirectoryOptionSheet'
import { DirectoryFilterSheet } from '../../../components/coach/directory/DirectoryFilterSheet'
import { CreateClientModal } from '../../../components/coach/directory/CreateClientModal'
import { ImportClientsForm } from '../../../components/coach/directory/ImportClientsForm'
import {
  DANGER,
  EMBER,
  INFO,
  RISK_LABELS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  SUCCESS,
  WARNING,
  hexToRgba,
} from '../../../components/coach/directory/directory-shared'
import {
  buildStats,
  filterClients,
  getCoachDirectoryClients,
  getCoachDirectoryPulse,
  sortClients,
  type DirectoryClient,
  type DirectoryProgramFilter,
  type DirectoryRiskFilter,
  type DirectorySortKey,
  type PulseRow,
  type SortDir,
  type StatusFilter,
} from '../../../lib/clients-directory'
import { clientLoginUrl, deleteClient, openWhatsApp, resetClientPassword, setClientStatus, shareLogin } from '../../../lib/client-actions'
import { getCoachProfile } from '../../../lib/coach'
import { useWorkspace } from '../../../lib/workspace'
import { FONT } from '../../../lib/typography'
import { GLOWS, shadow } from '../../../lib/shadows'
import { getSantiagoIsoYmdForUtcInstant } from '../../../lib/date-utils'

const DAY_MS = 24 * 60 * 60 * 1000

function defaultSortDir(key: DirectorySortKey): SortDir {
  return key === 'name_asc' || key === 'plan_days' ? 'asc' : 'desc'
}

function daysSince(value: string | null): number | null {
  if (!value) return null
  const stamp = new Date(value).getTime()
  return Number.isFinite(stamp) ? Math.max(0, Math.floor((Date.now() - stamp) / DAY_MS)) : null
}

function lastActivityLabel(days: number | null): string {
  if (days == null) return '—'
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  return `Hace ${days}d`
}

function statusMeta(client: DirectoryClient) {
  if (client.isArchived) return { label: 'Archivado', bg: 'bg-surface-sunken', fg: 'text-subtle' }
  if (!client.isActive) return { label: 'Pausado', bg: 'bg-ink-100', fg: 'text-ink-600' }
  if (client.forcePwChange) return { label: 'Pend. sync', bg: 'bg-info-100 dark:bg-info-100/[0.18]', fg: 'text-info-600' }
  return { label: 'Activo', bg: 'bg-success-100 dark:bg-success-100/[0.18]', fg: 'text-success-700' }
}

const DENSE_COLS = {
  name: 150,
  status: 84,
  score: 64,
  adherence: 96,
  weight: 92,
  last: 78,
  program: 150,
  days: 56,
  actions: 44,
} as const

function DenseHeaderCell({
  label,
  width,
  sort,
  sortKey,
  sortDir,
  onSort,
  center = false,
}: {
  label: string
  width: number
  sort?: DirectorySortKey
  sortKey: DirectorySortKey
  sortDir: SortDir
  onSort: (key: DirectorySortKey) => void
  center?: boolean
}) {
  const active = sort === sortKey
  const SortIcon = sortDir === 'asc' ? ChevronUp : ChevronDown
  return (
    <TouchableOpacity
      disabled={!sort}
      activeOpacity={sort ? 0.72 : 1}
      onPress={() => sort && onSort(sort)}
      style={[styles.denseHeaderCell, { width }, center && styles.denseCenter]}
    >
      <Text numberOfLines={1} className={active ? 'text-strong' : 'text-subtle'} style={styles.denseHeaderText}>{label}</Text>
      {active ? <SortIcon size={12} className="text-strong" /> : null}
    </TouchableOpacity>
  )
}

function DenseDirectoryTable({
  clients,
  pulseById,
  sortKey,
  sortDir,
  onHeaderSort,
  onOpen,
  onActions,
  theme,
}: {
  clients: DirectoryClient[]
  pulseById: Map<string, PulseRow>
  sortKey: DirectorySortKey
  sortDir: SortDir
  onHeaderSort: (key: DirectorySortKey) => void
  onOpen: (client: DirectoryClient) => void
  onActions: (client: DirectoryClient) => void
  theme: any
}) {
  return (
    <View style={[styles.denseShell, { borderColor: theme.border, borderRadius: theme.radius.card }]}>
      <View style={styles.denseTableRow}>
        <View style={[styles.denseFixedColumn, { width: DENSE_COLS.name, borderColor: theme.border }]}>
          <View className="border-b border-default bg-surface-sunken">
            <DenseHeaderCell label="Alumno" width={DENSE_COLS.name} sort="name_asc" sortKey={sortKey} sortDir={sortDir} onSort={onHeaderSort} />
          </View>
          {clients.map((client, index) => (
            <TouchableOpacity
              key={client.id}
              activeOpacity={0.76}
              onPress={() => onOpen(client)}
              className={`bg-surface-card ${index < clients.length - 1 ? 'border-b border-subtle' : ''}`}
              style={[styles.denseNameCell, { width: DENSE_COLS.name }]}
            >
              <View className="bg-ink-900" style={styles.denseAvatar}>
                <Text className="text-sport-400" style={styles.denseAvatarText}>{client.fullName?.[0] ?? '?'}</Text>
              </View>
              <View style={styles.denseNameCopy}>
                <Text numberOfLines={1} className="text-strong" style={styles.denseName}>{client.fullName}</Text>
                <Text numberOfLines={1} className="text-subtle" style={styles.denseEmail}>{client.email || '—'}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
          <View>
            <View className="border-b border-default bg-surface-sunken" style={styles.denseHeaderRow}>
              <DenseHeaderCell label="Estado" width={DENSE_COLS.status} sortKey={sortKey} sortDir={sortDir} onSort={onHeaderSort} />
              <DenseHeaderCell label="Score" width={DENSE_COLS.score} sort="attention_score" sortKey={sortKey} sortDir={sortDir} onSort={onHeaderSort} center />
              <DenseHeaderCell label="Adh." width={DENSE_COLS.adherence} sort="adherence" sortKey={sortKey} sortDir={sortDir} onSort={onHeaderSort} />
              <DenseHeaderCell label="Peso" width={DENSE_COLS.weight} sort="weight_change" sortKey={sortKey} sortDir={sortDir} onSort={onHeaderSort} />
              <DenseHeaderCell label="Último" width={DENSE_COLS.last} sort="last_workout" sortKey={sortKey} sortDir={sortDir} onSort={onHeaderSort} />
              <DenseHeaderCell label="Programa" width={DENSE_COLS.program} sortKey={sortKey} sortDir={sortDir} onSort={onHeaderSort} />
              <DenseHeaderCell label="Días" width={DENSE_COLS.days} sort="plan_days" sortKey={sortKey} sortDir={sortDir} onSort={onHeaderSort} center />
              <DenseHeaderCell label="" width={DENSE_COLS.actions} sortKey={sortKey} sortDir={sortDir} onSort={onHeaderSort} center />
            </View>
            {clients.map((client, index) => {
              const pulse = pulseById.get(client.id)
              const status = statusMeta(client)
              const score = pulse?.attentionScore ?? client.attentionScore
              const adherence = pulse?.percentage ?? 0
              const nutritionPct = pulse?.nutritionPercentage ?? 0
              const nutritionRisk = !!pulse && ((pulse.attentionFlags ?? []).includes('NUTRICION_RIESGO') || (nutritionPct > 0 && nutritionPct < 60))
              const lastDays = daysSince(pulse?.lastWorkoutDate ?? client.lastWorkoutDate)
              const delta = pulse?.weightDelta7d
              const scoreTone = score >= 50
                ? { bg: 'bg-danger-100 dark:bg-danger-100/[0.18]', fg: 'text-danger-700' }
                : score >= 25
                  ? { bg: 'bg-warning-100 dark:bg-warning-100/[0.18]', fg: 'text-warning-700' }
                  : { bg: 'bg-success-100 dark:bg-success-100/[0.18]', fg: 'text-success-700' }
              const adherenceColor = adherence >= 75 ? SUCCESS : adherence >= 50 ? WARNING : DANGER
              const dotColor = lastDays != null && lastDays < 3 ? SUCCESS : lastDays != null && lastDays < 7 ? WARNING : DANGER
              return (
                <TouchableOpacity
                  key={client.id}
                  activeOpacity={0.76}
                  onPress={() => onOpen(client)}
                  className={`bg-surface-card ${index < clients.length - 1 ? 'border-b border-subtle' : ''}`}
                  style={styles.denseDataRow}
                >
                  <View style={[styles.denseCell, { width: DENSE_COLS.status }]}>
                    <View className={`${status.bg} rounded-pill`} style={styles.denseStatusPill}>
                      <Text className={status.fg} style={styles.denseStatusText}>{status.label}</Text>
                    </View>
                  </View>
                  <View style={[styles.denseCell, styles.denseCenter, { width: DENSE_COLS.score }]}>
                    <View className={`${scoreTone.bg} rounded-xs`} style={styles.denseScorePill}>
                      <Text className={scoreTone.fg} style={styles.denseScoreText}>{score}</Text>
                    </View>
                  </View>
                  <View style={[styles.denseCell, { width: DENSE_COLS.adherence }]}>
                    {nutritionRisk ? <Apple size={13} className="text-ember-700" /> : null}
                    <View className="bg-surface-sunken rounded-pill" style={styles.denseAdherenceTrack}>
                      <View style={[styles.denseAdherenceFill, { width: `${Math.max(0, Math.min(100, adherence))}%`, backgroundColor: adherenceColor }]} />
                    </View>
                    <Text className="text-strong" style={styles.denseMetricSmall}>{adherence}</Text>
                  </View>
                  <View style={[styles.denseCell, { width: DENSE_COLS.weight }]}>
                    <View>
                      <Text className="text-strong" style={styles.denseMetric}>{pulse?.currentWeight != null ? `${pulse.currentWeight} kg` : '—'}</Text>
                      {delta != null ? (
                        <Text className={delta < 0 ? 'text-success-600' : delta > 0 ? 'text-danger-600' : 'text-subtle'} style={styles.denseDelta}>
                          {delta > 0 ? '+' : ''}{delta} (7d)
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={[styles.denseCell, { width: DENSE_COLS.last }]}>
                    <View style={[styles.denseDot, { backgroundColor: dotColor }]} />
                    <Text numberOfLines={1} className="text-body" style={styles.denseLast}>{lastActivityLabel(lastDays)}</Text>
                  </View>
                  <View style={[styles.denseCell, { width: DENSE_COLS.program }]}>
                    <Text numberOfLines={1} className={client.activeProgramName ? 'text-body' : 'text-subtle'} style={styles.denseProgram}>{client.activeProgramName ?? '—'}</Text>
                  </View>
                  <View style={[styles.denseCell, styles.denseCenter, { width: DENSE_COLS.days }]}>
                    <Text className={client.planDaysRemaining != null && client.planDaysRemaining <= 0 ? 'text-danger-600' : 'text-strong'} style={styles.denseMetric}>
                      {client.planDaysRemaining ?? '—'}
                    </Text>
                  </View>
                  <View style={[styles.denseCell, styles.denseCenter, { width: DENSE_COLS.actions }]}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Acciones de ${client.fullName}`}
                      onPress={(event) => { event.stopPropagation(); onActions(client) }}
                      style={styles.denseActionsBtn}
                    >
                      <MoreVertical size={16} className="text-subtle" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  )
}

function DirectoryScreenHeader({ theme, trailing }: { theme: any; trailing?: React.ReactNode }) {
  return (
    <View style={styles.screenHeader}>
      <View style={styles.screenHeaderCopy}>
        <Text style={[styles.screenEyebrow, { color: theme.mutedForeground }]}>Tu seguimiento de hoy</Text>
        <Text style={[styles.screenTitle, { color: theme.foreground }]}>Alumnos</Text>
      </View>
      {trailing ? <View>{trailing}</View> : null}
    </View>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ClientesScreen() {
  const { onScroll: onTabbarScroll } = useCoachTabbarScroll()
  const { theme } = useTheme()
  const router = useRouter()
  const workspace = useWorkspace()
  // Acceso a Herramientas (hub /coach/tools): mismo gate que el sidebar web (toolsEnabled)
  // — visible solo con ≥1 modulo del hub activo (cardio/movimiento/composicion).
  const { hasModule } = useEntitlements()
  const toolsEnabled = hasModule('cardio') || hasModule('movement_assessment') || hasModule('body_composition')

  const [clients, setClients] = useState<DirectoryClient[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState<DirectoryRiskFilter>('all')
  const [programFilter, setProgramFilter] = useState<DirectoryProgramFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('any')
  const [sortKey, setSortKey] = useState<DirectorySortKey>('attention_score')
  const [showSortSheet, setShowSortSheet] = useState(false)
  const [showFilterSheet, setShowFilterSheet] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [copied, setCopied] = useState(false)
  const [dismissed, setDismissed] = useState<Record<string, { date: string; count: number }>>({})
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [visibleTableCount, setVisibleTableCount] = useState(48)
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [pulseById, setPulseById] = useState<Map<string, PulseRow>>(new Map())
  const [pulseError, setPulseError] = useState(false)
  const [coachSlug, setCoachSlug] = useState<string>('')
  const [coachPrimaryColor, setCoachPrimaryColor] = useState<string | null>(null)
  const [maxClients, setMaxClients] = useState<number>(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DirectoryClient | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [resetTarget, setResetTarget] = useState<DirectoryClient | null>(null)
  const [resetPassword, setResetPassword] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [actionsClient, setActionsClient] = useState<DirectoryClient | null>(null)

  // Gotcha 6b: la pantalla vive en un tab persistente (no se desmonta). Un
  // `useEffect(load,[])` de un disparo dejaba el roster CONGELADO al volver de la
  // ficha (tras archivar/pausar/eliminar). `useFocusEffect` refresca en cada foco:
  // primer foco = carga con loader; focos posteriores = refresco en background
  // (sin loader ni spinner de pull) para que el retorno sea invisible pero fresco.
  const isFirstFocus = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (!workspace.ready) return
      if (isFirstFocus.current) {
        isFirstFocus.current = false
        load()
      } else {
        fetchDirectoryData().catch(() => {})
      }
    }, [workspace.ready, workspace.orgId, workspace.teamId])
  )
  useEffect(() => {
    getCoachProfile().then((c) => {
      if (c?.slug) setCoachSlug(c.slug)
      if (c?.maxClients) setMaxClients(c.maxClients)
      if (c?.primaryColor) setCoachPrimaryColor(c.primaryColor)
    }).catch(() => {})
  }, [])
  function toggleView() {
    setViewMode((current) => current === 'cards' ? 'table' : 'cards')
  }
  useEffect(() => {
    AsyncStorage.getItem('eva_alumnos_alerts_dismissed').then((raw) => {
      if (raw) { try { setDismissed(JSON.parse(raw)) } catch {} }
    })
  }, [])

  async function load(silent = false) {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setLoadError(null)
    try {
      await fetchDirectoryData()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'No se pudo cargar la cartera.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function fetchDirectoryData() {
    const [clientsResult, pulseResult] = await Promise.allSettled([
      getCoachDirectoryClients({ orgId: workspace.orgId, teamId: workspace.teamId }),
      getCoachDirectoryPulse(),
    ])
    if (clientsResult.status === 'rejected') throw clientsResult.reason
    setClients(clientsResult.value)
    if (pulseResult.status === 'fulfilled') {
      setPulseById(pulseResult.value)
      setPulseError(false)
    } else {
      setPulseById(new Map())
      // El endpoint pulse mobile aún no admite team; la web también entrega pulse
      // vacío en ese workspace. No inventar un error visual exclusivo de RN.
      setPulseError(!workspace.teamId)
    }
  }

  // Pulse (métricas ricas) en paralelo — las cards lo muestran cuando llega.
  // Ya NO se traga el error en silencio: marca pulseError → banner con reintento.
  function loadPulse() {
    setPulseError(false)
    getCoachDirectoryPulse()
      .then(setPulseById)
      .catch(() => setPulseError(true))
  }

  // La fuente de score es el pulse del servidor, igual que web. El roster local
  // solo actua como fallback mientras llega la respuesta rica.
  const clientsWithPulseScore = useMemo(
    () => clients.map((client) => {
      const pulse = pulseById.get(client.id)
      return {
        ...client,
        attentionScore: pulse?.attentionScore ?? 0,
        lastWorkoutDate: pulse?.lastWorkoutDate ?? client.lastWorkoutDate,
      }
    }),
    [clients, pulseById]
  )

  const stats = useMemo(() => buildStats(clientsWithPulseScore), [clientsWithPulseScore])

  const displayed = useMemo(() => {
    const filtered = filterClients(clientsWithPulseScore, search, riskFilter, statusFilter, pulseById, programFilter)
    return sortClients(filtered, sortKey, sortDir, pulseById)
  }, [clientsWithPulseScore, search, riskFilter, programFilter, statusFilter, sortKey, sortDir, pulseById])
  const visibleTableClients = useMemo(() => displayed.slice(0, visibleTableCount), [displayed, visibleTableCount])
  const tableRemaining = Math.max(0, displayed.length - visibleTableCount)
  useEffect(() => {
    setVisibleTableCount(48)
  }, [search, riskFilter, programFilter, statusFilter, sortKey, sortDir, viewMode])

  const urgentBanner = stats.urgentCount > 0
  const expiredBanner = stats.expiredProgramCount > 0
  const syncBanner = stats.pendingSyncCount > 0
  // A-F10: contador de adherencia nutricional baja (desde el pulse) para banner de triage.
  const nutritionLowCount = useMemo(
    () => [...pulseById.values()].filter((p) => (p.attentionFlags?.includes('NUTRICION_RIESGO')) || (p.nutritionPercentage > 0 && p.nutritionPercentage < 60)).length,
    [pulseById]
  )
  // Adherencia promedio (espejo web CoachWarRoom) + total archivados — métricas derivadas del pulse/lista ya cargados.
  const avgAdherence = useMemo(() => {
    const vals = [...pulseById.values()]
    return vals.length ? Math.round(vals.reduce((a, p) => a + p.percentage, 0) / vals.length) : 0
  }, [pulseById])
  const archivedCount = useMemo(() => clients.filter((c) => c.isArchived).length, [clients])

  // Swipe-to-dismiss alerts: hidden until the next day OR until the count changes.
  const todayIso = getSantiagoIsoYmdForUtcInstant(new Date().toISOString())
  const isDismissed = (key: string, count: number) => {
    const d = dismissed[key]
    return !!d && d.date === todayIso && d.count === count
  }
  const dismissAlert = (key: string, count: number) => {
    const next = { ...dismissed, [key]: { date: todayIso, count } }
    setDismissed(next)
    AsyncStorage.setItem('eva_alumnos_alerts_dismissed', JSON.stringify(next)).catch(() => {})
  }

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? 'Urgencia'
  const sportTokens = useMemo(() => deriveSportTokens(coachPrimaryColor || theme.primary), [coachPrimaryColor, theme.primary])
  const toolsTileBackground = theme.scheme === 'dark' ? sportTokens.dark['100'] : sportTokens.ramp['100']
  const toolsTileForeground = theme.scheme === 'dark' ? sportTokens.dark['600'] : sportTokens.ramp['600']

  const handleSortChange = (key: DirectorySortKey) => {
    setSortKey(key)
    setSortDir(defaultSortDir(key))
  }
  const handleHeaderSort = (key: DirectorySortKey) => {
    if (sortKey === key) setSortDir((current) => current === 'asc' ? 'desc' : 'asc')
    else handleSortChange(key)
  }

  const toggleRisk = (f: DirectoryRiskFilter) => setRiskFilter(riskFilter === f ? 'all' : f)
  // Espejo `clearAll` web (`DirectoryActionBar.tsx:200-205`): resetea riesgo/programa
  // (fundidos en riskFilter), estado y búsqueda.
  const clearFilters = () => { setRiskFilter('all'); setProgramFilter('all'); setStatusFilter('any'); setSearch('') }

  // ── Acciones rápidas por alumno ──────────────────────────────────────────
  function handleWhatsApp(c: DirectoryClient) {
    if (!c.phone || !coachSlug) return
    openWhatsApp(c.phone, c.fullName, clientLoginUrl(coachSlug)).catch(() => {})
  }
  function handleShare(c: DirectoryClient) {
    if (!coachSlug) return
    shareLogin(c.fullName, clientLoginUrl(coachSlug)).catch(() => {})
  }
  // Copiar el portal de alumnos al portapapeles (espejo web CoachWarRoom copiar-portal).
  function handleCopyPortal() {
    if (!coachSlug) return
    Clipboard.setStringAsync(clientLoginUrl(coachSlug))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
      .catch(() => {})
  }
  function handleToggle(c: DirectoryClient) {
    // TX-5: confirmar acción reversible pero sensible (pausa/activa acceso del alumno).
    const pausing = c.isActive
    Alert.alert(
      pausing ? 'Pausar alumno' : 'Activar alumno',
      pausing ? `${c.fullName} perderá acceso a la app hasta reactivarlo.` : `${c.fullName} recuperará el acceso a la app.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: pausing ? 'Pausar' : 'Activar',
          style: pausing ? 'destructive' : 'default',
          onPress: () => setClientStatus(c.id, { is_active: !c.isActive }).then(() => load(true)).catch((e: any) => Alert.alert('Error', e?.message ?? 'No se pudo.')),
        },
      ]
    )
  }
  function handleReset(c: DirectoryClient) {
    setResetTarget(c)
    setResetPassword(null)
    setResetError(null)
  }
  async function confirmReset() {
    if (!resetTarget || resetting) return
    setResetting(true)
    setResetError(null)
    try {
      setResetPassword(await resetClientPassword(resetTarget.id))
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'No se pudo resetear la contraseña.')
    } finally {
      setResetting(false)
    }
  }
  function handleDelete(c: DirectoryClient) {
    setDeleteConfirm('')
    setDeleteError(null)
    setDeleteTarget(c)
  }
  async function confirmDelete() {
    if (!deleteTarget || deleting || deleteConfirm.trim().toLowerCase() !== deleteTarget.fullName.toLowerCase()) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteClient(deleteTarget.id)
      setDeleteTarget(null)
      setDeleteConfirm('')
      await load(true)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'No se pudo eliminar el alumno.')
    } finally {
      setDeleting(false)
    }
  }
  // Editar datos: la superficie de edición en móvil es la ficha (NativeDialog "Editar
  // alumno" con EditClientForm), a diferencia del modal inline del web. Ver PENDIENTE-
  // DECISION-CEO en el resumen (cambio de gesto: modal inline → navegar a ficha).
  function handleEdit(c: DirectoryClient) {
    router.push(`/coach/cliente/${c.id}`)
  }
  function handleArchive(c: DirectoryClient) {
    // Espejo web ClientActionsSheet archive (:222-227): archivar/desarchivar con
    // confirmación (TX-5, acción reversible pero sensible).
    const archiving = !c.isArchived
    Alert.alert(
      archiving ? 'Archivar alumno' : 'Desarchivar alumno',
      archiving ? `${c.fullName} se moverá al archivo y dejará de contar como alumno activo.` : `${c.fullName} volverá a tu cartera activa.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: archiving ? 'Archivar' : 'Desarchivar',
          style: archiving ? 'destructive' : 'default',
          onPress: () => setClientStatus(c.id, { is_archived: archiving }).then(() => load(true)).catch((e: any) => Alert.alert('Error', e?.message ?? 'No se pudo.')),
        },
      ]
    )
  }
  // Estable (useCallback): permite que DirRowCard (memo) omita re-render cuando llega el pulse de otras filas.
  const goProfile = useCallback((c: DirectoryClient) => router.push(`/coach/cliente/${c.id}`), [router])
  const goWorkout = (c: DirectoryClient) => router.push(`/coach/program-builder?clientId=${c.id}&clientName=${encodeURIComponent(c.fullName)}`)
  const goNutrition = () => router.push('/coach/nutricion')

  // Chips activos 1:1 con el web (`DirectoryActionBar.tsx:170-198`): riesgo/programa
  // (fundidos en riskFilter), estado y búsqueda. El badge de "Filtrar" y el highlight
  // = chips.length (web `active={chips.length > 0}`).
  const chips: { key: string; label: string; onClear: () => void }[] = []
  if (riskFilter !== 'all') chips.push({ key: 'risk', label: RISK_LABELS[riskFilter] ?? riskFilter, onClear: () => setRiskFilter('all') })
  if (programFilter !== 'all') chips.push({ key: 'program', label: programFilter === 'with_program' ? 'Con programa' : programFilter === 'no_program' ? 'Sin programa' : 'Vencido', onClear: () => setProgramFilter('all') })
  if (statusFilter !== 'any') chips.push({ key: 'status', label: STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? statusFilter, onClear: () => setStatusFilter('any') })
  if (search) chips.push({ key: 'search', label: `“${search}”`, onClear: () => setSearch('') })
  const filterActive = chips.length > 0

  const headerActions = (
    <View style={styles.headerActions}>
      {coachSlug ? (
        <TouchableOpacity
          testID="directory-copy-portal"
          accessibilityRole="button"
          accessibilityLabel="Copiar portal de alumnos"
          activeOpacity={0.8}
          onPress={handleCopyPortal}
          style={[styles.headerIconBtn, { backgroundColor: theme.muted, borderRadius: theme.radius.control }]}
        >
          {copied ? <Check size={18} color={theme.primary} /> : <LinkIcon size={18} color={theme.foreground} />}
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        testID="directory-import-btn"
        accessibilityRole="button"
        accessibilityLabel="Importar alumnos"
        activeOpacity={0.8}
        onPress={() => setShowImport(true)}
        style={[styles.headerIconBtn, { backgroundColor: theme.muted, borderRadius: theme.radius.control }]}
      >
        <FileUp size={18} color={theme.foreground} />
      </TouchableOpacity>
    </View>
  )

  const headerNode = (
    <>
      <DirectoryScreenHeader theme={theme} trailing={headerActions} />

      {/* Entrada Herramientas (hub /coach/tools) — card prominente, espejo CoachWarRoom móvil */}
      {toolsEnabled && (
        <TouchableOpacity
          testID="directory-tools-card"
          activeOpacity={0.85}
          onPress={() => router.push('/coach/tools')}
          style={[
            styles.toolsCard,
            shadow('xs', theme.scheme),
            { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.card },
          ]}
        >
          <View style={[styles.toolsTile, { backgroundColor: toolsTileBackground }]}>
            <LayoutGrid size={19} color={toolsTileForeground} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.toolsCardTitle, { color: theme.foreground }]}>Herramientas</Text>
            <Text numberOfLines={1} style={[styles.toolsCardSub, { color: theme.mutedForeground }]}>Cardio · Movimiento · Composición</Text>
          </View>
          <ChevronRight size={18} color={theme.ink300} />
        </TouchableOpacity>
      )}

      {/* Resumen · hoy — pulso de prioridad + métricas secundarias (espejo CoachWarRoom) */}
      <DirectorySummary
        stats={stats}
        riskFilter={riskFilter}
        onToggleRisk={toggleRisk}
        onSetAllRisk={() => setRiskFilter('all')}
        avgAdherence={avgAdherence}
        nutritionLowCount={nutritionLowCount}
      />

      {/* Alert banners */}
      {urgentBanner && !isDismissed('urgent', stats.urgentCount) && (
        <DirectoryAlertBanner testID="directory-alert-urgent" message={`${stats.urgentCount} alumno${stats.urgentCount !== 1 ? 's' : ''} con atención urgente`} color={DANGER} onPress={() => setRiskFilter('urgent')} onDismiss={() => dismissAlert('urgent', stats.urgentCount)} />
      )}
      {expiredBanner && !isDismissed('expired', stats.expiredProgramCount) && (
        <DirectoryAlertBanner testID="directory-alert-expired" message={`${stats.expiredProgramCount} programa${stats.expiredProgramCount !== 1 ? 's' : ''} vencido${stats.expiredProgramCount !== 1 ? 's' : ''}`} color={WARNING} onPress={() => setProgramFilter('expired_program')} onDismiss={() => dismissAlert('expired', stats.expiredProgramCount)} />
      )}
      {syncBanner && !isDismissed('sync', stats.pendingSyncCount) && (
        <DirectoryAlertBanner testID="directory-alert-sync" message={`${stats.pendingSyncCount} alumno${stats.pendingSyncCount !== 1 ? 's' : ''} con cambio de contraseña pendiente`} color={INFO} onPress={() => setRiskFilter('password_reset')} onDismiss={() => dismissAlert('sync', stats.pendingSyncCount)} />
      )}
      {nutritionLowCount > 0 && !isDismissed('nutrition_low', nutritionLowCount) && (
        <DirectoryAlertBanner testID="directory-alert-nutrition" message={`${nutritionLowCount} alumno${nutritionLowCount !== 1 ? 's' : ''} con adherencia nutricional baja`} color={EMBER} onPress={() => setRiskFilter('nutrition_low')} onDismiss={() => dismissAlert('nutrition_low', nutritionLowCount)} />
      )}
      {pulseError && (
        <TouchableOpacity testID="directory-pulse-retry" activeOpacity={0.85} onPress={loadPulse} style={[styles.pulseErr, { backgroundColor: DANGER + '14', borderColor: DANGER + '40' }]}>
          <Text style={[styles.pulseErrTxt, { color: DANGER }]}>No se pudieron cargar las métricas (peso/adherencia).</Text>
          <Text style={[styles.pulseErrAction, { color: DANGER }]}>Reintentar</Text>
        </TouchableOpacity>
      )}

      {clients.length > 0 ? (
        <>
          {/* Action bar web: despues de WarRoom/Herramientas y antes de chips/conteo. */}
          <View style={styles.actionBar}>
            <Input
              testID="directory-search-input"
              leftIcon={Search}
              placeholder="Buscar alumno…"
              value={search}
              onChangeText={setSearch}
              clearButtonMode="while-editing"
              autoCapitalize="none"
              autoCorrect={false}
              containerStyle={{ flex: 1 }}
            />
            <BarButton testID="directory-filter-btn" label="Filtros" theme={theme} onPress={() => setShowFilterSheet(true)} active={filterActive} badge={chips.length}>
              <SlidersHorizontal size={16} color={filterActive ? theme.card : theme.mutedForeground} />
            </BarButton>
            <BarButton testID="directory-sort-btn" label="Ordenar" theme={theme} onPress={() => setShowSortSheet(true)}>
              <ArrowUpDown size={16} color={theme.mutedForeground} />
            </BarButton>
            <BarButton testID="directory-view-toggle" label={viewMode === 'cards' ? 'Ver como tabla' : 'Ver como tarjetas'} theme={theme} onPress={toggleView}>
              {viewMode === 'cards' ? <Table2 size={16} color={theme.mutedForeground} /> : <LayoutGrid size={16} color={theme.mutedForeground} />}
            </BarButton>
          </View>

          {/* Active filter chips */}
          {chips.length > 0 && (
            <View style={styles.chipRow}>
              {chips.map((c) => (
                <TouchableOpacity key={c.key} testID={`directory-chip-${c.key}`} style={[styles.filterChip, { backgroundColor: theme.foreground }]} onPress={c.onClear} activeOpacity={0.85}>
                  <Text style={[styles.filterChipText, { color: theme.card }]}>{c.label}</Text>
                  <X size={12} color={theme.card} style={{ opacity: 0.7 }} />
                </TouchableOpacity>
              ))}
              <TouchableOpacity testID="directory-clear-filters" onPress={clearFilters} activeOpacity={0.7}>
                <Text style={[styles.clearLink, { color: theme.mutedForeground }]}>Limpiar</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Sort label / result count */}
          <View style={styles.sortRow}>
            <Text style={[styles.sortLabel, { color: theme.mutedForeground }]}>
              {displayed.length} alumno{displayed.length !== 1 ? 's' : ''}{statusFilter === 'archived' ? ' archivados' : ''} <Text style={{ color: theme.ink300 }}>·</Text> {sortLabel}
            </Text>
          </View>
        </>
      ) : null}
    </>
  )

  // Dos estados vacíos distintos, 1:1 con el web:
  //  · roster cero → `ClientsDirectoryEmpty.tsx:12-45` ("Suma tu primer alumno" + CTAs Crear/Importar).
  //  · filtro/búsqueda sin resultados → `ClientsDirectoryClient.tsx:266-284` (SearchX + "Limpiar filtros").
  const emptyNode = clients.length === 0 ? (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIcon, { backgroundColor: hexToRgba(theme.primary, 0.1) }]}>
        <Users size={34} color={theme.primary} strokeWidth={1.75} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.foreground }]}>Suma tu primer alumno</Text>
      <Text style={[styles.emptySub, { color: theme.mutedForeground }]}>
        Crea un alumno y recibirá su acceso, o importa tu cartera completa desde Excel/CSV.
      </Text>
      <View style={styles.emptyCtas}>
        <Button label="Crear alumno" variant="sport" size="lg" full leftIcon={UserPlus} onPress={() => setShowCreate(true)} />
        <Button label="Importar cartera" variant="secondary" size="lg" full leftIcon={FileUp} onPress={() => setShowImport(true)} />
      </View>
    </View>
  ) : (
    <View style={styles.filteredEmptyWrap}>
      <View style={[styles.filteredEmptyCard, { borderColor: theme.border, backgroundColor: theme.muted }]}>
        <View style={[styles.filteredEmptyIcon, { backgroundColor: theme.card }]}>
          <SearchX size={24} color={theme.mutedForeground} />
        </View>
        <Text style={[styles.filteredEmptyTitle, { color: theme.foreground }]}>Sin resultados</Text>
        <Text style={[styles.filteredEmptySub, { color: theme.mutedForeground }]}>Ningún alumno coincide con estos filtros.</Text>
        <Button label="Limpiar filtros" variant="primary" size="sm" onPress={clearFilters} style={styles.filteredEmptyBtn} />
      </View>
    </View>
  )

  if (loading) {
    return (
      <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: theme.background }]}>
        <DirectoryScreenHeader theme={theme} />
        <EvaLoaderScreen subtitle="Cargando alumnos…" />
      </SafeAreaView>
    )
  }

  if (loadError && clients.length === 0) {
    return (
      <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <DirectoryScreenHeader theme={theme} />
        <View style={styles.filteredEmptyWrap}>
          <View style={[styles.filteredEmptyCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Text style={[styles.filteredEmptyTitle, { color: theme.foreground }]}>No pudimos cargar tus alumnos</Text>
            <Text style={[styles.filteredEmptySub, { color: theme.mutedForeground }]}>{loadError}</Text>
            <Button label="Reintentar" variant="primary" size="sm" onPress={() => load()} style={styles.filteredEmptyBtn} />
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />

      {viewMode === 'cards' ? (
        <FlatList
          data={displayed}
          keyExtractor={(c) => c.id}
          renderItem={({ item, index }) => (
            <View style={styles.directoryRowWrap}>
              <DirRowCard
                item={item}
                index={index}
                theme={theme}
                pulse={pulseById.get(item.id)}
                onOpen={goProfile}
                onWhatsApp={item.phone && coachSlug ? handleWhatsApp : undefined}
                onEdit={handleEdit}
                onShare={handleShare}
                onWorkout={goWorkout}
                onNutrition={goNutrition}
                onReset={handleReset}
                onToggle={handleToggle}
                onArchive={handleArchive}
                onDelete={handleDelete}
              />
            </View>
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onScroll={onTabbarScroll}
          scrollEventThrottle={16}
          onRefresh={() => load(true)}
          refreshing={refreshing}
          ListHeaderComponent={headerNode}
          ListEmptyComponent={emptyNode}
        />
      ) : (
        <FlatList
          data={[] as DirectoryClient[]}
          keyExtractor={(c) => c.id}
          renderItem={() => null}
          contentContainerStyle={styles.tableList}
          showsVerticalScrollIndicator={false}
          onScroll={onTabbarScroll}
          scrollEventThrottle={16}
          onRefresh={() => load(true)}
          refreshing={refreshing}
          ListHeaderComponent={
            <>
              {headerNode}
              {displayed.length > 0 ? (
                <>
                  <DenseDirectoryTable
                    clients={visibleTableClients}
                    pulseById={pulseById}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onHeaderSort={handleHeaderSort}
                    onOpen={goProfile}
                    onActions={setActionsClient}
                    theme={theme}
                  />
                  {tableRemaining > 0 ? (
                    <View style={styles.loadMoreWrap}>
                      <TouchableOpacity
                        activeOpacity={0.78}
                        onPress={() => setVisibleTableCount((current) => Math.min(current + 48, displayed.length))}
                        style={[styles.loadMoreButton, { backgroundColor: theme.muted, borderColor: theme.border }]}
                      >
                        <Text style={[styles.loadMoreText, { color: theme.foreground }]}>Cargar más ({tableRemaining} restantes)</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </>
              ) : emptyNode}
            </>
          }
        />
      )}

      {/* FAB web: existe con roster; el zero-state usa sus CTAs propios. */}
      {clients.length > 0 ? (
        <TouchableOpacity
          testID="directory-fab-new-client"
          style={[styles.fab, { backgroundColor: theme.primary }, GLOWS.sport]}
          onPress={() => setShowCreate(true)}
          activeOpacity={0.9}
        >
          <UserPlus size={19} color="#fff" />
          <Text style={styles.fabLabel}>Nuevo alumno</Text>
        </TouchableOpacity>
      ) : null}

      {/* Sheets */}
      <DirectoryOptionSheet
        visible={showSortSheet}
        title="Ordenar por"
        options={SORT_OPTIONS}
        selected={sortKey}
        onSelect={(v) => handleSortChange(v as DirectorySortKey)}
        onClose={() => setShowSortSheet(false)}
        theme={theme}
      />
      <DirectoryFilterSheet
        visible={showFilterSheet}
        onClose={() => setShowFilterSheet(false)}
        theme={theme}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        riskFilter={riskFilter}
        onRiskChange={setRiskFilter}
        programFilter={programFilter}
        onProgramChange={setProgramFilter}
        archivedCount={archivedCount}
      />
      <CreateClientModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => load()}
        theme={theme}
      />

      {actionsClient ? (
        <ClientActionsSheet
          visible
          client={actionsClient}
          theme={theme}
          onClose={() => setActionsClient(null)}
          onProfile={() => goProfile(actionsClient)}
          onWhatsApp={actionsClient.phone && coachSlug ? () => handleWhatsApp(actionsClient) : undefined}
          onEdit={() => handleEdit(actionsClient)}
          onShare={() => handleShare(actionsClient)}
          onWorkout={() => goWorkout(actionsClient)}
          onNutrition={goNutrition}
          onReset={() => handleReset(actionsClient)}
          onToggle={() => handleToggle(actionsClient)}
          onArchive={() => handleArchive(actionsClient)}
          onDelete={() => handleDelete(actionsClient)}
        />
      ) : null}

      <NativeDialog open={showImport} title="Importar alumnos" onClose={() => setShowImport(false)}>
        <ImportClientsForm
          theme={theme}
          maxClients={maxClients}
          activeCount={clients.filter((c) => !c.isArchived).length}
          onDone={() => { setShowImport(false); load() }}
          onCancel={() => setShowImport(false)}
        />
      </NativeDialog>
      <NativeDialog
        open={deleteTarget !== null}
        title="Eliminar alumno"
        onClose={() => { if (!deleting) setDeleteTarget(null) }}
      >
        {deleteTarget ? (
          <View style={{ gap: 14 }}>
            <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui, fontSize: 13.5, lineHeight: 19 }}>
              Esta acción elimina a {deleteTarget.fullName} y no se puede deshacer.
            </Text>
            <View style={{ gap: 6 }}>
              <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui, fontSize: 12 }}>
                Escribe <Text style={{ color: theme.foreground, fontFamily: FONT.uiBold }}>{deleteTarget.fullName}</Text> para confirmar:
              </Text>
              <Input
                testID="directory-delete-confirm-input"
                value={deleteConfirm}
                onChangeText={setDeleteConfirm}
                placeholder={deleteTarget.fullName}
                editable={!deleting}
                autoCapitalize="words"
              />
            </View>
            {deleteError ? <Text style={{ color: theme.destructive, fontFamily: FONT.uiSemibold, fontSize: 13 }}>{deleteError}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label="Cancelar" variant="ghost" onPress={() => setDeleteTarget(null)} disabled={deleting} style={{ flex: 1 }} />
              <Button
                testID="directory-delete-confirm"
                label={deleting ? 'Eliminando…' : 'Eliminar'}
                variant="danger"
                onPress={confirmDelete}
                loading={deleting}
                disabled={deleting || deleteConfirm.trim().toLowerCase() !== deleteTarget.fullName.toLowerCase()}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : null}
      </NativeDialog>
      <NativeDialog
        open={resetTarget !== null}
        title={resetPassword ? 'Contraseña reseteada' : 'Resetear contraseña'}
        onClose={() => { if (!resetting) setResetTarget(null) }}
      >
        {resetTarget ? (
          <View style={{ gap: 14 }}>
            {resetPassword ? (
              <>
                <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui, fontSize: 13.5, lineHeight: 19 }}>
                  Comparte esta contraseña temporal con {resetTarget.fullName}. Deberá cambiarla al ingresar.
                </Text>
                <View style={{ padding: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.muted }}>
                  <Text selectable style={{ color: theme.foreground, fontFamily: FONT.monoBold, fontSize: 18, textAlign: 'center' }}>{resetPassword}</Text>
                </View>
                <Button testID="directory-reset-copy" label="Copiar contraseña" variant="primary" leftIcon={LinkIcon} onPress={() => Clipboard.setStringAsync(resetPassword)} full />
                <Button label="Cerrar" variant="ghost" onPress={() => setResetTarget(null)} full />
              </>
            ) : (
              <>
                <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui, fontSize: 13.5, lineHeight: 19 }}>
                  Se generará una contraseña temporal para {resetTarget.fullName}. La actual dejará de funcionar.
                </Text>
                {resetError ? <Text style={{ color: theme.destructive, fontFamily: FONT.uiSemibold, fontSize: 13 }}>{resetError}</Text> : null}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button label="Cancelar" variant="ghost" onPress={() => setResetTarget(null)} disabled={resetting} style={{ flex: 1 }} />
                  <Button testID="directory-reset-confirm" label={resetting ? 'Reseteando…' : 'Resetear'} variant="danger" onPress={confirmReset} loading={resetting} disabled={resetting} style={{ flex: 1 }} />
                </View>
              </>
            )}
          </View>
        ) : null}
      </NativeDialog>
    </SafeAreaView>
  )
}

// Botón de la barra de acción (Filtros / Orden / Vista) — DS rounded-control.
function BarButton({
  theme,
  onPress,
  active,
  badge,
  testID,
  label,
  children,
}: {
  theme: any
  onPress: () => void
  active?: boolean
  badge?: number
  testID?: string
  label?: string
  children: React.ReactNode
}) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.barBtn,
        {
          backgroundColor: active ? theme.foreground : theme.card,
          borderColor: active ? theme.foreground : theme.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {children}
      {badge != null && badge > 0 ? (
        <View style={[styles.barBadge, { backgroundColor: theme.primary, borderColor: theme.card }]}>
          <Text style={styles.barBadgeTxt}>{badge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  screenHeaderCopy: { flex: 1, minWidth: 0 },
  screenEyebrow: { fontSize: 12, fontFamily: FONT.uiBold, textTransform: 'uppercase', letterSpacing: 0.96 },
  screenTitle: { fontSize: 26, lineHeight: 29, letterSpacing: -0.78, fontFamily: FONT.displayBlack },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  barBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
  },
  barBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barBadgeTxt: { color: '#fff', fontSize: 10, fontFamily: FONT.uiExtra },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  toolsCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 11 },
  toolsTile: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  toolsCardTitle: { fontSize: 14, fontFamily: FONT.uiBold },
  toolsCardSub: { fontSize: 11.5, marginTop: 1, fontFamily: FONT.ui },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 9,
    paddingVertical: 6,
  },
  filterChipText: { fontSize: 12.5, fontFamily: FONT.uiSemibold },
  clearLink: { fontSize: 12.5, fontFamily: FONT.uiBold, textDecorationLine: 'underline' },
  sortRow: { paddingHorizontal: 18, paddingBottom: 10 },
  sortLabel: { fontSize: 12, fontFamily: FONT.uiMedium },
  pulseErr: { marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  pulseErrTxt: { fontSize: 12, flexShrink: 1, fontFamily: FONT.uiSemibold },
  pulseErrAction: { fontSize: 12, fontFamily: FONT.uiBold, textTransform: 'uppercase', letterSpacing: 0.4 },
  list: { paddingBottom: 120 },
  directoryRowWrap: { marginHorizontal: 16, marginBottom: 8 },
  tableList: { paddingBottom: 120 },
  denseShell: { marginHorizontal: 16, borderWidth: 1, overflow: 'hidden' },
  denseTableRow: { flexDirection: 'row', alignItems: 'flex-start' },
  denseFixedColumn: { zIndex: 2, borderRightWidth: 1 },
  denseHeaderRow: { flexDirection: 'row', height: 38 },
  denseHeaderCell: { height: 38, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10 },
  denseHeaderText: { fontSize: 10.5, fontFamily: FONT.uiBold, textTransform: 'uppercase', letterSpacing: 0.525 },
  denseCenter: { justifyContent: 'center' },
  denseNameCell: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
  denseAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  denseAvatarText: { fontSize: 13, fontFamily: FONT.displayBold },
  denseNameCopy: { flex: 1, minWidth: 0 },
  denseName: { fontSize: 13, fontFamily: FONT.uiBold },
  denseEmail: { fontSize: 10.5, marginTop: 1, fontFamily: FONT.ui },
  denseDataRow: { height: 52, flexDirection: 'row', alignItems: 'stretch' },
  denseCell: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  denseStatusPill: { paddingHorizontal: 8, paddingVertical: 2 },
  denseStatusText: { fontSize: 11, fontFamily: FONT.uiBold },
  denseScorePill: { minWidth: 26, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' },
  denseScoreText: { fontSize: 12.5, fontFamily: FONT.monoBold },
  denseAdherenceTrack: { height: 5, minWidth: 20, flex: 1, overflow: 'hidden' },
  denseAdherenceFill: { height: 5 },
  denseMetricSmall: { fontSize: 11.5, fontFamily: FONT.monoBold },
  denseMetric: { fontSize: 12.5, fontFamily: FONT.monoBold },
  denseDelta: { fontSize: 10.5, fontFamily: FONT.uiSemibold },
  denseDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  denseLast: { fontSize: 12, fontFamily: FONT.ui },
  denseProgram: { fontSize: 12, fontFamily: FONT.ui, flexShrink: 1 },
  denseActionsBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  loadMoreWrap: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 32, paddingTop: 12 },
  loadMoreButton: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 8 },
  loadMoreText: { fontSize: 14, fontFamily: FONT.uiSemibold },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, paddingTop: 48 },
  emptyIcon: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 22, letterSpacing: -0.5, fontFamily: FONT.displayBlack },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20, maxWidth: 280, fontFamily: FONT.ui },
  emptyCtas: { width: '100%', maxWidth: 280, gap: 10, marginTop: 10 },
  // Filtro/búsqueda sin resultados — card punteada (espejo web ClientsDirectoryClient:266-284).
  filteredEmptyWrap: { paddingHorizontal: 16, paddingTop: 24 },
  filteredEmptyCard: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 36, alignItems: 'center' },
  filteredEmptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  filteredEmptyTitle: { fontSize: 16, fontFamily: FONT.displayBold },
  filteredEmptySub: { fontSize: 13, textAlign: 'center', marginTop: 4, fontFamily: FONT.ui },
  filteredEmptyBtn: { marginTop: 14, alignSelf: 'center' },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 84,
    height: 50,
    paddingHorizontal: 20,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fabLabel: { color: '#fff', fontSize: 15, fontFamily: FONT.uiBold },
})
