import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  AlertTriangle,
  ChevronRight,
  Dumbbell,
  Flame,
  LayoutGrid,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  UserPlus,
  X,
} from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import { ScreenHeader } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import {
  buildStats,
  filterClients,
  getCoachDirectoryClients,
  sortClients,
  type DirectoryClient,
  type DirectoryRiskFilter,
  type DirectorySortKey,
  type StatusFilter,
} from '../../../lib/clients-directory'
import { apiFetch } from '../../../lib/api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function daysLabel(days: number | null): string | null {
  if (days === null) return null
  if (days < 0) return `Vencido ${Math.abs(days)}d`
  if (days === 0) return 'Vence hoy'
  return `${days}d restantes`
}

function attentionColor(score: number): string {
  if (score >= 50) return '#EF4444'
  if (score >= 25) return '#F59E0B'
  return '#10B981'
}

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = attentionColor(score)
  return (
    <View style={[scoreBadgeStyles.wrap, { backgroundColor: color + '22', borderColor: color + '44' }]}>
      <Text style={[scoreBadgeStyles.text, { color }]}>{score}</Text>
    </View>
  )
}
const scoreBadgeStyles = StyleSheet.create({
  wrap: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  text: { fontSize: 11, fontWeight: '800' },
})

// ─── StatusChip ───────────────────────────────────────────────────────────────

function StatusChip({ client }: { client: DirectoryClient }) {
  if (client.isArchived) {
    return <Chip label="Archivado" color="#71717A" />
  }
  if (!client.isActive) {
    return <Chip label="Pausado" color="#EF4444" />
  }
  if (client.forcePwChange) {
    return <Chip label="Pend. sync" color="#F59E0B" />
  }
  return <Chip label="Activo" color="#10B981" />
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View style={[chipStyles.wrap, { backgroundColor: color + '22', borderColor: color + '33' }]}>
      <Text style={[chipStyles.text, { color }]}>{label}</Text>
    </View>
  )
}
const chipStyles = StyleSheet.create({
  wrap: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  text: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
})

// ─── Stats Tile ───────────────────────────────────────────────────────────────

