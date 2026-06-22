import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Swipeable } from 'react-native-gesture-handler'
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronRight,
  Copy,
  Dumbbell,
  EyeOff,
  Flame,
  LayoutGrid,
  List as ListIcon,
  RefreshCw,
  Salad,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Table2,
  Upload,
  Users,
  UserPlus,
  X,
} from 'lucide-react-native'
import { MotiView } from 'moti'
import * as Clipboard from 'expo-clipboard'
import { useTheme } from '../../../context/ThemeContext'
import { Button, NativeDialog, ScreenHeader } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { ClientCard, CLIENT_CARD_HEIGHT } from '../../../components/coach/ClientCard'
import { ClientsDirectoryTable } from '../../../components/coach/ClientsDirectoryTable'
import {
  buildStats,
  defaultSortDir,
  filterClients,
  getCoachDirectoryClients,
  getCoachDirectoryPulse,
  sortClients,
  type DirectoryClient,
  type DirectoryRiskFilter,
  type DirectorySortKey,
  type ProgramFilter,
  type PulseRow,
  type SortDir,
  type StatusFilter,
} from '../../../lib/clients-directory'
import { clientLoginUrl, deleteClient, openWhatsApp, resetClientPassword, setClientArchived, setClientStatus, shareLogin } from '../../../lib/client-actions'
import { getCoachProfile } from '../../../lib/coach'
import { apiFetch } from '../../../lib/api'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { parseClientsCsv, type ParsedClientRow } from '../../../lib/import-clients'

