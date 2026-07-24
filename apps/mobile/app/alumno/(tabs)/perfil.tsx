import { useEffect, useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { cssInterop } from 'nativewind'
import {
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Dumbbell,
  Fingerprint,
  Flame,
  History,
  KeyRound,
  LogOut,
  Moon,
  PersonStanding,
  Scale,
  Share2,
  Sun,
  Trash2,
  TrendingUp,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { MotiView } from 'moti'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { signOutAndCleanup } from '../../../lib/auth-actions'
import { authenticate, isBiometricAvailable, isBiometricLockEnabled, setBiometricLockEnabled } from '../../../lib/biometric'
import { getClientProfile } from '../../../lib/client'
import { getWorkoutDaySummaries } from '../../../lib/history.queries'
import { getMonthlyRecap, type MonthlyRecap } from '../../../lib/monthly-summary'
import { clearBranding } from '../../../lib/branding'
import { useTheme } from '../../../context/ThemeContext'
import { SHADOWS } from '../../../lib/shadows'
import { Avatar, Button, Card, Dialog, Input, Sheet } from '../../../components'
import { ListRow } from '../../../components/ListRow'
import { StatCard } from '../../../components/StatCard'
import { Switch } from '../../../components/Switch'
import {
  ShareCardDate,
  ShareCardEyebrow,
  ShareCardHero,
  ShareCardPill,
  ShareCardPreview,
  ShareCardSubtitle,
  ShareCardTitle,
  type ShareCardVariant,
} from '../../../components/ShareCard'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { ALUMNO_TABBAR_CLEARANCE } from '../../../components/alumno/AlumnoMobileChrome'
import { RestAlarmPreference } from '../../../components/alumno/RestAlarmPreference'
import { MonthlySummaryShareCard } from '../../../components/alumno/MonthlySummaryShareCard'
import { useEntitlements } from '../../../lib/entitlements'

// Correo de contacto — una sola fuente, espejo de `SALES_EMAIL` (web `lib/brand-assets`).
const SALES_EMAIL = 'contacto@eva-app.cl'

// Let NativeWind drive the lucide icon `color` via `text-*` classes (same DS
// pattern Sheet/Dialog use for their close glyph). This keeps the frozen
// `lib/theme` shim out of this screen — every color here is a DS token, so dark
// mode + the white-label brand ramp resolve at runtime.
for (const Icon of [
  CalendarDays, ChevronRight, CircleHelp, Dumbbell, Fingerprint, Flame, History,
  KeyRound, LogOut, Moon, PersonStanding, Scale, Share2, Sun, Trash2, TrendingUp,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

interface AlumnoDetail {
  fullName: string
  email: string
  phone: string | null
  goalWeightKg: number | null
  subscriptionStartDate: string | null
  coachTier: string | null
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Section eyebrow — DS SectionTitle: accent bar + uppercase 11px extrabold in
// text-subtle (1:1 with the web `SectionTitle`).
function SectionTitle({ children }: { children: string }) {
  return (
    <View className="mx-0.5 mb-2.5 mt-5 flex-row items-center gap-2">
      <View className="h-3 w-[3px] rounded-sm bg-sport-500" />
      <Text
        className="font-sans-extra text-subtle"
        style={{ fontSize: 11, letterSpacing: 0.77, textTransform: 'uppercase' }}
      >
        {children}
      </Text>
    </View>
  )
}

type Tone = 'neutral' | 'sport' | 'success' | 'danger'
const TILE_BG: Record<Tone, string> = {
  neutral: 'bg-surface-sunken',
  sport: 'bg-sport-100',
  success: 'bg-success-100',
  danger: 'bg-danger-100',
}
const TILE_FG: Record<Tone, string> = {
  neutral: 'text-ink-700',
  sport: 'text-sport-600',
  success: 'text-success-700',
  danger: 'text-danger-600',
}

// 36px rounded tile that hosts a row icon (DS ListRow leading slot).
function IconTile({ Icon, tone = 'neutral' }: { Icon: LucideIcon; tone?: Tone }) {
  return (
    <View className={`items-center justify-center rounded-md ${TILE_BG[tone]}`} style={{ width: 36, height: 36 }}>
      <Icon size={18} strokeWidth={2} className={TILE_FG[tone]} />
    </View>
  )
}

// Hairline divider between stacked rows inside a padding-none Card.
function RowDivider() {
  return <View className="mx-[14px] border-t border-subtle" />
}

// label/value line for the "Información" card.
function InfoLine({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      className={`flex-row items-center justify-between ${last ? '' : 'border-b border-subtle'}`}
      style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}
    >
      <Text className="font-sans text-muted" style={{ fontSize: 14 }}>
        {label}
      </Text>
      <Text className="font-sans-medium text-body" style={{ fontSize: 14, textAlign: 'right', flexShrink: 1 }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

// Light / dark appearance toggle — wired to ThemeContext (no new state; the
// active option is derived from the resolved scheme).
function AppearanceToggle() {
  const { resolvedScheme, toggleTheme } = useTheme()
  const opts: [('light' | 'dark'), string, LucideIcon][] = [
    ['light', 'Claro', Sun],
    ['dark', 'Oscuro', Moon],
  ]
  return (
    <Card padding="sm">
      <View className="flex-row rounded-control bg-surface-sunken" style={{ gap: 6, padding: 4 }} accessibilityRole="tablist">
        {opts.map(([val, label, Icon]) => {
          const active = resolvedScheme === val
          return (
            <Pressable
              key={val}
              testID={`perfil-tema-${val}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              onPress={() => {
                if (!active) toggleTheme()
              }}
              className={active ? 'bg-surface-card' : ''}
              style={[
                { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 10 },
                active ? SHADOWS[resolvedScheme].sm : null,
              ]}
            >
              <Icon size={18} strokeWidth={2.2} className={active ? 'text-strong' : 'text-muted'} />
              <Text className={active ? 'font-sans-bold text-strong' : 'font-sans-bold text-muted'} style={{ fontSize: 14.5 }}>
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </Card>
  )
}

// Option inside the "Comparte tu logro" sheet (mirror of the web ShareTemplateOption).
function ShareOption({
  Icon,
  title,
  subtitle,
  tone,
  onPress,
  testID,
}: {
  Icon: LucideIcon
  title: string
  subtitle: string
  tone: 'sport' | 'ember'
  onPress: () => void
  testID: string
}) {
  const bg = tone === 'ember' ? 'bg-ember-100' : 'bg-sport-100'
  const iconBg = tone === 'ember' ? 'bg-ember-500' : 'bg-sport-500'
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-row items-center rounded-card border border-subtle ${bg}`}
      style={{ gap: 14, padding: 14 }}
    >
      <View className={`items-center justify-center rounded-xl ${iconBg}`} style={{ width: 44, height: 44 }}>
        <Icon size={20} strokeWidth={2.2} className="text-white" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text className="font-sans-extra text-strong" style={{ fontSize: 14.5 }}>
          {title}
        </Text>
        <Text className="font-sans text-muted" style={{ fontSize: 12.5 }} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={18} className="text-ink-300" />
    </Pressable>
  )
}

export default function AlumnoPerfilScreen() {
  const { branding, setBranding, resolvedScheme } = useTheme()
  const insets = useSafeAreaInsets()
  const { hasModule } = useEntitlements()
  const router = useRouter()
  // Módulos de pago activos del coach del alumno (E6-11). Solo se muestran las filas cuya
  // superficie read-only existe (/alumno/movement · /alumno/bodycomp) si el módulo está ON.
  const showMovement = hasModule('movement_assessment')
  const showBodyComp = hasModule('body_composition')
  const [detail, setDetail] = useState<AlumnoDetail | null>(null)
  const [stats, setStats] = useState<{ totalWorkouts: number; streak: number }>({ totalWorkouts: 0, streak: 0 })
  const [monthly, setMonthly] = useState<MonthlyRecap | null>(null)
  // Nombre del programa activo — pill del hero + pill de la share-card de progreso
  // (web ProfileClient.tsx:255-262 y canvas:770-776 vía getActiveProgram, page.tsx:37/57).
  const [programName, setProgramName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  // Selector de plantilla de share-card (Progreso / Racha) + tarjeta activa.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [activeShare, setActiveShare] = useState<ShareCardVariant | null>(null)

  useEffect(() => {
    load().catch(() => setLoading(false))
  }, [])

  async function load() {
    setLoading(true)
    const client = await getClientProfile()
    if (!client) { setLoading(false); return }

    const [{ data: { user } }, { data }, { data: coachData }, daySummaries, monthlyRecap, { data: programRow }, { data: streakData }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('clients').select('full_name, phone, goal_weight_kg, subscription_start_date').eq('id', client.id).maybeSingle(),
      supabase.from('coaches').select('subscription_tier').eq('id', client.coachId).maybeSingle(),
      // Entrenos = días con series (últ. 12 meses) para el total del historial.
      getWorkoutDaySummaries(client.id, 365).catch(() => []),
      // Resumen del mes calendario (Santiago) para la share-card mensual — fail-open (nunca lanza).
      getMonthlyRecap(client.id),
      // Programa activo (solo el nombre) — mirror de getActiveProgram web (dashboard.queries.ts:84-101).
      supabase.from('workout_programs').select('name').eq('client_id', client.id).eq('is_active', true).maybeSingle(),
      // Racha = MISMO RPC que el home (get_client_current_streak, regla "días asignados",
      // migración 20260723110000) — antes se derivaba local (días consecutivos con entreno)
      // y divergía del ribbon del home.
      supabase.rpc('get_client_current_streak', { p_client_id: client.id }),
    ])

    setDetail({
      fullName: data?.full_name ?? client.fullName,
      email: user?.email ?? '',
      phone: data?.phone ?? null,
      goalWeightKg: data?.goal_weight_kg ?? null,
      subscriptionStartDate: data?.subscription_start_date ?? null,
      coachTier: (coachData as any)?.subscription_tier ?? null,
    })
    const streakN = typeof streakData === 'number' ? streakData : Number(streakData)
    setStats({
      totalWorkouts: daySummaries.length,
      streak: Number.isFinite(streakN) ? streakN : 0,
    })
    setMonthly(monthlyRecap)
    setProgramName((programRow as { name?: string | null } | null)?.name?.trim() || null)
    setLoading(false)
  }

  async function handleChangePassword() {
    if (newPassword.length < 8) {
      Alert.alert('Contraseña muy corta', 'Debe tener al menos 8 caracteres.')
      return
    }
    setChangingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setChangingPassword(false)
    if (error) {
      Alert.alert('Error', 'No se pudo cambiar la contraseña. Intenta de nuevo.')
    } else {
      Alert.alert('Listo', 'Contraseña actualizada correctamente.')
      setShowPasswordModal(false)
      setNewPassword('')
    }
  }

  async function handleLogout() {
    await signOutAndCleanup()
    await AsyncStorage.removeItem('eva_user_role')
    await clearBranding()
    setBranding(null)
    router.replace('/')
  }

  const [bioAvailable, setBioAvailable] = useState(false)
  const [bioEnabled, setBioEnabled] = useState(false)
  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable).catch(() => {})
    isBiometricLockEnabled().then(setBioEnabled).catch(() => {})
  }, [])
  async function toggleBio(next: boolean) {
    if (next) {
      const ok = await authenticate('Confirma para activar el bloqueo')
      if (!ok) return
    }
    await setBiometricLockEnabled(next)
    setBioEnabled(next)
  }

  function pickShare(variant: ShareCardVariant) {
    setPickerOpen(false)
    setActiveShare(variant)
  }

  const hasExtras = detail?.phone || detail?.goalWeightKg != null || detail?.subscriptionStartDate
  const firstName = (detail?.fullName ?? '').trim().split(/\s+/)[0] || 'Atleta'
  // Marca del coach para el título "Constancia con {marca}" (mismo fallback que el chrome
  // de la card — ShareCard.tsx:371; web usa brand.brandName → 'EVA', canvas:733).
  const brandName = branding?.displayName?.trim() || 'EVA'
  const streakSubtitle = stats.streak > 0
    ? `${stats.streak} ${stats.streak === 1 ? 'día' : 'días'} seguidos activo`
    : 'Enciende tu racha'

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView style={{ flex: 1 }}>
        {loading ? (
          <EvaLoaderScreen subtitle="Cargando perfil…" />
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }} showsVerticalScrollIndicator={false}>
            <View style={{ paddingVertical: 16 }}>
              <Text className="font-display-black text-strong" style={{ fontSize: 22, letterSpacing: -0.44 }}>
                Mi perfil
              </Text>
            </View>

            {/* Hero — inverse identity card (DS) */}
            <MotiView
              from={{ opacity: 0, translateY: 16 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 450 }}
              style={{ marginBottom: 16 }}
            >
              <Card variant="inverse" padding="lg" style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <Avatar name={detail?.fullName ?? ''} size="xl" ring="sport" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text className="font-display-black text-on-dark" style={{ fontSize: 22, letterSpacing: -0.4 }} numberOfLines={1}>
                    {detail?.fullName ?? '-'}
                  </Text>
                  {/* Coach line — mirror de web ProfileClient.tsx:254 (SIEMPRE visible, fallback 'tu coach'
                      igual que web page.tsx:49). Web NO muestra email en el hero (spec §2.1). */}
                  <Text className="font-sans text-on-dark-muted" style={{ fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                    Coach: {branding?.displayName?.trim() || 'tu coach'}
                  </Text>
                  {/* Pill del programa activo — mirror de web ProfileClient.tsx:255-262 (sport-500 + texto blanco). */}
                  {programName ? (
                    <View className="self-start rounded-pill bg-sport-500" style={{ marginTop: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text className="font-sans-bold text-white" style={{ fontSize: 11.5 }} numberOfLines={1}>
                        {programName}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Card>
            </MotiView>

            {/* Stats — Entrenos + Racha (grid 2-col, DS StatCard) */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <StatCard label="Entrenos" value={stats.totalWorkouts} icon={Dumbbell} accent="sport" />
              </View>
              <View style={{ flex: 1 }}>
                <StatCard label="Racha" value={stats.streak} unit="días" icon={Flame} accent="ember" />
              </View>
            </View>

            {/* Comparte tu logro — abre el selector de plantilla (Sheet DS) */}
            <Pressable
              testID="perfil-share-cta"
              accessibilityRole="button"
              onPress={() => setPickerOpen(true)}
              className="flex-row items-center rounded-card border border-sport-200 bg-sport-100"
              style={{ gap: 14, padding: 16, marginBottom: 16 }}
            >
              <View
                className="items-center justify-center rounded-xl bg-sport-500"
                style={[{ width: 42, height: 42 }, SHADOWS[resolvedScheme].sm]}
              >
                <Share2 size={20} className="text-white" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="font-sans-extra text-strong" style={{ fontSize: 14.5 }}>
                  Comparte tu logro
                </Text>
                <Text className="font-sans text-muted" style={{ fontSize: 12.5 }} numberOfLines={1}>
                  Elige una tarjeta con la marca de tu coach
                </Text>
              </View>
              <ChevronRight size={18} className="text-sport-600" />
            </Pressable>

            {/* Apariencia — light/dark toggle */}
            <View>
              <SectionTitle>Apariencia</SectionTitle>
              <AppearanceToggle />
            </View>

            {/* Seguridad — biometric lock (only when device supports it) */}
            {bioAvailable ? (
              <View>
                <SectionTitle>Seguridad</SectionTitle>
                <Card padding="none">
                  <View className="flex-row items-center" style={{ gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
                    <IconTile Icon={Fingerprint} tone="sport" />
                    <Text className="font-sans-bold text-strong" style={{ flex: 1, fontSize: 15 }}>
                      Bloqueo con Face ID / huella
                    </Text>
                    <Switch value={bioEnabled} onValueChange={toggleBio} />
                  </View>
                </Card>
              </View>
            ) : null}

            {/* Preferencias — alarma de descanso del ejecutor (E4-19) */}
            <View testID="perfil-preferencias">
              <SectionTitle>Preferencias</SectionTitle>
              <RestAlarmPreference />
            </View>

            {/* Seguimiento — módulos de pago read-only del alumno (E6-11). Cada fila SOLO si el
                coach tiene el módulo activo; sin módulo NO se renderiza (cero superficie). */}
            {(showMovement || showBodyComp) ? (
              <View>
                <SectionTitle>Módulos</SectionTitle>
                <Card padding="none">
                  {showMovement ? (
                    <ListRow
                      testID="perfil-movimiento-row"
                      leading={<IconTile Icon={PersonStanding} tone="sport" />}
                      title="Movimiento"
                      subtitle="Screening · solo lectura"
                      showChevron
                      onPress={() => router.push('/alumno/movement')}
                    />
                  ) : null}
                  {showMovement && showBodyComp ? <RowDivider /> : null}
                  {showBodyComp ? (
                    <ListRow
                      testID="perfil-bodycomp-row"
                      leading={<IconTile Icon={Scale} tone="sport" />}
                      title="Composición"
                      subtitle="BIA / ISAK · solo lectura"
                      showChevron
                      onPress={() => router.push('/alumno/bodycomp')}
                    />
                  ) : null}
                </Card>
              </View>
            ) : null}

            {/* Información */}
            <View>
              <SectionTitle>Información</SectionTitle>
              <Card padding="none">
                {detail?.phone ? (
                  <InfoLine
                    label="Teléfono"
                    value={detail.phone}
                    last={detail.goalWeightKg == null && !detail.subscriptionStartDate}
                  />
                ) : null}
                {detail?.goalWeightKg != null ? (
                  <InfoLine
                    label="Peso objetivo"
                    value={`${detail.goalWeightKg} kg`}
                    last={!detail.subscriptionStartDate}
                  />
                ) : null}
                {detail?.subscriptionStartDate ? (
                  <InfoLine label="Miembro desde" value={formatDate(detail.subscriptionStartDate) ?? '-'} last />
                ) : null}
                {!hasExtras ? (
                  <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
                    <Text className="font-sans text-muted" style={{ fontSize: 14 }}>
                      Sin datos adicionales
                    </Text>
                  </View>
                ) : null}
              </Card>
            </View>

            {/* Cuenta */}
            <View>
              <SectionTitle>Cuenta</SectionTitle>
              <Card padding="none">
                <ListRow
                  testID="perfil-historial-row"
                  leading={<IconTile Icon={History} />}
                  title="Historial de entrenos"
                  showChevron
                  onPress={() => router.push('/alumno/history')}
                />
                <RowDivider />
                <ListRow
                  testID="perfil-cambiar-password-row"
                  leading={<IconTile Icon={KeyRound} tone="sport" />}
                  title="Cambiar contraseña"
                  showChevron
                  onPress={() => setShowPasswordModal(true)}
                />
                <RowDivider />
                <ListRow
                  testID="perfil-ayuda-row"
                  leading={<IconTile Icon={CircleHelp} />}
                  title="Ayuda"
                  showChevron
                  onPress={() => Linking.openURL(`mailto:${SALES_EMAIL}?subject=Ayuda`)}
                />
                <RowDivider />
                <ListRow
                  testID="perfil-logout-row"
                  leading={<IconTile Icon={LogOut} />}
                  title="Cerrar sesión"
                  showChevron
                  onPress={handleLogout}
                />
              </Card>
            </View>

            {/* Zona de peligro — baja de cuenta (derechos ARCO), 1:1 con web */}
            <View style={{ marginTop: 20 }}>
              <Text
                className="font-sans-extra text-danger-600"
                style={{ fontSize: 11, letterSpacing: 0.77, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 }}
              >
                Zona de peligro
              </Text>
              <Pressable
                testID="perfil-baja-cuenta"
                accessibilityRole="button"
                onPress={() => Linking.openURL('mailto:privacidad@eva-app.cl?subject=Solicitud%20de%20baja%20de%20cuenta')}
                className="flex-row items-center rounded-card border-danger-100 bg-surface-card"
                style={{ gap: 14, padding: 16, borderWidth: 1.5 }}
              >
                <View className="items-center justify-center rounded-xl bg-danger-100" style={{ width: 40, height: 40 }}>
                  <Trash2 size={20} className="text-danger-600" strokeWidth={2} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text className="font-sans-bold text-strong" style={{ fontSize: 14.5 }}>
                    Solicitar baja de cuenta
                  </Text>
                  <Text className="font-sans text-muted" style={{ fontSize: 12.5, marginTop: 1 }}>
                    Pide la eliminación de tus datos (derechos ARCO)
                  </Text>
                </View>
                <ChevronRight size={18} className="text-ink-300" />
              </Pressable>
            </View>

            {detail?.coachTier === 'free' && (
              <Text className="font-sans text-muted" style={{ fontSize: 11, textAlign: 'center', letterSpacing: 1.2, paddingVertical: 8, marginTop: 12 }}>
                Potenciado por EVA
              </Text>
            )}

            <Text className="font-sans text-muted" style={{ fontSize: 10, textAlign: 'center', marginTop: 4 }}>
              v1.2.0 · Hecho con ❤️ para tu progreso
            </Text>
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Selector de plantilla — Sheet EVA DS (no un dropdown pelado) */}
      <Sheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Comparte tu logro"
        description="Cada tarjeta lleva la marca de tu coach. Elige cuál compartir:"
        snapPoints={['56%']}
      >
        <View style={{ gap: 10 }}>
          <ShareOption
            Icon={TrendingUp}
            title="Progreso"
            subtitle="Tus entrenos totales y tu racha"
            tone="sport"
            testID="perfil-share-progress"
            onPress={() => pickShare('progress')}
          />
          <ShareOption
            Icon={Flame}
            title="Racha"
            subtitle={streakSubtitle}
            tone="ember"
            testID="perfil-share-streak"
            onPress={() => pickShare('streak')}
          />
          <ShareOption
            Icon={CalendarDays}
            title="Resumen mensual"
            subtitle={monthly ? `${monthly.monthLabel} · sesiones y volumen` : 'Tu mes en números'}
            tone="sport"
            testID="perfil-share-monthly"
            onPress={() => pickShare('monthly')}
          />
        </View>
      </Sheet>

      {/* Tarjetas compartibles (always-dark canvas, marca del coach). Contenido/copy = verbatim
          del canvas web (workout-pr-card-canvas.ts) y del texto compartido de los modales web. */}

      {/* Progreso — mirror de renderProgressCardToBlob (canvas:725-761). */}
      <ShareCardPreview
        visible={activeShare === 'progress'}
        onClose={() => setActiveShare(null)}
        variant="progress"
        shareMessage="Mi progreso 💪"
        fileName="mi-progreso"
      >
        <ShareCardEyebrow>MI PROGRESO</ShareCardEyebrow>
        <ShareCardTitle>{`Constancia con ${brandName}`}</ShareCardTitle>
        <ShareCardSubtitle>{firstName}</ShareCardSubtitle>
        <ShareCardHero value={String(stats.totalWorkouts)} unit={stats.totalWorkouts === 1 ? 'entreno' : 'entrenos'} />
        <ShareCardPill tone={stats.streak > 0 ? 'success' : 'neutral'}>
          {stats.streak > 0 ? `Racha · ${stats.streak} ${stats.streak === 1 ? 'día' : 'días'}` : 'Recién empezando'}
        </ShareCardPill>
        {/* Fecha (canvas:764-767) + pill del programa si hay (canvas:770-776). */}
        <ShareCardDate />
        {programName ? <ShareCardPill tone="neutral">{programName}</ShareCardPill> : null}
      </ShareCardPreview>

      {/* Racha — mirror de renderStreakCardToBlob (canvas:810-843). */}
      <ShareCardPreview
        visible={activeShare === 'streak'}
        onClose={() => setActiveShare(null)}
        variant="streak"
        shareMessage="Mi racha 🔥"
        fileName="mi-racha"
      >
        <ShareCardEyebrow>RACHA</ShareCardEyebrow>
        <ShareCardTitle>{stats.streak > 0 ? 'Racha encendida' : 'Enciende tu racha'}</ShareCardTitle>
        <ShareCardSubtitle>{firstName}</ShareCardSubtitle>
        <ShareCardHero value={String(stats.streak)} unit={stats.streak === 1 ? 'día' : 'días'} />
        <ShareCardPill tone={stats.streak > 0 ? 'ember' : 'neutral'}>
          {stats.streak > 0 ? 'seguidos activo' : 'Empieza hoy tu racha'}
        </ShareCardPill>
        {/* Pill del mes: "N entrenos este mes" (canvas:846-853, monthly.sessions ya cargado) + fecha (canvas:859). */}
        {(monthly?.sessions ?? 0) > 0 ? (
          <ShareCardPill tone="neutral">
            {`${monthly!.sessions} ${monthly!.sessions === 1 ? 'entreno' : 'entrenos'} este mes`}
          </ShareCardPill>
        ) : null}
        <ShareCardDate />
      </ShareCardPreview>

      {/* Resumen mensual — componente consolidado (eyebrow mes + subtítulo + hero + grid 3 tiles),
          alimentado con el recap ya cargado en load(). */}
      <MonthlySummaryShareCard
        visible={activeShare === 'monthly'}
        onClose={() => setActiveShare(null)}
        recap={monthly}
        firstName={firstName}
        streak={stats.streak}
      />

      {/* Cambiar contraseña — Dialog EVA DS */}
      <Dialog
        open={showPasswordModal}
        onClose={() => { setShowPasswordModal(false); setNewPassword('') }}
        title="Cambiar contraseña"
        maxWidth={400}
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Cancelar" variant="secondary" onPress={() => { setShowPasswordModal(false); setNewPassword('') }} style={{ flex: 1 }} />
            <Button label="Guardar" onPress={handleChangePassword} loading={changingPassword} style={{ flex: 1 }} />
          </View>
        }
      >
        <Input
          placeholder="Nueva contraseña (mín. 8 caracteres)"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoFocus
        />
      </Dialog>
    </View>
  )
}