function StatTile({
  value,
  label,
  icon: Icon,
  color,
  selected,
  onPress,
  sub,
}: {
  value: number
  label: string
  icon: any
  color: string
  selected: boolean
  onPress: () => void
  sub?: string
}) {
  const { theme } = useTheme()
  return (
    <TouchableOpacity
      style={[
        statStyles.tile,
        {
          backgroundColor: theme.card,
          borderColor: selected ? color : theme.border,
          borderWidth: selected ? 2 : 1,
          borderRadius: theme.radius.xl,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[statStyles.iconWrap, { backgroundColor: color + '1A' }]}>
        <Icon size={16} color={color} />
      </View>
      <Text style={[statStyles.value, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
        {sub}{value}
      </Text>
      <Text style={[statStyles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}
const statStyles = StyleSheet.create({
  tile: {
    // 3 per row (was flex:1 → 6 squished in one row).
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 100,
    padding: 12,
    gap: 4,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  value: { fontSize: 22, lineHeight: 26 },
  label: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
})

// ─── Alert Banner ─────────────────────────────────────────────────────────────

function AlertBanner({
  message,
  color,
  onPress,
}: {
  message: string
  color: string
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={[alertStyles.wrap, { backgroundColor: color + '18', borderColor: color + '44' }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[alertStyles.text, { color, flex: 1 }]}>{message}</Text>
      <View style={alertStyles.cta}>
        <Text style={[alertStyles.ctaText, { color }]}>Ver</Text>
        <ChevronRight size={14} color={color} />
      </View>
    </TouchableOpacity>
  )
}
const alertStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  text: { fontSize: 13, fontWeight: '600' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ctaText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
})

// ─── Client Row ───────────────────────────────────────────────────────────────

function ClientRow({ item, index, theme, router }: { item: DirectoryClient; index: number; theme: any; router: any }) {
  const planLabel = daysLabel(item.planDaysRemaining)
  const planColor =
    item.planDaysRemaining !== null && item.planDaysRemaining <= 0
      ? '#EF4444'
      : item.planDaysRemaining !== null && item.planDaysRemaining <= 7
        ? '#F59E0B'
        : '#6B7280'

  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 300, delay: Math.min(index * 40, 320) }}
    >
      <TouchableOpacity
        style={[
          rowStyles.card,
          {
            backgroundColor: theme.card,
            borderColor: theme.border,
            borderRadius: theme.radius.xl,
          },
        ]}
        onPress={() => router.push(`/coach/cliente/${item.id}`)}
        activeOpacity={0.75}
      >
        {/* Left: avatar + info */}
        <View style={rowStyles.left}>
          <View
            style={[
              rowStyles.avatar,
              {
                backgroundColor: hexToRgba(theme.primary, 0.1),
                borderColor: hexToRgba(theme.primary, 0.2),
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <Text style={[rowStyles.avatarText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
              {item.fullName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={rowStyles.info}>
            <Text style={[rowStyles.name, { color: theme.foreground, fontFamily: theme.fontSans }]} numberOfLines={1}>
              {item.fullName}
            </Text>
            <Text style={[rowStyles.email, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
              {item.email}
            </Text>
            {/* Plan row */}
            <View style={rowStyles.planRow}>
              {item.activeProgramName ? (
                <>
                  <Dumbbell size={10} color={theme.mutedForeground} />
                  <Text style={[rowStyles.planName, { color: theme.mutedForeground }]} numberOfLines={1}>
                    {item.activeProgramName}
                  </Text>
                  {planLabel ? (
                    <Text style={[rowStyles.planDays, { color: planColor }]}>· {planLabel}</Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Dumbbell size={10} color={theme.mutedForeground} />
                  <Text style={[rowStyles.planName, { color: theme.mutedForeground }]}>Sin programa</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Right: status + score + chevron */}
        <View style={rowStyles.right}>
          <StatusChip client={item} />
          <ScoreBadge score={item.attentionScore} />
          <ChevronRight size={16} color={theme.mutedForeground} />
        </View>
      </TouchableOpacity>
    </MotiView>
  )
}

const rowStyles = StyleSheet.create({
  card: {
    padding: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  avatar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexShrink: 0 },
  avatarText: { fontSize: 16 },
  info: { flex: 1, gap: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: '600' },
  email: { fontSize: 11 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  planName: { fontSize: 10, flexShrink: 1 },
  planDays: { fontSize: 10, fontWeight: '700', flexShrink: 0 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
})

// ─── Sort Sheet ───────────────────────────────────────────────────────────────

const SORT_OPTIONS: { label: string; value: DirectorySortKey }[] = [
  { label: 'Urgencia (default)', value: 'attention_score' },
  { label: 'Nombre A→Z', value: 'name_asc' },
  { label: 'Última sesión', value: 'last_workout' },
  { label: 'Días plan restantes', value: 'plan_days' },
]

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: 'Todos', value: 'any' },
  { label: 'Activos', value: 'active' },
  { label: 'Pausados', value: 'paused' },
  { label: 'Archivados', value: 'archived' },
]

function OptionSheet({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
  theme,
}: {
  visible: boolean
  title: string
  options: { label: string; value: string }[]
  selected: string
  onSelect: (v: string) => void
  onClose: () => void
  theme: any
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheetStyles.overlay} onPress={onClose} />
      <View style={[sheetStyles.sheet, { backgroundColor: theme.card }]}>
        <View style={sheetStyles.handle} />
        <Text style={[sheetStyles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          {title}
        </Text>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              sheetStyles.option,
              {
                backgroundColor: selected === opt.value ? hexToRgba(theme.primary, 0.1) : 'transparent',
                borderRadius: theme.radius.lg,
              },
            ]}
            onPress={() => { onSelect(opt.value); onClose() }}
          >
            <Text
              style={[
                sheetStyles.optionText,
                {
                  color: selected === opt.value ? theme.primary : theme.foreground,
                  fontFamily: theme.fontSans,
                  fontWeight: selected === opt.value ? '700' : '400',
                },
              ]}
            >
              {opt.label}
            </Text>
            {selected === opt.value && (
              <View style={[sheetStyles.checkDot, { backgroundColor: theme.primary }]} />
            )}
          </TouchableOpacity>
        ))}
        <View style={{ height: 24 }} />
      </View>
    </Modal>
  )
}

const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 2,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#666', alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 16, marginBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  optionText: { fontSize: 15 },
  checkDot: { width: 8, height: 8, borderRadius: 4 },
})

// ─── Create Client Modal ──────────────────────────────────────────────────────

interface CreateForm {
  fullName: string
  email: string
  phone: string
  tempPassword: string
}

function CreateClientModal({
  visible,
  onClose,
  onCreated,
  theme,
}: {
  visible: boolean
  onClose: () => void
  onCreated: () => void
  theme: any
}) {
  const [form, setForm] = useState<CreateForm>({ fullName: '', email: '', phone: '', tempPassword: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!form.fullName.trim() || !form.email.trim() || !form.tempPassword.trim()) {
      setError('Nombre, email y contraseña temporal son obligatorios.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await apiFetch('/api/mobile/coach/clients', {
        method: 'POST',
        authenticated: true,
        body: {
          fullName: form.fullName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || undefined,
          tempPassword: form.tempPassword,
          ageConfirmed: true,
        },
      })
      setForm({ fullName: '', email: '', phone: '', tempPassword: '' })
      onCreated()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo crear el alumno.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={sheetStyles.overlay} onPress={onClose} />
        <View style={[createStyles.sheet, { backgroundColor: theme.card }]}>
          <View style={sheetStyles.handle} />
          <View style={createStyles.header}>
            <Text style={[createStyles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              Nuevo Alumno
            </Text>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color={theme.mutedForeground} />
            </TouchableOpacity>
          </View>

          {error && (
            <View style={[createStyles.errorBox, { backgroundColor: '#EF444418', borderColor: '#EF444440' }]}>
              <Text style={createStyles.errorText}>{error}</Text>
            </View>
          )}

          {(['fullName', 'email', 'phone', 'tempPassword'] as (keyof CreateForm)[]).map((field) => {
            const labels: Record<keyof CreateForm, string> = {
              fullName: 'Nombre completo *',
              email: 'Email *',
              phone: 'Teléfono (opcional)',
              tempPassword: 'Contraseña temporal *',
            }
            return (
              <View key={field} style={createStyles.fieldWrap}>
                <Text style={[createStyles.label, { color: theme.mutedForeground }]}>{labels[field]}</Text>
                <TextInput
                  style={[
                    createStyles.input,
                    {
                      backgroundColor: theme.secondary,
                      borderColor: theme.border,
                      color: theme.foreground,
                      fontFamily: theme.fontSans,
                      borderRadius: theme.radius.lg,
                    },
                  ]}
                  value={form[field]}
                  onChangeText={(v) => setForm((f) => ({ ...f, [field]: v }))}
                  placeholder={field === 'tempPassword' ? 'Min. 6 caracteres' : ''}
                  placeholderTextColor={theme.mutedForeground}
                  autoCapitalize={field === 'email' ? 'none' : field === 'tempPassword' ? 'none' : 'words'}
                  keyboardType={field === 'email' ? 'email-address' : field === 'phone' ? 'phone-pad' : 'default'}
                  secureTextEntry={field === 'tempPassword'}
                  autoCorrect={false}
                />
              </View>
            )
          })}

          <TouchableOpacity
            style={[
              createStyles.btn,
              { backgroundColor: theme.primary, opacity: loading ? 0.7 : 1, borderRadius: theme.radius.xl },
            ]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={[createStyles.btnText, { fontFamily: 'Montserrat_700Bold' }]}>Crear Alumno</Text>
            )}
          </TouchableOpacity>
          <View style={{ height: 12 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const createStyles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 18 },
  errorBox: { borderRadius: 10, borderWidth: 1, padding: 12 },
  errorText: { color: '#EF4444', fontSize: 13 },
  fieldWrap: { gap: 4 },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { height: 44, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  btn: { height: 50, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 14, letterSpacing: 1, textTransform: 'uppercase' },
})

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ClientesScreen() {
  const { theme } = useTheme()
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

  useEffect(() => { load() }, [])

  async function load(silent = false) {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    const data = await getCoachDirectoryClients()
    setClients(data)
    setLoading(false)
    setRefreshing(false)
  }

  const stats = useMemo(() => buildStats(clients), [clients])

  const displayed = useMemo(() => {
    const filtered = filterClients(clients, search, riskFilter, statusFilter)
    return sortClients(filtered, sortKey)
  }, [clients, search, riskFilter, statusFilter, sortKey])

  const urgentBanner = stats.urgentCount > 0
  const expiredBanner = stats.expiredProgramCount > 0
  const syncBanner = stats.pendingSyncCount > 0

  const hasActiveFilters = riskFilter !== 'all' || statusFilter !== 'any'
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? 'Urgencia'

  const STAT_TILES = [
    { key: 'total', label: 'Total', value: stats.total, icon: Users, color: '#6B7280', filter: 'all' as DirectoryRiskFilter },
    { key: 'active', label: 'Activos', value: stats.active, icon: ShieldCheck, color: '#10B981', filter: 'all' as DirectoryRiskFilter },
    { key: 'review', label: 'Atención', value: stats.reviewCount, icon: AlertTriangle, color: '#F59E0B', filter: 'review' as DirectoryRiskFilter, sub: '⚠️ ' },
    { key: 'urgent', label: 'Riesgo', value: stats.urgentCount, icon: Flame, color: '#EF4444', filter: 'urgent' as DirectoryRiskFilter, sub: '🔴 ' },
    { key: 'ontrack', label: 'On track', value: stats.onTrackCount, icon: LayoutGrid, color: '#3B82F6', filter: 'on_track' as DirectoryRiskFilter },
    { key: 'noprogram', label: 'Sin plan', value: stats.noProgramCount, icon: Dumbbell, color: '#8B5CF6', filter: 'no_program' as DirectoryRiskFilter },
  ]

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
        <ScreenHeader title="Alumnos" subtitle="Cargando..." />
        <EvaLoaderScreen subtitle="Cargando alumnos…" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Alumnos"
        subtitle={`${stats.active} activos · ${stats.total} total`}
      />

      {/* Search + action bar */}
      <View style={styles.actionBar}>
        <View
          style={[
            styles.searchWrap,
            { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg },
          ]}
        >
          <Search size={15} color={theme.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]}
            placeholder="Buscar alumno..."
            placeholderTextColor={theme.mutedForeground}
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />
        </View>
        <TouchableOpacity
          style={[
            styles.iconBtn,
            {
              backgroundColor: hasActiveFilters ? hexToRgba(theme.primary, 0.15) : theme.secondary,
              borderColor: hasActiveFilters ? theme.primary : theme.border,
              borderRadius: theme.radius.lg,
            },
          ]}
          onPress={() => setShowFilterSheet(true)}
        >
          <SlidersHorizontal size={18} color={hasActiveFilters ? theme.primary : theme.mutedForeground} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}
          onPress={() => setShowSortSheet(true)}
        >
          <RefreshCw size={16} color={theme.mutedForeground} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={displayed}
        keyExtractor={(c) => c.id}
        renderItem={({ item, index }) => (
          <ClientRow item={item} index={index} theme={theme} router={router} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onRefresh={() => load(true)}
        refreshing={refreshing}
        ListHeaderComponent={
          <>
            {/* Stats grid */}
            <View style={styles.statsGrid}>
              {STAT_TILES.map((tile) => (
                <StatTile
                  key={tile.key}
                  value={tile.value}
                  label={tile.label}
                  icon={tile.icon}
                  color={tile.color}
                  selected={riskFilter === tile.filter && tile.filter !== 'all'}
                  onPress={() => setRiskFilter(riskFilter === tile.filter ? 'all' : tile.filter)}
                  sub={tile.sub}
                />
              ))}
            </View>

            {/* Alert banners */}
            {urgentBanner && (
              <AlertBanner
                message={`🔴 ${stats.urgentCount} alumno${stats.urgentCount !== 1 ? 's' : ''} con atención urgente`}
                color="#EF4444"
                onPress={() => setRiskFilter('urgent')}
              />
            )}
            {expiredBanner && (
              <AlertBanner
                message={`${stats.expiredProgramCount} programa${stats.expiredProgramCount !== 1 ? 's' : ''} vencido${stats.expiredProgramCount !== 1 ? 's' : ''}`}
                color="#F97316"
                onPress={() => setRiskFilter('expired_program')}
              />
            )}
            {syncBanner && (
              <AlertBanner
                message={`${stats.pendingSyncCount} alumno${stats.pendingSyncCount !== 1 ? 's' : ''} con cambio de contraseña pendiente`}
                color="#F59E0B"
                onPress={() => setRiskFilter('password_reset')}
              />
            )}

            {/* Active filter chips */}
            {hasActiveFilters && (
              <View style={styles.chipRow}>
                {riskFilter !== 'all' && (
                  <TouchableOpacity
                    style={[styles.filterChip, { borderColor: hexToRgba(theme.primary, 0.3), backgroundColor: hexToRgba(theme.primary, 0.1) }]}
                    onPress={() => setRiskFilter('all')}
                  >
                    <Text style={[styles.filterChipText, { color: theme.primary }]}>
                      {riskFilter}
                    </Text>
                    <X size={11} color={theme.primary} />
                  </TouchableOpacity>
                )}
                {statusFilter !== 'any' && (
                  <TouchableOpacity
                    style={[styles.filterChip, { borderColor: hexToRgba(theme.primary, 0.3), backgroundColor: hexToRgba(theme.primary, 0.1) }]}
                    onPress={() => setStatusFilter('any')}
                  >
                    <Text style={[styles.filterChipText, { color: theme.primary }]}>
                      {STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label}
                    </Text>
                    <X size={11} color={theme.primary} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Sort label */}
            <View style={styles.sortRow}>
              <Text style={[styles.sortLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {displayed.length} resultado{displayed.length !== 1 ? 's' : ''} · Orden: {sortLabel}
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Users size={36} color={theme.mutedForeground} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              {search || hasActiveFilters ? 'Sin resultados' : 'Sin alumnos aún'}
            </Text>
            <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {search || hasActiveFilters
                ? 'Probá ajustando los filtros o la búsqueda.'
                : 'Usa el botón + para agregar tu primer alumno.'}
            </Text>
          </View>
        }
      />

      {/* FAB: Nuevo Alumno */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={() => setShowCreate(true)}
        activeOpacity={0.85}
      >
        <UserPlus size={22} color="#fff" />
      </TouchableOpacity>

      {/* Sheets */}
      <OptionSheet
        visible={showSortSheet}
        title="Ordenar"
        options={SORT_OPTIONS}
        selected={sortKey}
        onSelect={(v) => setSortKey(v as DirectorySortKey)}
        onClose={() => setShowSortSheet(false)}
        theme={theme}
      />
      <OptionSheet
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
    </SafeAreaView>
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
  searchWrap: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
  },
  searchInput: { flex: 1, height: 40, fontSize: 14 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterChipText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  sortRow: { paddingHorizontal: 16, paddingBottom: 8 },
  sortLabel: { fontSize: 11 },
  list: { paddingHorizontal: 16, paddingBottom: 100, gap: 8 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, paddingTop: 40 },
  emptyTitle: { fontSize: 18 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 80,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
})
