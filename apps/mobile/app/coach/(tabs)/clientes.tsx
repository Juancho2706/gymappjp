import { useEffect, useMemo, useState } from 'react'
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import {
  ArrowUpDown,
  LayoutGrid,
  List as ListIcon,
  Search,
  SlidersHorizontal,
  Upload,
  Users,
  UserPlus,
  X,
} from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Input, NativeDialog, ScreenHeader } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { ClientCard, CLIENT_CARD_HEIGHT } from '../../../components/coach/ClientCard'
import { DirRowCard } from '../../../components/coach/directory/DirRowCard'
import { DirectorySummary } from '../../../components/coach/directory/DirectorySummary'
import { DirectoryAlertBanner } from '../../../components/coach/directory/DirectoryAlertBanner'
import { DirectoryOptionSheet } from '../../../components/coach/directory/DirectoryOptionSheet'
import { CreateClientModal } from '../../../components/coach/directory/CreateClientModal'
import { ImportClientsForm } from '../../../components/coach/directory/ImportClientsForm'
import {
  DANGER,
  EMBER,
  INFO,
  RISK_LABELS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
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
  type DirectoryRiskFilter,
  type DirectorySortKey,
  type PulseRow,
  type SortDir,
  type StatusFilter,
} from '../../../lib/clients-directory'
import { clientLoginUrl, deleteClient, openWhatsApp, resetClientPassword, setClientStatus, shareLogin } from '../../../lib/client-actions'
import { getCoachProfile } from '../../../lib/coach'
import { FONT } from '../../../lib/typography'
import { GLOWS, SHADOWS } from '../../../lib/shadows'

const CARD_GAP = 12
const CARD_STEP = CLIENT_CARD_HEIGHT + CARD_GAP

