import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
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
import { Swipeable } from 'react-native-gesture-handler'
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import {
  AlertOctagon,
  AlertTriangle,
  Apple,
  ArrowUpDown,
  Check,
  ChevronRight,
  EyeOff,
  LayoutGrid,
  List as ListIcon,
  Search,
  SlidersHorizontal,
  Upload,
  Users,
  UserPlus,
  X,
} from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, Button, Input, NativeDialog, ScreenHeader } from '../../../components'
import type { BadgeTone } from '../../../components/Badge'
import { ProgressRing } from '../../../components/ProgressRing'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { ClientCard, CLIENT_CARD_HEIGHT } from '../../../components/coach/ClientCard'
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
import { apiFetch } from '../../../lib/api'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { parseClientsCsv, type ParsedClientRow } from '../../../lib/import-clients'

const CARD_GAP = 12
const CARD_STEP = CLIENT_CARD_HEIGHT + CARD_GAP

// Status fijos del DS (token-contract §1 — NO brand, literales seguros para SVG/iconos).
const SUCCESS = '#1FB877' // success-500
const WARNING = '#F5A524' // warning-500
const DANGER = '#F4365A' // danger-500
const EMBER = '#FF6A3D' // ember-500
const INFO = '#2680FF' // info-500 (fijo)
const SEV_HEX: Record<'danger' | 'warning' | 'success', string> = { danger: DANGER, warning: WARNING, success: SUCCESS }

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

function severityMeta(score: number): { label: string; tone: 'danger' | 'warning' | 'success'; Icon: typeof AlertOctagon } {
  if (score >= 50) return { label: 'Riesgo', tone: 'danger', Icon: AlertOctagon }
  if (score >= 25) return { label: 'Atención', tone: 'warning', Icon: AlertTriangle }
  return { label: 'On track', tone: 'success', Icon: Check }
}

function statusMeta(client: DirectoryClient): { key: string; label: string; tone: BadgeTone } {
  if (client.isArchived) return { key: 'archived', label: 'Archivado', tone: 'neutral' }
  if (!client.isActive) return { key: 'paused', label: 'Pausado', tone: 'neutral' }
  if (client.forcePwChange) return { key: 'pending', label: 'Pend. sync', tone: 'info' }
  return { key: 'active', label: 'Activo', tone: 'success' }
}

function lastInfo(date: string | null): { label: string; dot: string } {
  if (!date) return { label: 'Sin entrenos', dot: '#A8B1BD' }
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  const dot = days < 3 ? SUCCESS : days < 7 ? WARNING : DANGER
  if (days <= 0) return { label: 'Hoy', dot }
  if (days === 1) return { label: 'Ayer', dot }
  return { label: `Hace ${days}d`, dot }
}

// ─── Pulse card (prioridad: Riesgo / Atención) — botón-filtro jerárquico ───────

function PulseCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  selected,
  onPress,
}: {
  label: string
  value: number
  hint: string
  tone: 'danger' | 'warning'
  icon: typeof AlertOctagon
  selected: boolean
  onPress: () => void
}) {
  const { theme } = useTheme()
  const color = tone === 'danger' ? DANGER : WARNING
  const fg = selected ? '#fff' : color
  return (
    <TouchableOpacity
      style={[
        pulseStyles.card,
        {
          backgroundColor: selected ? color : color + '1A',
          borderColor: selected ? color : theme.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={pulseStyles.top}>
        <View style={pulseStyles.labelRow}>
          <Icon size={14} color={fg} />
          <Text style={[pulseStyles.label, { color: fg }]}>{label}</Text>
        </View>
        {value > 0 ? <ChevronRight size={15} color={fg} /> : null}
      </View>
      <Text style={[pulseStyles.value, { color: selected ? '#fff' : value > 0 ? color : theme.mutedForeground }]}>{value}</Text>
      <Text numberOfLines={1} style={[pulseStyles.hint, { color: selected ? 'rgba(255,255,255,0.85)' : theme.mutedForeground }]}>{hint}</Text>
    </TouchableOpacity>
  )
}
const pulseStyles = StyleSheet.create({
  card: { flex: 1, minWidth: 0, gap: 5, padding: 14, borderRadius: 20, borderWidth: 1.5 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 12, fontFamily: 'HankenGrotesk_800ExtraBold', letterSpacing: 0.2 },
  value: { fontSize: 30, lineHeight: 32, fontFamily: 'Archivo_900Black', fontVariant: ['tabular-nums'] },
  hint: { fontSize: 11, fontFamily: 'HankenGrotesk_600SemiBold' },
})

// ─── Metric chip (Total / Activos / On track / Sin plan) ───────────────────────

function MetricChip({
  label,
  value,
  suffix,
  color,
  selected,
  onPress,
}: {
  label: string
  value: number
  suffix?: string
  color: string
  selected: boolean
  onPress?: () => void
}) {
  const { theme } = useTheme()
  return (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      activeOpacity={onPress ? 0.8 : 1}
      style={[
        chipStyles.chip,
        {
          backgroundColor: selected ? theme.foreground : theme.card,
          borderColor: selected ? theme.foreground : theme.border,
        },
      ]}
    >
      <Text numberOfLines={1} style={[chipStyles.value, { color: selected ? '#fff' : color }]}>
        {value}
        {suffix ?? ''}
      </Text>
      <Text numberOfLines={1} style={[chipStyles.label, { color: selected ? 'rgba(255,255,255,0.72)' : theme.mutedForeground }]}>{label}</Text>
    </TouchableOpacity>
  )
}
const chipStyles = StyleSheet.create({
  chip: { flex: 1, minWidth: 0, gap: 1, paddingHorizontal: 8, paddingVertical: 9, borderRadius: 14, borderWidth: 1.5 },
  value: { fontSize: 17, lineHeight: 19, fontFamily: 'Archivo_800ExtraBold', fontVariant: ['tabular-nums'] },
  label: { fontSize: 9.5, fontFamily: 'HankenGrotesk_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
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
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
  },
  text: { fontSize: 13, fontFamily: 'HankenGrotesk_600SemiBold' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ctaText: { fontSize: 11, fontFamily: 'HankenGrotesk_800ExtraBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  dismiss: { width: 96, marginRight: 16, marginBottom: 8, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dismissText: { fontSize: 11, fontFamily: 'HankenGrotesk_800ExtraBold', textTransform: 'uppercase', letterSpacing: 0.4 },
})

// ─── Client Row (vista lista) · espejo de DirRowCard ───────────────────────────

function ClientRow({ item, index, theme, router, pulse }: { item: DirectoryClient; index: number; theme: any; router: any; pulse?: PulseRow }) {
  const adherence = pulse?.percentage ?? null
  const score = pulse?.attentionScore ?? item.attentionScore
  const sev = severityMeta(score)
  const ringColor = adherence == null ? theme.border : adherence >= 75 ? theme.primary : adherence >= 50 ? WARNING : DANGER
  const li = lastInfo(pulse?.lastWorkoutDate ?? item.lastWorkoutDate)
  const nutri = pulse?.nutritionPercentage ?? 0
  const nutriRisk = (pulse?.attentionFlags?.includes('NUTRICION_RIESGO') ?? false) || (nutri > 0 && nutri < 60)
  const st = statusMeta(item)

  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 300, delay: Math.min(index * 40, 320) }}
    >
      <TouchableOpacity
        style={[rowStyles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => router.push(`/coach/cliente/${item.id}`)}
        activeOpacity={0.75}
      >
        {/* Anillo de adherencia con inicial + dot de última actividad */}
        <View style={rowStyles.ringWrap}>
          <ProgressRing
            value={adherence ?? 0}
            size={50}
            stroke={5}
            color={ringColor}
            showValue={false}
            label={
              <Text style={{ fontSize: 18, fontFamily: 'Archivo_800ExtraBold', color: theme.foreground }}>
                {item.fullName.charAt(0).toUpperCase()}
              </Text>
            }
          />
          <View style={[rowStyles.lastDot, { backgroundColor: li.dot, borderColor: theme.card }]} />
        </View>

        <View style={rowStyles.info}>
          <View style={rowStyles.nameRow}>
            <Text style={[rowStyles.name, { color: theme.foreground }]} numberOfLines={1}>{item.fullName}</Text>
            <Badge tone={sev.tone} variant="soft" size="sm" icon={<sev.Icon size={11} color={SEV_HEX[sev.tone]} />}>{sev.label}</Badge>
          </View>
          <View style={rowStyles.metricsRow}>
            {adherence != null ? (
              <Text style={[rowStyles.metricStrong, { color: theme.foreground }]}>{adherence}%</Text>
            ) : null}
            {adherence != null ? <Text style={[rowStyles.dotSep, { color: theme.border }]}>·</Text> : null}
            <Text style={[rowStyles.metric, { color: theme.mutedForeground }]}>{li.label}</Text>
            {nutriRisk ? (
              <>
                <Text style={[rowStyles.dotSep, { color: theme.border }]}>·</Text>
                <Apple size={12} color={EMBER} />
                <Text style={[rowStyles.metric, { color: EMBER }]}>{nutri}%</Text>
              </>
            ) : null}
            {st.key !== 'active' ? (
              <View style={{ marginLeft: 2 }}>
                <Badge tone={st.tone} variant="soft" size="sm">{st.label}</Badge>
              </View>
            ) : null}
          </View>
        </View>

        <ChevronRight size={18} color={theme.mutedForeground} />
      </TouchableOpacity>
    </MotiView>
  )
}

const rowStyles = StyleSheet.create({
  card: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ringWrap: { position: 'relative', flexShrink: 0 },
  lastDot: { position: 'absolute', bottom: -1, right: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  info: { flex: 1, gap: 4, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 },
  name: { fontSize: 15.5, fontFamily: 'Archivo_800ExtraBold', letterSpacing: -0.2, flexShrink: 1 },
  metricsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metricStrong: { fontSize: 12, fontFamily: 'JetBrainsMono_700Bold' },
  metric: { fontSize: 12, fontFamily: 'HankenGrotesk_500Medium' },
  dotSep: { fontSize: 12 },
})

// ─── Sort Sheet ───────────────────────────────────────────────────────────────

const SORT_OPTIONS: { label: string; value: DirectorySortKey }[] = [
  { label: 'Urgencia (default)', value: 'attention_score' },
  { label: 'Nombre A→Z', value: 'name_asc' },
  { label: 'Última sesión', value: 'last_workout' },
  { label: 'Días plan restantes', value: 'plan_days' },
  { label: 'Adherencia', value: 'adherence' },
  { label: 'Peso: mayor cambio', value: 'weight_change' },
]

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: 'Todos', value: 'any' },
  { label: 'Activos', value: 'active' },
  { label: 'Pausados', value: 'paused' },
  { label: 'Cambio de contraseña pendiente', value: 'pending_sync' },
  { label: 'Archivados', value: 'archived' },
]

const RISK_LABELS: Record<string, string> = {
  urgent: 'Riesgo',
  review: 'Atención',
  on_track: 'On track',
  expired_program: 'Programa vencido',
  password_reset: 'Cambio de contraseña',
  no_program: 'Sin programa',
  with_program: 'Con programa',
  nutrition_low: 'Nutrición baja',
}

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
        <View style={[sheetStyles.handle, { backgroundColor: theme.border }]} />
        <Text style={[sheetStyles.title, { color: theme.foreground, fontFamily: 'Archivo_800ExtraBold' }]}>
          {title}
        </Text>
        {options.map((opt) => {
          const active = selected === opt.value
          return (
            <TouchableOpacity
              key={opt.value}
              style={[sheetStyles.option, { backgroundColor: active ? theme.muted : 'transparent' }]}
              onPress={() => { onSelect(opt.value); onClose() }}
            >
              <View style={{ width: 18 }}>{active ? <Check size={16} color={theme.primary} /> : null}</View>
              <Text
                style={[
                  sheetStyles.optionText,
                  {
                    color: theme.foreground,
                    fontFamily: active ? 'HankenGrotesk_700Bold' : 'HankenGrotesk_500Medium',
                  },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          )
        })}
        <View style={{ height: 24 }} />
      </View>
    </Modal>
  )
}

const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 2,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 18, marginBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
  optionText: { fontSize: 15 },
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

  const fields: { key: keyof CreateForm; label: string; placeholder?: string }[] = [
    { key: 'fullName', label: 'Nombre completo *' },
    { key: 'email', label: 'Email *' },
    { key: 'phone', label: 'Teléfono (opcional)' },
    { key: 'tempPassword', label: 'Contraseña temporal *', placeholder: 'Min. 6 caracteres' },
  ]

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={sheetStyles.overlay} onPress={onClose} />
        <View style={[createStyles.sheet, { backgroundColor: theme.card }]}>
          <View style={[sheetStyles.handle, { backgroundColor: theme.border }]} />
          <View style={createStyles.header}>
            <Text style={[createStyles.title, { color: theme.foreground, fontFamily: 'Archivo_800ExtraBold' }]}>
              Nuevo Alumno
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <X size={20} color={theme.mutedForeground} />
            </TouchableOpacity>
          </View>

          {error && (
            <View style={[createStyles.errorBox, { backgroundColor: DANGER + '18', borderColor: DANGER + '40' }]}>
              <Text style={[createStyles.errorText, { color: DANGER }]}>{error}</Text>
            </View>
          )}

          {fields.map(({ key, label, placeholder }) => (
            <Input
              key={key}
              label={label}
              value={form[key]}
              onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
              placeholder={placeholder}
              autoCapitalize={key === 'fullName' ? 'words' : 'none'}
              keyboardType={key === 'email' ? 'email-address' : key === 'phone' ? 'phone-pad' : 'default'}
              secureTextEntry={key === 'tempPassword'}
              autoCorrect={false}
            />
          ))}

          <Button label={loading ? 'Creando…' : 'Crear Alumno'} variant="sport" size="lg" full loading={loading} disabled={loading} onPress={handleSubmit} />
          <View style={{ height: 12 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const createStyles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 20 },
  errorBox: { borderRadius: 12, borderWidth: 1, padding: 12 },
  errorText: { fontSize: 13, fontFamily: 'HankenGrotesk_600SemiBold' },
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

  // Pulso de prioridad (2 números jerárquicos) — botones-filtro de riesgo.
  const pulseTiles = [
    { key: 'urgent', label: 'Riesgo', value: stats.urgentCount, filter: 'urgent' as DirectoryRiskFilter, tone: 'danger' as const, icon: AlertOctagon, hint: stats.urgentCount ? (stats.urgentCount === 1 ? 'Necesita atención hoy' : 'Necesitan atención hoy') : 'Todo en orden' },
    { key: 'review', label: 'Atención', value: stats.reviewCount, filter: 'review' as DirectoryRiskFilter, tone: 'warning' as const, icon: AlertTriangle, hint: stats.reviewCount ? 'Para revisar pronto' : 'Sin pendientes' },
  ]
  // Métricas secundarias — grilla de 4 (todo en una pantalla).
  const metricTiles = [
    { key: 'total', label: 'Total', value: stats.total, filter: 'all' as DirectoryRiskFilter, color: theme.foreground },
    { key: 'active', label: 'Activos', value: stats.active, filter: 'all' as DirectoryRiskFilter, color: theme.primary },
    { key: 'ontrack', label: 'On track', value: stats.onTrackCount, filter: 'on_track' as DirectoryRiskFilter, color: SUCCESS },
    { key: 'noprogram', label: 'Sin plan', value: stats.noProgramCount, filter: 'no_program' as DirectoryRiskFilter, color: theme.mutedForeground },
  ]
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
      {/* Resumen · hoy — pulso de prioridad + métricas secundarias */}
      <View style={styles.summary}>
        <Text style={[styles.eyebrow, { color: theme.mutedForeground }]}>Resumen · hoy</Text>
        <View style={styles.pulseRow}>
          {pulseTiles.map((t) => (
            <PulseCard key={t.key} label={t.label} value={t.value} hint={t.hint} tone={t.tone} icon={t.icon}
              selected={riskFilter === t.filter} onPress={() => toggleRisk(t.filter)} />
          ))}
        </View>
        <View style={styles.metricRow}>
          {metricTiles.map((t) => (
            <MetricChip key={t.key} label={t.label} value={t.value} color={t.color}
              selected={riskFilter === t.filter && t.filter !== 'all'}
              onPress={t.filter === 'all' ? () => setRiskFilter('all') : () => toggleRisk(t.filter)} />
          ))}
        </View>
      </View>

      {/* Alert banners */}
      {urgentBanner && !isDismissed('urgent', stats.urgentCount) && (
        <AlertBanner message={`${stats.urgentCount} alumno${stats.urgentCount !== 1 ? 's' : ''} con atención urgente`} color={DANGER} onPress={() => setRiskFilter('urgent')} onDismiss={() => dismissAlert('urgent', stats.urgentCount)} />
      )}
      {expiredBanner && !isDismissed('expired', stats.expiredProgramCount) && (
        <AlertBanner message={`${stats.expiredProgramCount} programa${stats.expiredProgramCount !== 1 ? 's' : ''} vencido${stats.expiredProgramCount !== 1 ? 's' : ''}`} color={WARNING} onPress={() => setRiskFilter('expired_program')} onDismiss={() => dismissAlert('expired', stats.expiredProgramCount)} />
      )}
      {syncBanner && !isDismissed('sync', stats.pendingSyncCount) && (
        <AlertBanner message={`${stats.pendingSyncCount} alumno${stats.pendingSyncCount !== 1 ? 's' : ''} con cambio de contraseña pendiente`} color={INFO} onPress={() => setRiskFilter('password_reset')} onDismiss={() => dismissAlert('sync', stats.pendingSyncCount)} />
      )}
      {nutritionLowCount > 0 && !isDismissed('nutrition_low', nutritionLowCount) && (
        <AlertBanner message={`${nutritionLowCount} alumno${nutritionLowCount !== 1 ? 's' : ''} con adherencia nutricional baja`} color={EMBER} onPress={() => setRiskFilter('nutrition_low')} onDismiss={() => dismissAlert('nutrition_low', nutritionLowCount)} />
      )}
      {pulseError && (
        <TouchableOpacity activeOpacity={0.85} onPress={loadPulse} style={[styles.pulseErr, { backgroundColor: DANGER + '14', borderColor: DANGER + '40' }]}>
          <Text style={[styles.pulseErrTxt, { color: DANGER }]}>No se pudieron cargar las métricas (peso/adherencia).</Text>
          <Text style={[styles.pulseErrAction, { color: DANGER }]}>Reintentar</Text>
        </TouchableOpacity>
      )}

      {/* Active filter chips */}
      {chips.length > 0 && (
        <View style={styles.chipRow}>
          {chips.map((c) => (
            <TouchableOpacity key={c.key} style={[styles.filterChip, { backgroundColor: theme.foreground }]} onPress={c.onClear} activeOpacity={0.85}>
              <Text style={[styles.filterChipText, { color: theme.card }]}>{c.label}</Text>
              <X size={12} color={theme.card} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => { setRiskFilter('all'); setStatusFilter('any') }} activeOpacity={0.7}>
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
      <Text style={[styles.emptyTitle, { color: theme.foreground, fontFamily: 'Archivo_900Black' }]}>
        {search || hasActiveFilters ? 'Sin resultados' : 'Sin alumnos aún'}
      </Text>
      <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
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
          leftIcon={Search}
          placeholder="Buscar alumno..."
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={{ flex: 1 }}
        />
        <BarButton theme={theme} onPress={() => setShowFilterSheet(true)} active={hasActiveFilters} badge={activeFilterCount}>
          <SlidersHorizontal size={18} color={hasActiveFilters ? theme.primary : theme.mutedForeground} />
        </BarButton>
        <BarButton theme={theme} onPress={() => setShowSortSheet(true)} onLongPress={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
          <ArrowUpDown size={18} color={theme.mutedForeground} />
        </BarButton>
        <BarButton theme={theme} onPress={toggleView}>
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

      {/* A-F14: FAB secundario Importar (paste CSV) */}
      <TouchableOpacity
        style={[styles.fabSecondary, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => setShowImport(true)}
        activeOpacity={0.85}
      >
        <Upload size={20} color={theme.primary} />
      </TouchableOpacity>

      {/* FAB: Nuevo Alumno (pill extendido, acción primaria) */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.primary }, theme.shadowGlowBlue]}
        onPress={() => setShowCreate(true)}
        activeOpacity={0.9}
      >
        <UserPlus size={19} color="#fff" />
        <Text style={styles.fabLabel}>Nuevo alumno</Text>
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
  children,
}: {
  theme: any
  onPress: () => void
  onLongPress?: () => void
  active?: boolean
  badge?: number
  children: React.ReactNode
}) {
  return (
    <TouchableOpacity
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
        <Text style={{ color: theme.foreground, fontFamily: 'Archivo_800ExtraBold', fontSize: 16 }}>{result.ok} creados · {result.fail} con error</Text>
        {result.errors.map((e, i) => <Text key={i} style={{ color: theme.destructive, fontSize: 12 }}>{e}</Text>)}
        <Button label="Listo" onPress={onDone} full />
      </View>
    )
  }

  const previewRows = showAll ? rows : rows.slice(0, 6)

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 12.5 }}>
        Subí un CSV con columnas <Text style={{ fontFamily: 'HankenGrotesk_700Bold' }}>nombre,email,telefono</Text> (una fila por alumno) o pegá el texto. Cada alumno recibe una contraseña temporal.
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
          <Text style={{ color: theme.foreground, fontSize: 12.5, fontFamily: 'HankenGrotesk_700Bold' }}>
            {validRows.length} válido(s){invalidCount ? ` · ${invalidCount} con error` : ''}
          </Text>
          {previewRows.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: r.valid ? theme.border : theme.destructive + '55', borderRadius: theme.radius.md, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: r.valid ? 'transparent' : theme.destructive + '0D' }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: r.valid ? SUCCESS : theme.destructive }} />
              <Text numberOfLines={1} style={{ flex: 1, color: theme.foreground, fontSize: 12.5, fontFamily: theme.fontSans }}>
                {r.name || '(sin nombre)'} · {r.email || '(sin email)'}
              </Text>
              {!r.valid ? <Text style={{ color: theme.destructive, fontSize: 11, fontFamily: 'HankenGrotesk_600SemiBold' }}>{r.error}</Text> : null}
            </View>
          ))}
          {rows.length > 6 ? (
            <TouchableOpacity onPress={() => setShowAll((v) => !v)} activeOpacity={0.7}>
              <Text style={{ color: theme.primary, fontSize: 12.5, fontFamily: 'HankenGrotesk_600SemiBold' }}>{showAll ? 'Ver menos' : `Ver tabla completa (${rows.length})`}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <TouchableOpacity activeOpacity={0.82} onPress={() => setAgeOk((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.lg, padding: 12, backgroundColor: theme.secondary }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: ageOk ? theme.primary : theme.border, backgroundColor: ageOk ? theme.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {ageOk ? <Check size={14} color="#fff" /> : null}
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
  barBadgeTxt: { color: '#fff', fontSize: 10, fontFamily: 'HankenGrotesk_800ExtraBold' },
  summary: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  eyebrow: { fontSize: 11, fontFamily: 'HankenGrotesk_800ExtraBold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  pulseRow: { flexDirection: 'row', gap: 8 },
  metricRow: { flexDirection: 'row', gap: 6 },
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
  filterChipText: { fontSize: 12.5, fontFamily: 'HankenGrotesk_600SemiBold' },
  clearLink: { fontSize: 12.5, fontFamily: 'HankenGrotesk_700Bold', textDecorationLine: 'underline' },
  sortRow: { paddingHorizontal: 18, paddingBottom: 10 },
  sortLabel: { fontSize: 12, fontFamily: 'HankenGrotesk_500Medium' },
  pulseErr: { marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  pulseErrTxt: { fontSize: 12, flexShrink: 1, fontFamily: 'HankenGrotesk_600SemiBold' },
  pulseErrAction: { fontSize: 12, fontFamily: 'HankenGrotesk_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 },
  list: { paddingHorizontal: 16, paddingBottom: 120, gap: 8 },
  cardsList: { paddingHorizontal: 16, paddingBottom: 150 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32, paddingTop: 48 },
  emptyIcon: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 22, letterSpacing: -0.5 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
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
  fabLabel: { color: '#fff', fontSize: 15, fontFamily: 'HankenGrotesk_700Bold' },
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
})