const CARD_GAP = 12
const CARD_STEP = CLIENT_CARD_HEIGHT + CARD_GAP
// Una sola fila ficticia para que la vista TABLA reúse el FlatList (pull-to-refresh) sin VirtualizedList anidada.
const EMPTY_DATA: { id: string }[] = [{ id: 'table' }]

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
  suffix,
}: {
  value: number
  label: string
  icon: any
  color: string
  selected: boolean
  onPress: () => void
  sub?: string
  suffix?: string
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
      <View style={statStyles.topRow}>
        <View style={[statStyles.iconWrap, { backgroundColor: color + '1A' }]}>
          <Icon size={13} color={color} />
        </View>
        <Text style={[statStyles.value, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          {sub}{value}{suffix}
        </Text>
      </View>
      <Text style={[statStyles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}
const statStyles = StyleSheet.create({
  tile: {
    // 3 per row, compact (icon + value inline → ~half the height).
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 96,
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 3,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: 19, lineHeight: 22 },
  label: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6 },
})

// ─── Alert Banner ─────────────────────────────────────────────────────────────

function AlertBanner({
  message,
  color,
  onPress,
  onDismiss,
}: {
  message: string
  color: string
  onPress: () => void
  onDismiss: () => void
}) {
  const { theme } = useTheme()
  const hideAction = (side: 'left' | 'right') => (
    <View style={[alertStyles.dismiss, { backgroundColor: color + '22' }, side === 'left' ? { marginLeft: 16, marginRight: 0 } : null]}>
      <EyeOff size={15} color={color} />
      <Text style={[alertStyles.dismissText, { color }]}>Ocultar</Text>
    </View>
  )
  return (
    <Swipeable
      renderRightActions={() => hideAction('right')}
      renderLeftActions={() => hideAction('left')}
      onSwipeableOpen={onDismiss}
      overshootRight={false}
      overshootLeft={false}
      friction={1.6}
    >
      {/* Fondo OPACO (theme.card) + acento de color a la izquierda → legible sobre cualquier fondo. */}
      <TouchableOpacity
        style={[alertStyles.wrap, { backgroundColor: theme.card, borderColor: theme.border, borderLeftWidth: 3, borderLeftColor: color }]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Text style={[alertStyles.text, { color: theme.foreground, flex: 1 }]} numberOfLines={2}>{message}</Text>
        <View style={alertStyles.cta}>
          <Text style={[alertStyles.ctaText, { color }]}>Ver</Text>
          <ChevronRight size={14} color={color} />
        </View>
      </TouchableOpacity>
    </Swipeable>
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
  dismiss: { width: 96, marginRight: 16, marginBottom: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dismissText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
})

// ─── Client Row ───────────────────────────────────────────────────────────────

function ClientRow({ item, index, theme, router, pulse }: { item: DirectoryClient; index: number; theme: any; router: any; pulse?: PulseRow }) {
  const planLabel = daysLabel(item.planDaysRemaining)
  // A-F4: métricas en la fila (antes solo en cards). Adherencia + peso±Δ + último log.
  const adherence = pulse?.percentage ?? null
  const adherenceColor = adherence == null ? theme.mutedForeground : adherence >= 70 ? '#10B981' : adherence >= 40 ? '#F59E0B' : '#EF4444'
  const lastDays = item.lastWorkoutDate ? Math.floor((Date.now() - new Date(item.lastWorkoutDate).getTime()) / 86400000) : null
  const lastColor = lastDays == null ? theme.mutedForeground : lastDays < 3 ? '#10B981' : lastDays < 7 ? '#F59E0B' : '#EF4444'
  const lastLabel = lastDays == null ? 'Sin entrenos' : lastDays <= 0 ? 'Hoy' : lastDays === 1 ? 'Ayer' : `${lastDays}d`
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
            {pulse ? (
              <View style={rowStyles.metricsRow}>
                {adherence != null ? <Text style={[rowStyles.metric, { color: adherenceColor, fontFamily: 'Inter_700Bold' }]}>{adherence}% adh</Text> : null}
                <View style={[rowStyles.metricDot, { backgroundColor: lastColor }]} />
                <Text style={[rowStyles.metric, { color: theme.mutedForeground }]}>{lastLabel}</Text>
                {pulse.currentWeight != null ? (
                  <Text style={[rowStyles.metric, { color: theme.mutedForeground }]} numberOfLines={1}>
                    · {pulse.currentWeight}kg{pulse.weightDelta7d != null && pulse.weightDelta7d !== 0 ? ` ${pulse.weightDelta7d > 0 ? '↑' : '↓'}${Math.abs(pulse.weightDelta7d)}` : ''}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* Right: status + score + chevron */}
        <View style={rowStyles.right}>
          <StatusChip client={item} />
          {/* A-F6: usar el attentionScore del pulse (autoritativo) cuando llega; si no, el local. */}
          <ScoreBadge score={pulse?.attentionScore ?? item.attentionScore} />
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
  metricsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  metric: { fontSize: 10, flexShrink: 1 },
  metricDot: { width: 6, height: 6, borderRadius: 3 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
})

// ─── Sort Sheet ───────────────────────────────────────────────────────────────

// 1:1 con web directory-types.ts SORT_OPTIONS.
const SORT_OPTIONS: { label: string; value: DirectorySortKey }[] = [
  { label: 'Urgencia (default)', value: 'attention_score' },
  { label: 'Nombre A→Z', value: 'name_asc' },
  { label: 'Última actividad', value: 'last_activity' },
  { label: 'Adherencia ↓', value: 'adherence_desc' },
  { label: 'Peso: mayor cambio', value: 'weight_delta' },
  { label: 'Días programa', value: 'plan_days' },
]

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: 'Todos', value: 'any' },
  { label: 'Activos', value: 'active' },
  { label: 'Pausados', value: 'paused' },
  { label: 'Cambio de contraseña pendiente', value: 'pending_sync' },
  { label: 'Archivados', value: 'archived' },
]

// 1:1 con web DirectoryActionBar grupo "Riesgo".
const RISK_OPTIONS: { label: string; value: DirectoryRiskFilter }[] = [
  { label: 'Todos', value: 'all' },
  { label: 'Atención urgente', value: 'urgent' },
  { label: 'En riesgo', value: 'review' },
  { label: 'On track', value: 'on_track' },
  { label: 'Nutrición baja (<60%)', value: 'nutrition_low' },
]

// 1:1 con web DirectoryActionBar grupo "Programa".
const PROGRAM_OPTIONS: { label: string; value: ProgramFilter }[] = [
  { label: 'Todos', value: 'any' },
  { label: 'Con programa', value: 'with_program' },
  { label: 'Sin programa', value: 'no_program' },
  { label: 'Vencido', value: 'expired' },
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

// ─── Filter Sheet (3 grupos: Estado · Riesgo · Programa) — 1:1 web Filtros dropdown ──
function FilterSheet({
  visible,
  onClose,
  theme,
  statusFilter,
  onStatusChange,
  riskFilter,
  onRiskChange,
  programFilter,
  onProgramChange,
  archivedCount,
}: {
  visible: boolean
  onClose: () => void
  theme: any
  statusFilter: StatusFilter
  onStatusChange: (v: StatusFilter) => void
  riskFilter: DirectoryRiskFilter
  onRiskChange: (v: DirectoryRiskFilter) => void
  programFilter: ProgramFilter
  onProgramChange: (v: ProgramFilter) => void
  archivedCount: number
}) {
  const groupRow = (opts: { label: string; value: string }[], selected: string, onSelect: (v: string) => void, archived?: boolean) =>
    opts.map((opt) => (
      <TouchableOpacity
        key={opt.value}
        style={[
          sheetStyles.option,
          { backgroundColor: selected === opt.value ? hexToRgba(theme.primary, 0.1) : 'transparent', borderRadius: theme.radius.lg },
        ]}
        onPress={() => onSelect(opt.value)}
      >
        <Text
          style={[
            sheetStyles.optionText,
            { color: selected === opt.value ? theme.primary : theme.foreground, fontFamily: theme.fontSans, fontWeight: selected === opt.value ? '700' : '400' },
          ]}
        >
          {opt.label}
        </Text>
        {opt.value === 'archived' && archived && archivedCount > 0 ? (
          <View style={[filterSheetStyles.countPill, { backgroundColor: theme.secondary }]}>
            <Text style={[filterSheetStyles.countTxt, { color: theme.mutedForeground }]}>{archivedCount}</Text>
          </View>
        ) : selected === opt.value ? (
          <View style={[sheetStyles.checkDot, { backgroundColor: theme.primary }]} />
        ) : null}
      </TouchableOpacity>
    ))

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheetStyles.overlay} onPress={onClose} />
      <View style={[sheetStyles.sheet, { backgroundColor: theme.card, maxHeight: '80%' }]}>
        <View style={sheetStyles.handle} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={[filterSheetStyles.groupLabel, { color: theme.mutedForeground }]}>Estado</Text>
          {groupRow(STATUS_OPTIONS, statusFilter, (v) => onStatusChange(v as StatusFilter), true)}
          <View style={[filterSheetStyles.sep, { backgroundColor: theme.border }]} />
          <Text style={[filterSheetStyles.groupLabel, { color: theme.mutedForeground }]}>Riesgo</Text>
          {groupRow(RISK_OPTIONS, riskFilter, (v) => onRiskChange(v as DirectoryRiskFilter))}
          <View style={[filterSheetStyles.sep, { backgroundColor: theme.border }]} />
          <Text style={[filterSheetStyles.groupLabel, { color: theme.mutedForeground }]}>Programa</Text>
          {groupRow(PROGRAM_OPTIONS, programFilter, (v) => onProgramChange(v as ProgramFilter))}
          <View style={{ height: 12 }} />
          <TouchableOpacity style={[filterSheetStyles.done, { backgroundColor: theme.primary, borderRadius: theme.radius.xl }]} onPress={onClose}>
            <Text style={[filterSheetStyles.doneTxt, { fontFamily: 'Montserrat_700Bold' }]}>Listo</Text>
          </TouchableOpacity>
          <View style={{ height: 16 }} />
        </ScrollView>
      </View>
    </Modal>
  )
}

const filterSheetStyles = StyleSheet.create({
  groupLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6, marginBottom: 2, paddingHorizontal: 12 },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  countPill: { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 1 },
  countTxt: { fontSize: 10, fontWeight: '800' },
  done: { height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  doneTxt: { color: '#fff', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
})

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
  const [programFilter, setProgramFilter] = useState<ProgramFilter>('any')
  const [sortKey, setSortKey] = useState<DirectorySortKey>('attention_score')
  const [showSortSheet, setShowSortSheet] = useState(false)
  const [showFilterSheet, setShowFilterSheet] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [dismissed, setDismissed] = useState<Record<string, { date: string; count: number }>>({})
  // Vista por defecto = 'table' (1:1 web). list/cards/table.
  const [viewMode, setViewMode] = useState<'list' | 'cards' | 'table'>('table')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [pulseById, setPulseById] = useState<Map<string, PulseRow>>(new Map())
  const [pulseError, setPulseError] = useState(false)
  const [coachSlug, setCoachSlug] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [gridVisibleCount, setGridVisibleCount] = useState(48)
  const scrollY = useSharedValue(0)
  const [headerH, setHeaderH] = useState(0)
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y })

  useEffect(() => { load() }, [])
  useEffect(() => {
    AsyncStorage.getItem('eva_alumnos_view').then((v) => { if (v === 'cards' || v === 'list' || v === 'table') setViewMode(v) })
    getCoachProfile().then((c) => { if (c?.slug) setCoachSlug(c.slug) }).catch(() => {})
  }, [])
  // Reset de paginación grid al cambiar filtros/orden/vista (1:1 web).
  useEffect(() => { setGridVisibleCount(48) }, [search, riskFilter, statusFilter, programFilter, sortKey, sortDir, viewMode])
  function setView(next: 'list' | 'cards' | 'table') {
    setViewMode(next)
    AsyncStorage.setItem('eva_alumnos_view', next).catch(() => {})
  }
  // Cicla table → cards → list → table (botón único del action bar, además del toggle grid/tabla).
  function toggleView() {
    const next = viewMode === 'list' ? 'cards' : 'list'
    setView(next)
  }
  const loginUrl = coachSlug ? clientLoginUrl(coachSlug) : ''
  function handleCopyPortal() {
    if (!loginUrl) return
    Clipboard.setStringAsync(loginUrl).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  function handleSync() {
    setSyncing(true)
    load(true)
    setTimeout(() => setSyncing(false), 800)
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
    const filtered = filterClients(clients, search, riskFilter, statusFilter, pulseById, programFilter)
    return sortClients(filtered, sortKey, sortDir, pulseById)
  }, [clients, search, riskFilter, statusFilter, programFilter, sortKey, sortDir, pulseById])

  // Cards: paginado "Cargar más" (1:1 web gridVisibleCount, slices de 48).
  const gridClients = useMemo(() => displayed.slice(0, gridVisibleCount), [displayed, gridVisibleCount])

  const urgentBanner = stats.urgentCount > 0
  const expiredBanner = stats.expiredProgramCount > 0
  const syncBanner = stats.pendingSyncCount > 0
  // Avg adherencia (1:1 web War Room tile) — promedio del pulse.
  const avgAdherence = useMemo(() => {
    const arr = [...pulseById.values()]
    return arr.length > 0 ? Math.round(arr.reduce((a, p) => a + (p.percentage ?? 0), 0) / arr.length) : 0
  }, [pulseById])
  // A-F10: contador de adherencia nutricional baja (desde el pulse) para banner de triage.
  const nutritionLowCount = useMemo(
    () => [...pulseById.values()].filter((p) => (p.attentionFlags?.includes('NUTRICION_RIESGO')) || (p.nutritionPercentage > 0 && p.nutritionPercentage < 60)).length,
    [pulseById]
  )
  // Banner web: alumnos >1 mes sin check-in (solo si no hay urgentes).
  const noCheckin1m = useMemo(
    () => [...pulseById.values()].filter((p) => (p.attentionFlags ?? []).includes('SIN_CHECKIN_1M')).length,
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

  const hasActiveFilters = riskFilter !== 'all' || statusFilter !== 'any' || programFilter !== 'any'
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? 'Urgencia'

  // 6 tiles 1:1 web War Room: Total · Activos · Atención · Riesgo · Avg Adher. · Nutri. baja.
  const STAT_TILES = [
    { key: 'total', label: 'Total', value: stats.total, icon: Users, color: '#6B7280', filter: 'all' as DirectoryRiskFilter },
    { key: 'active', label: 'Activos', value: stats.active, icon: ShieldCheck, color: '#10B981', filter: 'all' as DirectoryRiskFilter },
    { key: 'review', label: 'Atención', value: stats.reviewCount, icon: AlertTriangle, color: '#F59E0B', filter: 'review' as DirectoryRiskFilter, sub: '⚠️ ' },
    { key: 'urgent', label: 'Riesgo', value: stats.urgentCount, icon: Flame, color: '#EF4444', filter: 'urgent' as DirectoryRiskFilter, sub: '🔴 ' },
    { key: 'avg', label: 'Avg Adher.', value: avgAdherence, icon: Star, color: '#10B981', filter: 'all' as DirectoryRiskFilter, suffix: '%' },
    { key: 'nutrition_low', label: 'Nutri. baja', value: nutritionLowCount, icon: Salad, color: '#EF4444', filter: 'nutrition_low' as DirectoryRiskFilter, sub: '🥗 ' },
  ]
  // Selección del tile = 1:1 web: con filtro 'all' resaltar 'total'; si no, el tile cuyo filter === riskFilter.
  const tileSelected = (tile: { key: string; filter: DirectoryRiskFilter }) =>
    riskFilter === 'all' ? tile.key === 'total' : tile.filter !== 'all' && tile.filter === riskFilter

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
  function handleArchive(c: DirectoryClient) {
    const archiving = !c.isArchived
    Alert.alert(
      archiving ? 'Archivar alumno' : 'Desarchivar alumno',
      archiving
        ? `${c.fullName} se moverá a Archivados. Podrás restaurarlo cuando quieras.`
        : `${c.fullName} volverá al directorio activo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: archiving ? 'Archivar' : 'Desarchivar',
          onPress: () => setClientArchived(c.id, archiving).then(() => load(true)).catch((e: any) => Alert.alert('Error', e?.message ?? 'No se pudo.')),
        },
      ]
    )
  }
  function handleEdit(c: DirectoryClient) {
    // La edición completa de datos del alumno (nombre/teléfono/intake) requiere un endpoint
    // mobile que aún no existe (la web usa server actions intake). De momento, abrir el perfil
    // donde el coach edita esos datos. Ver residualGaps: endpoint de edición.
    router.push(`/coach/cliente/${c.id}`)
  }
  const goProfile = (c: DirectoryClient) => router.push(`/coach/cliente/${c.id}`)
  const goWorkout = (c: DirectoryClient) => router.push(`/coach/program-builder?clientId=${c.id}&clientName=${encodeURIComponent(c.fullName)}`)
  const goNutrition = () => router.push('/coach/nutricion')

  // War Room top (1:1 web CoachWarRoom): título, subtítulo, sync, portal copy chip.
  const warRoomTop = (
    <View style={styles.warRoom}>
      <Text style={[styles.warTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
        Directorio de Alumnos
      </Text>
      <Text style={[styles.warSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        Gestión centralizada · panel operativo tipo War Room
      </Text>
      <View style={styles.warSyncRow}>
        <Text style={[styles.warSyncLabel, { color: theme.mutedForeground }]}>Actualizado al cargar la página</Text>
        <TouchableOpacity style={styles.warSyncBtn} onPress={handleSync} disabled={syncing} activeOpacity={0.7}>
          <RefreshCw size={12} color={theme.primary} />
          <Text style={[styles.warSyncTxt, { color: theme.primary }]}>sync</Text>
        </TouchableOpacity>
      </View>
      {loginUrl ? (
        <TouchableOpacity
          style={[styles.portalChip, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={handleCopyPortal}
          activeOpacity={0.8}
        >
          <Text style={[styles.portalLabel, { color: theme.mutedForeground }]}>Portal alumnos:</Text>
          <Text style={[styles.portalUrl, { color: theme.primary }]} numberOfLines={1}>{loginUrl}</Text>
          <View style={[styles.portalIcon, { backgroundColor: hexToRgba(theme.primary, 0.1) }]}>
            {copied ? <Check size={12} color={theme.primary} /> : <Copy size={12} color={theme.primary} />}
          </View>
        </TouchableOpacity>
      ) : null}
    </View>
  )

  const headerNode = (
    <>
      {warRoomTop}
      <View style={styles.statsGrid}>
        {STAT_TILES.map((tile) => (
          <StatTile key={tile.key} value={tile.value} label={tile.label} icon={tile.icon} color={tile.color}
            selected={tileSelected(tile)}
            onPress={() => setRiskFilter(tile.filter)} sub={tile.sub} suffix={tile.suffix} />
        ))}
      </View>
      {urgentBanner && !isDismissed('urgent', stats.urgentCount) && (
        <AlertBanner message={`🔴 ${stats.urgentCount} alumno${stats.urgentCount !== 1 ? 's' : ''} con atención urgente`} color="#EF4444" onPress={() => setRiskFilter('urgent')} onDismiss={() => dismissAlert('urgent', stats.urgentCount)} />
      )}
      {expiredBanner && !isDismissed('expired', stats.expiredProgramCount) && (
        <AlertBanner message={`${stats.expiredProgramCount} programa${stats.expiredProgramCount !== 1 ? 's' : ''} vencido${stats.expiredProgramCount !== 1 ? 's' : ''}`} color="#F97316" onPress={() => setRiskFilter('expired_program')} onDismiss={() => dismissAlert('expired', stats.expiredProgramCount)} />
      )}
      {syncBanner && !isDismissed('sync', stats.pendingSyncCount) && (
        <AlertBanner message={`${stats.pendingSyncCount} alumno${stats.pendingSyncCount !== 1 ? 's' : ''} con cambio de contraseña pendiente`} color="#F59E0B" onPress={() => setRiskFilter('password_reset')} onDismiss={() => dismissAlert('sync', stats.pendingSyncCount)} />
      )}
      {nutritionLowCount > 0 && !isDismissed('nutrition_low', nutritionLowCount) && (
        <AlertBanner message={`🥗 ${nutritionLowCount} alumno${nutritionLowCount !== 1 ? 's' : ''} con cumplimiento nutricional bajo (<60%)`} color="#EF4444" onPress={() => setRiskFilter('nutrition_low')} onDismiss={() => dismissAlert('nutrition_low', nutritionLowCount)} />
      )}
      {noCheckin1m > 0 && stats.urgentCount === 0 && !isDismissed('checkin', noCheckin1m) && (
        <AlertBanner message={`ALERTA: ${noCheckin1m} alumno${noCheckin1m !== 1 ? 's' : ''} llevan más de 1 mes sin check-in`} color="#F59E0B" onPress={() => setRiskFilter('urgent')} onDismiss={() => dismissAlert('checkin', noCheckin1m)} />
      )}
      {pulseError && (
        <TouchableOpacity activeOpacity={0.85} onPress={loadPulse} style={[styles.pulseErr, { backgroundColor: '#EF444414', borderColor: '#EF444440' }]}>
          <Text style={[styles.pulseErrTxt, { color: '#EF4444', fontFamily: 'Inter_600SemiBold' }]}>No se pudieron cargar las métricas (peso/adherencia).</Text>
          <Text style={[styles.pulseErrAction, { color: '#EF4444', fontFamily: 'Inter_700Bold' }]}>Reintentar</Text>
        </TouchableOpacity>
      )}
      {hasActiveFilters && (
        <View style={styles.chipRow}>
          {riskFilter !== 'all' && (
            <TouchableOpacity style={[styles.filterChip, { borderColor: hexToRgba(theme.primary, 0.3), backgroundColor: hexToRgba(theme.primary, 0.1) }]} onPress={() => setRiskFilter('all')}>
              <Text style={[styles.filterChipText, { color: theme.primary }]}>{RISK_OPTIONS.find((o) => o.value === riskFilter)?.label ?? riskFilter}</Text>
              <X size={11} color={theme.primary} />
            </TouchableOpacity>
          )}
          {statusFilter !== 'any' && (
            <TouchableOpacity style={[styles.filterChip, { borderColor: hexToRgba(theme.primary, 0.3), backgroundColor: hexToRgba(theme.primary, 0.1) }]} onPress={() => setStatusFilter('any')}>
              <Text style={[styles.filterChipText, { color: theme.primary }]}>{STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label}</Text>
              <X size={11} color={theme.primary} />
            </TouchableOpacity>
          )}
          {programFilter !== 'any' && (
            <TouchableOpacity style={[styles.filterChip, { borderColor: hexToRgba(theme.primary, 0.3), backgroundColor: hexToRgba(theme.primary, 0.1) }]} onPress={() => setProgramFilter('any')}>
              <Text style={[styles.filterChipText, { color: theme.primary }]}>{PROGRAM_OPTIONS.find((o) => o.value === programFilter)?.label}</Text>
              <X size={11} color={theme.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}
      <View style={styles.sortRow}>
        <Text style={[styles.sortLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          {displayed.length} resultado{displayed.length !== 1 ? 's' : ''} · Orden: {sortLabel} ({sortDir === 'asc' ? '↑' : '↓'})
        </Text>
      </View>
    </>
  )
  const emptyNode = (
    <View style={styles.emptyWrap}>
      <Users size={36} color={theme.mutedForeground} strokeWidth={1.5} />
      <Text style={[styles.emptyTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
        {search || hasActiveFilters ? 'Sin resultados' : 'Sin alumnos aún'}
      </Text>
      <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {search || hasActiveFilters ? 'Probá ajustando los filtros o la búsqueda.' : 'Usa el botón + para agregar tu primer alumno.'}
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
        {/* Toggle de vista (1:1 web: tabla/cuadrícula) + lista compacta extra mobile */}
        <View style={[styles.viewToggle, { borderColor: theme.border, borderRadius: theme.radius.lg }]}>
          <TouchableOpacity
            style={[styles.viewSeg, viewMode === 'table' ? { backgroundColor: hexToRgba(theme.primary, 0.15) } : null]}
            onPress={() => setView('table')}
          >
            <Table2 size={17} color={viewMode === 'table' ? theme.primary : theme.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewSeg, viewMode === 'cards' ? { backgroundColor: hexToRgba(theme.primary, 0.15) } : null]}
            onPress={() => setView('cards')}
          >
            <LayoutGrid size={17} color={viewMode === 'cards' ? theme.primary : theme.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewSeg, viewMode === 'list' ? { backgroundColor: hexToRgba(theme.primary, 0.15) } : null]}
            onPress={() => setView('list')}
          >
            <ListIcon size={17} color={viewMode === 'list' ? theme.primary : theme.mutedForeground} />
          </TouchableOpacity>
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
          onLongPress={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        >
          <RefreshCw size={16} color={theme.mutedForeground} />
        </TouchableOpacity>
      </View>

      {viewMode === 'cards' ? (
        <Animated.FlatList
          data={gridClients}
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
          ListFooterComponent={
            displayed.length > gridVisibleCount ? (
              <TouchableOpacity
                style={[styles.loadMore, { borderColor: theme.border, backgroundColor: theme.secondary }]}
                onPress={() => setGridVisibleCount((n) => Math.min(n + 48, displayed.length))}
                activeOpacity={0.8}
              >
                <Text style={[styles.loadMoreTxt, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                  Cargar más ({displayed.length - gridVisibleCount} restantes)
                </Text>
              </TouchableOpacity>
            ) : null
          }
        />
      ) : viewMode === 'table' ? (
        <FlatList
          data={EMPTY_DATA}
          keyExtractor={(it) => it.id}
          renderItem={() =>
            displayed.length === 0 ? (
              emptyNode
            ) : (
              <ClientsDirectoryTable
                clients={displayed}
                pulseById={pulseById}
                sortKey={sortKey}
                sortDir={sortDir}
                onSortChange={(k, d) => { setSortKey(k); setSortDir(d) }}
                onRowPress={goProfile}
                onProfile={goProfile}
                onWhatsApp={handleWhatsApp}
                onEdit={handleEdit}
                onArchive={handleArchive}
                onDelete={handleDelete}
                coachSlug={coachSlug}
              />
            )
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onRefresh={() => load(true)}
          refreshing={refreshing}
          ListHeaderComponent={headerNode}
        />
      ) : (
      <FlatList
        data={displayed}
        keyExtractor={(c) => c.id}
        renderItem={({ item, index }) => (
          <ClientRow item={item} index={index} theme={theme} router={router} pulse={pulseById.get(item.id)} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onRefresh={() => load(true)}
        refreshing={refreshing}
        ListHeaderComponent={headerNode}
        ListEmptyComponent={emptyNode}
      />
      )}

      {/* A-F14: FAB secundario Importar → wizard completo (CSV + mapeo + tier-gate) */}
      <TouchableOpacity
        style={[styles.fabSecondary, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => router.push('/coach/clients-import')}
        activeOpacity={0.85}
      >
        <Upload size={20} color={theme.primary} />
      </TouchableOpacity>

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
        onSelect={(v) => { const k = v as DirectorySortKey; setSortKey(k); setSortDir(defaultSortDir(k)) }}
        onClose={() => setShowSortSheet(false)}
        theme={theme}
      />
      <FilterSheet
        visible={showFilterSheet}
        onClose={() => setShowFilterSheet(false)}
        theme={theme}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        riskFilter={riskFilter}
        onRiskChange={setRiskFilter}
        programFilter={programFilter}
        onProgramChange={setProgramFilter}
        archivedCount={clients.filter((c) => c.isArchived).length}
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

// P3: import por CSV (subir archivo o pegar texto) con preview validado. Reusa el endpoint de crear alumno.
function ImportClientsForm({ theme, onDone, onCancel }: { theme: any; onDone: () => void; onCancel: () => void }) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ParsedClientRow[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [ageOk, setAgeOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [result, setResult] = useState<{ ok: number; fail: number; errors: string[] } | null>(null)

  const validRows = useMemo(() => rows.filter((r) => r.valid), [rows])
  const invalidCount = rows.length - validRows.length

  async function pickFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'application/vnd.ms-excel', 'text/plain'],
        copyToCacheDirectory: true,
      })
      if (res.canceled || !res.assets?.[0]) return
      const asset = res.assets[0]
      const content = await FileSystem.readAsStringAsync(asset.uri)
      setFileName(asset.name ?? 'archivo.csv')
      setText('')
      setRows(parseClientsCsv(content))
    } catch {
      Alert.alert('No se pudo leer el archivo', 'Revisá que sea un CSV de texto (nombre,email,telefono).')
    }
  }

  function onPaste(value: string) {
    setText(value)
    setFileName(null)
    setRows(parseClientsCsv(value))
  }

  async function run() {
    if (!ageOk) { Alert.alert('Confirmá edad', 'Confirmá que los alumnos son 14+ o con consentimiento de tutor.'); return }
    if (!validRows.length) { Alert.alert('Sin filas válidas', 'Cada fila debe tener nombre y email válido.'); return }
    setBusy(true)
    let ok = 0, fail = 0; const errors: string[] = []
    for (const r of validRows) {
      try {
        await apiFetch('/api/mobile/coach/clients', {
          method: 'POST', authenticated: true,
          body: { fullName: r.name, email: r.email.toLowerCase(), phone: r.phone, subscriptionStartDate: new Date().toISOString().slice(0, 10), tempPassword: `Eva${Math.floor(100000 + Math.random() * 900000)}!`, ageConfirmed: true },
        })
        ok += 1
      } catch (e: any) {
        fail += 1
        if (errors.length < 5) errors.push(`${r.name}: ${e?.message ?? 'error'}`)
      }
    }
    setBusy(false)
    setResult({ ok, fail, errors })
  }

  if (result) {
    return (
      <View style={{ gap: 12 }}>
        <Text style={{ color: theme.foreground, fontFamily: 'Montserrat_700Bold', fontSize: 16 }}>{result.ok} creados · {result.fail} con error</Text>
        {result.errors.map((e, i) => <Text key={i} style={{ color: theme.destructive, fontSize: 12 }}>{e}</Text>)}
        <Button label="Listo" onPress={onDone} full />
      </View>
    )
  }

  const previewRows = showAll ? rows : rows.slice(0, 6)

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 12.5 }}>
        Subí un CSV con columnas <Text style={{ fontFamily: 'Inter_700Bold' }}>nombre,email,telefono</Text> (una fila por alumno) o pegá el texto. Cada alumno recibe una contraseña temporal.
      </Text>

      <Button label={fileName ? `Archivo: ${fileName}` : 'Subir CSV'} variant="outline" leftIcon={Upload} onPress={pickFile} full />

      <TextInput
        value={text}
        onChangeText={onPaste}
        multiline
        placeholder={'…o pegá aquí:\nnombre,email,telefono\nJuan Pérez,juan@mail.com,+569...'}
        placeholderTextColor={theme.mutedForeground}
        style={{ minHeight: 90, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.lg, backgroundColor: theme.secondary, color: theme.foreground, padding: 12, textAlignVertical: 'top', fontFamily: theme.fontSans }}
      />

      {rows.length ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.foreground, fontSize: 12.5, fontFamily: 'Inter_700Bold' }}>
            {validRows.length} válido(s){invalidCount ? ` · ${invalidCount} con error` : ''}
          </Text>
          {previewRows.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: r.valid ? theme.border : theme.destructive + '55', borderRadius: theme.radius.md, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: r.valid ? 'transparent' : theme.destructive + '0D' }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: r.valid ? '#10B981' : theme.destructive }} />
              <Text numberOfLines={1} style={{ flex: 1, color: theme.foreground, fontSize: 12.5, fontFamily: theme.fontSans }}>
                {r.name || '(sin nombre)'} · {r.email || '(sin email)'}
              </Text>
              {!r.valid ? <Text style={{ color: theme.destructive, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>{r.error}</Text> : null}
            </View>
          ))}
          {rows.length > 6 ? (
            <TouchableOpacity onPress={() => setShowAll((v) => !v)} activeOpacity={0.7}>
              <Text style={{ color: theme.primary, fontSize: 12.5, fontFamily: 'Inter_600SemiBold' }}>{showAll ? 'Ver menos' : `Ver tabla completa (${rows.length})`}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <TouchableOpacity activeOpacity={0.82} onPress={() => setAgeOk((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.lg, padding: 12, backgroundColor: theme.secondary }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: ageOk ? theme.primary : theme.border, backgroundColor: ageOk ? theme.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {ageOk ? <X size={14} color="#fff" /> : null}
        </View>
        <Text style={{ color: theme.mutedForeground, fontSize: 12.5, flex: 1, fontFamily: theme.fontSans }}>Alumnos 14+ o con consentimiento de tutor legal.</Text>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="Cancelar" variant="secondary" onPress={onCancel} disabled={busy} style={{ flex: 1 }} />
        <Button label={busy ? 'Importando…' : `Importar ${validRows.length}`} onPress={run} disabled={busy || validRows.length === 0} style={{ flex: 1 }} />
      </View>
    </View>
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
  viewToggle: { flexDirection: 'row', borderWidth: 1, height: 40, alignItems: 'center', paddingHorizontal: 2, gap: 1 },
  viewSeg: { width: 32, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  warRoom: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 4 },
  warTitle: { fontSize: 24, letterSpacing: -0.5, textTransform: 'uppercase' },
  warSub: { fontSize: 12.5 },
  warSyncRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  warSyncLabel: { fontSize: 9.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  warSyncBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  warSyncTxt: { fontSize: 9.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  portalChip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8 },
  portalLabel: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, flexShrink: 0 },
  portalUrl: { flex: 1, fontSize: 11.5, fontFamily: 'Inter_700Bold' },
  portalIcon: { borderRadius: 999, padding: 4, flexShrink: 0 },
  loadMore: { alignSelf: 'center', borderWidth: 1, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 9, marginTop: 12 },
  loadMoreTxt: { fontSize: 13 },
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
  pulseErr: { marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  pulseErrTxt: { fontSize: 12, flexShrink: 1 },
  pulseErrAction: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
  list: { paddingHorizontal: 16, paddingBottom: 100, gap: 8 },
  cardsList: { paddingHorizontal: 16, paddingBottom: 140 },
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
  fabSecondary: {
    position: 'absolute',
    right: 24,
    bottom: 142,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
})