// Item con animación de "stack": al scrollear abajo las cards se apilan arriba; al subir, salen y bajan.
function StackCardItem({ index, scrollY, headerH, children }: { index: number; scrollY: SharedValue<number>; headerH: number; children: React.ReactNode }) {
  const animStyle = useAnimatedStyle(() => {
    const slot = index * CARD_STEP
    const diff = scrollY.value - headerH - slot
    const translateY = diff > 0 ? diff - interpolate(diff, [0, CARD_STEP], [0, 8], Extrapolation.CLAMP) : 0
    const scale = interpolate(diff, [0, CARD_STEP], [1, 0.94], Extrapolation.CLAMP)
    const opacity = interpolate(diff, [0, CARD_STEP * 2, CARD_STEP * 4], [1, 1, 0.4], Extrapolation.CLAMP)
    return { transform: [{ translateY }, { scale }], opacity }
  })
  return <Animated.View style={[{ marginBottom: CARD_GAP }, animStyle]}>{children}</Animated.View>
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ClientesScreen() {
  const { theme, resolvedScheme } = useTheme()
  const router = useRouter()

  const [clients, setClients] = useState<DirectoryClient[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState<DirectoryRiskFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('any')
  const [sortKey, setSortKey] = useState<DirectorySortKey>('attention_score')
  const [showSortSheet, setShowSortSheet] = useState(false)
  const [showFilterSheet, setShowFilterSheet] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [dismissed, setDismissed] = useState<Record<string, { date: string; count: number }>>({})
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [pulseById, setPulseById] = useState<Map<string, PulseRow>>(new Map())
  const [pulseError, setPulseError] = useState(false)
  const [coachSlug, setCoachSlug] = useState<string>('')
  const scrollY = useSharedValue(0)
  const [headerH, setHeaderH] = useState(0)
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y })

  useEffect(() => { load() }, [])
  useEffect(() => {
    AsyncStorage.getItem('eva_alumnos_view').then((v) => { if (v === 'cards' || v === 'list') setViewMode(v) })
    getCoachProfile().then((c) => { if (c?.slug) setCoachSlug(c.slug) }).catch(() => {})
  }, [])
  function toggleView() {
    const next = viewMode === 'list' ? 'cards' : 'list'
    setViewMode(next)
    AsyncStorage.setItem('eva_alumnos_view', next).catch(() => {})
  }
  useEffect(() => {
    AsyncStorage.getItem('eva_alumnos_alerts_dismissed').then((raw) => {
      if (raw) { try { setDismissed(JSON.parse(raw)) } catch {} }
    })
  }, [])

  async function load(silent = false) {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    const data = await getCoachDirectoryClients()
    setClients(data)
    setLoading(false)
    setRefreshing(false)
    loadPulse()
  }

  // Pulse (métricas ricas) en paralelo — las cards lo muestran cuando llega.
  // Ya NO se traga el error en silencio: marca pulseError → banner con reintento.
  function loadPulse() {
    setPulseError(false)
    getCoachDirectoryPulse()
      .then(setPulseById)
      .catch(() => setPulseError(true))
  }

  const stats = useMemo(() => buildStats(clients), [clients])

  const displayed = useMemo(() => {
    const filtered = filterClients(clients, search, riskFilter, statusFilter, pulseById)
    return sortClients(filtered, sortKey, sortDir, pulseById)
  }, [clients, search, riskFilter, statusFilter, sortKey, sortDir, pulseById])

  const urgentBanner = stats.urgentCount > 0
  const expiredBanner = stats.expiredProgramCount > 0
  const syncBanner = stats.pendingSyncCount > 0
  // A-F10: contador de adherencia nutricional baja (desde el pulse) para banner de triage.
  const nutritionLowCount = useMemo(
    () => [...pulseById.values()].filter((p) => (p.attentionFlags?.includes('NUTRICION_RIESGO')) || (p.nutritionPercentage > 0 && p.nutritionPercentage < 60)).length,
    [pulseById]
  )

  // Swipe-to-dismiss alerts: hidden until the next day OR until the count changes.
  const todayIso = new Date().toISOString().slice(0, 10)
  const isDismissed = (key: string, count: number) => {
    const d = dismissed[key]
    return !!d && d.date === todayIso && d.count === count
  }
  const dismissAlert = (key: string, count: number) => {
    const next = { ...dismissed, [key]: { date: todayIso, count } }
    setDismissed(next)
    AsyncStorage.setItem('eva_alumnos_alerts_dismissed', JSON.stringify(next)).catch(() => {})
  }

  const hasActiveFilters = riskFilter !== 'all' || statusFilter !== 'any'
  const activeFilterCount = (riskFilter !== 'all' ? 1 : 0) + (statusFilter !== 'any' ? 1 : 0)
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? 'Urgencia'

  const toggleRisk = (f: DirectoryRiskFilter) => setRiskFilter(riskFilter === f ? 'all' : f)

  // ── Acciones rápidas por alumno ──────────────────────────────────────────
  function handleWhatsApp(c: DirectoryClient) {
    if (!c.phone || !coachSlug) return
    openWhatsApp(c.phone, c.fullName, clientLoginUrl(coachSlug)).catch(() => {})
  }
  function handleShare(c: DirectoryClient) {
    if (!coachSlug) return
    shareLogin(c.fullName, clientLoginUrl(coachSlug)).catch(() => {})
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
    // TX-5: confirmar — resetear contraseña es irreversible (invalida la actual).
    Alert.alert(
      'Resetear contraseña',
      `Se generará una contraseña temporal para ${c.fullName}. La actual dejará de funcionar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Resetear',
          style: 'destructive',
          onPress: () => resetClientPassword(c.id)
            .then((temp) => Alert.alert('Contraseña reseteada', `Contraseña temporal de ${c.fullName}: ${temp}\n\nDeberá cambiarla al ingresar.`))
            .catch((e: any) => Alert.alert('Error', e?.message ?? 'No se pudo.')),
        },
      ]
    )
  }
  function handleDelete(c: DirectoryClient) {
    Alert.alert('Eliminar alumno', `¿Eliminar a ${c.fullName}? No se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => deleteClient(c.id).then(() => load(true)).catch((e: any) => Alert.alert('Error', e?.message ?? 'No se pudo.')) },
    ])
  }
  const goProfile = (c: DirectoryClient) => router.push(`/coach/cliente/${c.id}`)
  const goWorkout = (c: DirectoryClient) => router.push(`/coach/program-builder?clientId=${c.id}&clientName=${encodeURIComponent(c.fullName)}`)
  const goNutrition = () => router.push('/coach/nutricion')

  const chips: { key: string; label: string; onClear: () => void }[] = []
  if (riskFilter !== 'all') chips.push({ key: 'risk', label: RISK_LABELS[riskFilter] ?? riskFilter, onClear: () => setRiskFilter('all') })
  if (statusFilter !== 'any') chips.push({ key: 'status', label: STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? statusFilter, onClear: () => setStatusFilter('any') })

  const headerNode = (
    <>
      {/* Resumen · hoy — pulso de prioridad + métricas secundarias (espejo CoachWarRoom) */}
      <DirectorySummary
        stats={stats}
        riskFilter={riskFilter}
        onToggleRisk={toggleRisk}
        onSetAllRisk={() => setRiskFilter('all')}
      />

      {/* Alert banners */}
      {urgentBanner && !isDismissed('urgent', stats.urgentCount) && (
        <DirectoryAlertBanner testID="directory-alert-urgent" message={`${stats.urgentCount} alumno${stats.urgentCount !== 1 ? 's' : ''} con atención urgente`} color={DANGER} onPress={() => setRiskFilter('urgent')} onDismiss={() => dismissAlert('urgent', stats.urgentCount)} />
      )}
      {expiredBanner && !isDismissed('expired', stats.expiredProgramCount) && (
        <DirectoryAlertBanner testID="directory-alert-expired" message={`${stats.expiredProgramCount} programa${stats.expiredProgramCount !== 1 ? 's' : ''} vencido${stats.expiredProgramCount !== 1 ? 's' : ''}`} color={WARNING} onPress={() => setRiskFilter('expired_program')} onDismiss={() => dismissAlert('expired', stats.expiredProgramCount)} />
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

      {/* Active filter chips */}
      {chips.length > 0 && (
        <View style={styles.chipRow}>
          {chips.map((c) => (
            <TouchableOpacity key={c.key} testID={`directory-chip-${c.key}`} style={[styles.filterChip, { backgroundColor: theme.foreground }]} onPress={c.onClear} activeOpacity={0.85}>
              <Text style={[styles.filterChipText, { color: theme.card }]}>{c.label}</Text>
              <X size={12} color={theme.card} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity testID="directory-clear-filters" onPress={() => { setRiskFilter('all'); setStatusFilter('any') }} activeOpacity={0.7}>
            <Text style={[styles.clearLink, { color: theme.mutedForeground }]}>Limpiar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sort label / result count */}
      <View style={styles.sortRow}>
        <Text style={[styles.sortLabel, { color: theme.mutedForeground }]}>
          {displayed.length} resultado{displayed.length !== 1 ? 's' : ''} <Text style={{ color: theme.border }}>·</Text> {sortLabel} ({sortDir === 'asc' ? '↑' : '↓'})
        </Text>
      </View>
    </>
  )

  const emptyNode = (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIcon, { backgroundColor: hexToRgba(theme.primary, 0.1) }]}>
        <Users size={32} color={theme.primary} strokeWidth={1.75} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.foreground }]}>
        {search || hasActiveFilters ? 'Sin resultados' : 'Sin alumnos aún'}
      </Text>
      <Text style={[styles.emptySub, { color: theme.mutedForeground }]}>
        {search || hasActiveFilters ? 'Probá ajustando los filtros o la búsqueda.' : 'Usá el botón Nuevo alumno para agregar tu primer alumno.'}
      </Text>
    </View>
  )

  if (loading) {
    return (
      <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: theme.background }]}>
        <ScreenHeader title="Alumnos" subtitle="Cargando..." />
        <EvaLoaderScreen subtitle="Cargando alumnos…" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader
        title="Alumnos"
        subtitle={`${stats.active} activos · ${stats.total} total`}
      />

      {/* Search + action bar */}
      <View style={styles.actionBar}>
        <Input
          testID="directory-search-input"
          leftIcon={Search}
          placeholder="Buscar alumno..."
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={{ flex: 1 }}
        />
        <BarButton testID="directory-filter-btn" theme={theme} onPress={() => setShowFilterSheet(true)} active={hasActiveFilters} badge={activeFilterCount}>
          <SlidersHorizontal size={18} color={hasActiveFilters ? theme.primary : theme.mutedForeground} />
        </BarButton>
        <BarButton testID="directory-sort-btn" theme={theme} onPress={() => setShowSortSheet(true)} onLongPress={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
          <ArrowUpDown size={18} color={theme.mutedForeground} />
        </BarButton>
        <BarButton testID="directory-view-toggle" theme={theme} onPress={toggleView}>
          {viewMode === 'list' ? <LayoutGrid size={18} color={theme.mutedForeground} /> : <ListIcon size={18} color={theme.mutedForeground} />}
        </BarButton>
      </View>

      {viewMode === 'cards' ? (
        <Animated.FlatList
          data={displayed}
          keyExtractor={(c) => c.id}
          renderItem={({ item, index }) => (
            <StackCardItem index={index} scrollY={scrollY} headerH={headerH}>
              <ClientCard
                client={item}
                pulse={pulseById.get(item.id)}
                onPress={() => goProfile(item)}
                onWhatsApp={item.phone && coachSlug ? () => handleWhatsApp(item) : undefined}
                onShareLogin={() => handleShare(item)}
                onToggleStatus={() => handleToggle(item)}
                onResetPw={() => handleReset(item)}
                onDelete={() => handleDelete(item)}
                onWorkout={() => goWorkout(item)}
                onNutrition={goNutrition}
              />
            </StackCardItem>
          )}
          contentContainerStyle={styles.cardsList}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onRefresh={() => load(true)}
          refreshing={refreshing}
          ListHeaderComponent={<View onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>{headerNode}</View>}
          ListEmptyComponent={emptyNode}
        />
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(c) => c.id}
          renderItem={({ item, index }) => (
            <DirRowCard item={item} index={index} theme={theme} pulse={pulseById.get(item.id)} onPress={() => goProfile(item)} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onRefresh={() => load(true)}
          refreshing={refreshing}
          ListHeaderComponent={headerNode}
          ListEmptyComponent={emptyNode}
        />
      )}

      {/* A-F14: FAB secundario Importar (paste CSV) */}
      <TouchableOpacity
        testID="directory-fab-import"
        style={[styles.fabSecondary, { backgroundColor: theme.card, borderColor: theme.border }, SHADOWS[resolvedScheme].md]}
        onPress={() => setShowImport(true)}
        activeOpacity={0.85}
      >
        <Upload size={20} color={theme.primary} />
      </TouchableOpacity>

      {/* FAB: Nuevo Alumno (pill extendido, acción primaria) */}
      <TouchableOpacity
        testID="directory-fab-new-client"
        style={[styles.fab, { backgroundColor: theme.primary }, GLOWS.sport]}
        onPress={() => setShowCreate(true)}
        activeOpacity={0.9}
      >
        <UserPlus size={19} color="#fff" />
        <Text style={styles.fabLabel}>Nuevo alumno</Text>
      </TouchableOpacity>

      {/* Sheets */}
      <DirectoryOptionSheet
        visible={showSortSheet}
        title="Ordenar"
        options={SORT_OPTIONS}
        selected={sortKey}
        onSelect={(v) => setSortKey(v as DirectorySortKey)}
        onClose={() => setShowSortSheet(false)}
        theme={theme}
      />
      <DirectoryOptionSheet
        visible={showFilterSheet}
        title="Estado"
        options={STATUS_OPTIONS}
        selected={statusFilter}
        onSelect={(v) => setStatusFilter(v as StatusFilter)}
        onClose={() => setShowFilterSheet(false)}
        theme={theme}
      />
      <CreateClientModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => load()}
        theme={theme}
      />

      <NativeDialog open={showImport} title="Importar alumnos" onClose={() => setShowImport(false)}>
        <ImportClientsForm theme={theme} onDone={() => { setShowImport(false); load() }} onCancel={() => setShowImport(false)} />
      </NativeDialog>
    </SafeAreaView>
  )
}

// Botón de la barra de acción (Filtros / Orden / Vista) — DS rounded-control.
function BarButton({
  theme,
  onPress,
  onLongPress,
  active,
  badge,
  testID,
  children,
}: {
  theme: any
  onPress: () => void
  onLongPress?: () => void
  active?: boolean
  badge?: number
  testID?: string
  children: React.ReactNode
}) {
  return (
    <TouchableOpacity
      testID={testID}
      style={[
        styles.barBtn,
        {
          backgroundColor: active ? hexToRgba(theme.primary, 0.12) : theme.card,
          borderColor: active ? theme.primary : theme.border,
        },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
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
  list: { paddingHorizontal: 16, paddingBottom: 120, gap: 8 },
  cardsList: { paddingHorizontal: 16, paddingBottom: 150 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, paddingTop: 48 },
  emptyIcon: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 22, letterSpacing: -0.5, fontFamily: FONT.displayBlack },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20, fontFamily: FONT.ui },
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
  fabSecondary: {
    position: 'absolute',
    right: 24,
    bottom: 146,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
