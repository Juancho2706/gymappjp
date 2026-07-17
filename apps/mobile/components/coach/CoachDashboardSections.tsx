import type { ReactNode } from 'react'
import { Linking, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { Image } from 'expo-image'
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bug,
  Calendar,
  CalendarClock,
  CalendarX,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Dumbbell,
  ExternalLink,
  Layers,
  LockKeyhole,
  Megaphone,
  Minus,
  Monitor,
  OctagonAlert,
  Palette,
  PartyPopper,
  Pin,
  Plus,
  Receipt,
  Rocket,
  Sparkles,
  Smartphone,
  Wrench,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  UserPlus,
  Upload,
  Users,
  Utensils,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react-native'
import Svg, { Circle as SvgCircle, Defs, LinearGradient as SvgLinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { CartesianChart, Area, Line, Bar, useChartPressState } from 'victory-native'
import { useFont, Circle, Text as SkiaText } from '@shopify/react-native-skia'
import { useDerivedValue, type SharedValue } from 'react-native-reanimated'
import { deriveSportTokens } from '@eva/brand-kit'
import { useTheme } from '../../context/ThemeContext'
import type {
  MobileActivityItem,
  MobileAgendaItem,
  MobileChartPoint,
  MobileClientPaymentSummary,
  MobileClientStats,
  MobileExpiringProgramItem,
  MobileKpiSummary,
  MobileRiskAlertItem,
} from '../../lib/coach-dashboard'
import type { CoachProfile } from '../../lib/coach'
import { getRecommendedTier, TIER_CONFIG } from '../../lib/coach-tiers'
import { canUseNutrition } from '../../lib/coach-tiers'
import { NativeDialog } from '../NativeDialog'
import { Sheet } from '../Sheet'
import { Button } from '../Button'
import { Card } from '../Card'
import { StatCard } from '../StatCard'
import { Avatar } from '../Avatar'
import { Badge } from '../Badge'
import { ListRow } from '../ListRow'
import { SegmentedTabs } from '../SegmentedTabs'
import { NavIconRN } from '../NavIconRN'
import { useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiFetch, getApiBaseUrl } from '../../lib/api'
import { getCoachNews, markCoachNewsRead, type CoachNewsItem } from '../../lib/coach-news'
import { FONT } from '../../lib/typography'
import { shadow } from '../../lib/shadows'
import { useWorkspace } from '../../lib/workspace'
import { WorkspaceSwitcherSheet } from './WorkspaceSwitcherSheet'
import { AnimatedNumber } from '../AnimatedNumber'

const WARNING_500 = '#F5A524' // --warning-500

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(0,122,255,${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(n)
}

/**
 * Fondo glass de una card (1:1 con la GlassCard web: `bg-black/40 backdrop-blur-xl`).
 * BlurView difumina lo que hay detrás (= backdrop-filter) + velo (negro/blanco) +
 * tono opcional diagonal (como `from-{tone}/20 to-transparent` de NextBestAction).
 * Se monta como PRIMER hijo de la card (la card debe tener bg transparent + overflow hidden).
 */
function CardGlass({ tone }: { tone?: string }) {
  const { mode } = useTheme()
  const isDark = mode !== 'light'
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={isDark ? 22 : 40}
        tint={isDark ? 'dark' : 'light'}
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      {/* Velo: web dark = bg-black/40, light = bg-white/70 */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(12,12,14,0.40)' : 'rgba(255,255,255,0.62)' }]} />
      {/* Tono propio (NextBestAction): gradiente diagonal toneColor → transparente */}
      {tone ? (
        <LinearGradient
          colors={[hexToRgba(tone, isDark ? 0.2 : 0.16), 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  )
}

export function MobileBillingBanners({ coach, activeClientCount }: { coach: CoachProfile; activeClientCount: number }) {
  const nowMs = Date.now()
  const currentPeriodEndMs = coach.currentPeriodEnd ? new Date(coach.currentPeriodEnd).getTime() : null
  const trialEndsAtMs = coach.trialEndsAt ? new Date(coach.trialEndsAt).getTime() : null
  const canceledGrace =
    coach.subscriptionStatus === 'canceled' &&
    currentPeriodEndMs != null &&
    currentPeriodEndMs > nowMs
  const blocked =
    coach.subscriptionStatus === 'canceled' &&
    currentPeriodEndMs != null &&
    currentPeriodEndMs <= nowMs
  const trialActive = trialEndsAtMs != null && trialEndsAtMs > nowMs

  if (blocked) {
    return (
      <MobileBanner tone="danger" icon={TriangleAlert} actionLabel="Reactivar" onPress={() => openCoachWebPath('/coach/subscription')}>
        <Text>Tu suscripcion esta cancelada. Reactiva para recuperar acceso.</Text>
      </MobileBanner>
    )
  }

  if (canceledGrace) {
    const days = Math.max(0, Math.ceil(((currentPeriodEndMs ?? nowMs) - nowMs) / 86400000))
    const showRec = days <= 7 && activeClientCount > 0
    const recTier = showRec ? getRecommendedTier(activeClientCount) : null
    const recConfig = recTier ? TIER_CONFIG[recTier] : null
    return (
      <MobileBanner
        tone="warn"
        icon={Clock}
        actionLabel={showRec && recConfig ? `Activar ${recConfig.label}` : 'Renovar'}
        onPress={() => openCoachWebPath(showRec && recTier ? `/coach/reactivate?tier=${recTier}` : '/coach/subscription')}
      >
        <Text>
          Cancelaste tu plan. Acceso hasta por {days} dia{days === 1 ? '' : 's'}.
        </Text>
        {showRec && recConfig ? (
          <Text>
            Con {activeClientCount} alumnos: Plan {recConfig.label} (hasta {recConfig.maxClients}) ·
          </Text>
        ) : null}
      </MobileBanner>
    )
  }

  if (trialActive) {
    const days = Math.max(0, Math.ceil(((trialEndsAtMs ?? nowMs) - nowMs) / 86400000))
    const showRec = days <= 7 && activeClientCount > 0
    const recTier = showRec ? getRecommendedTier(activeClientCount) : null
    const recConfig = recTier ? TIER_CONFIG[recTier] : null
    return (
      <MobileBanner
        tone="info"
        icon={Clock}
        actionLabel={showRec && recConfig ? `Activar ${recConfig.label}` : 'Activar plan'}
        onPress={() => openCoachWebPath(showRec && recTier ? `/coach/reactivate?tier=${recTier}` : '/coach/subscription')}
      >
        <Text>
          Periodo de prueba · {days} dia{days === 1 ? '' : 's'} restantes.
        </Text>
        {showRec && recConfig ? (
          <Text>
            Con {activeClientCount} alumnos: Plan {recConfig.label} (hasta {recConfig.maxClients}) ·
          </Text>
        ) : null}
      </MobileBanner>
    )
  }

  return null
}

function openCoachWebPath(path: string) {
  Linking.openURL(`${getApiBaseUrl()}${path}`).catch(() => null)
}

export function MobileTierUsageBanners({ coach, totalClients }: { coach: CoachProfile; totalClients: number }) {
  return (
    <View style={styles.tierStack}>
      {coach.subscriptionTier === 'free' ? <MobileFreeTierBanner totalClients={totalClients} /> : null}
      {/* Plan 04: umbral 80 (~80% del techo elite nuevo 100, mismo momento Head-of-Sales que el 48/60 anterior). */}
      {coach.subscriptionTier === 'elite' && totalClients >= 80 ? <MobileTeamsBridgeBanner totalClients={totalClients} /> : null}
    </View>
  )
}

function MobileFreeTierBanner({ totalClients }: { totalClients: number }) {
  const { theme, resolvedScheme } = useTheme()
  const max = TIER_CONFIG.free.maxClients
  const used = Math.min(totalClients, max)
  const pct = Math.round((used / max) * 100)
  const full = used >= max

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => openCoachWebPath('/coach/subscription')}
      style={[
        styles.tierBanner,
        {
          borderColor: full ? hexToRgba(WARNING_500, 0.3) : theme.border,
          backgroundColor: full
            ? (resolvedScheme === 'dark' ? 'rgba(245,165,36,0.18)' : '#FDEFD3')
            : theme.card,
          borderRadius: theme.radius.xl,
        },
      ]}
    >
      <View style={styles.tierMain}>
        <Text style={[styles.tierTitle, { color: theme.foreground, fontFamily: FONT.uiBold }]}>
          {used}/{max} alumnos · Plan gratuito
        </Text>
        <View className="bg-track" style={styles.usageTrack}>
          <View
            style={[
              styles.usageFill,
              {
                width: `${pct}%`,
                backgroundColor: full ? WARNING_500 : theme.success,
              },
            ]}
          />
        </View>
      </View>
      <Text style={[styles.tierAction, { color: theme.primary, fontFamily: FONT.uiBold }]}>
        {full ? 'Expandir límite →' : 'Ver planes →'}
      </Text>
    </TouchableOpacity>
  )
}

// Plan 04 (espejo del TeamsBridgeBanner web): el plan Growth salió de la venta.
// Coach con cartera grande → puente a EVA Teams, NO upsell a un tier muerto.
// Sin precios (pre-cierre Movida); CTA = mailto contacto@eva-app.cl. Muere el ?upgrade=growth.
function MobileTeamsBridgeBanner({ totalClients }: { totalClients: number }) {
  const { theme, resolvedScheme } = useTheme()
  const max = TIER_CONFIG.elite.maxClients
  const pct = Math.round((Math.min(totalClients, max) / max) * 100)

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() =>
        Linking.openURL(
          'mailto:contacto@eva-app.cl?subject=' + encodeURIComponent('Quiero conocer EVA Teams')
        ).catch(() => null)
      }
      style={[
        styles.tierBanner,
        {
          borderColor: hexToRgba(theme.success, 0.3),
          backgroundColor: resolvedScheme === 'dark' ? 'rgba(31,184,119,0.18)' : '#DBF5EA',
          borderRadius: theme.radius.xl,
        },
      ]}
    >
      <View style={[styles.tierMain, { gap: 2 }]}>
        <Text style={[styles.tierTitle, { color: theme.foreground, fontFamily: FONT.uiBold }]}>
          {totalClients}/{max} alumnos · {pct}% de tu plan Elite
        </Text>
        <Text style={[styles.tierSubtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          ¿Más de 100 alumnos o trabajas con otros profesionales? Conoce EVA Teams
        </Text>
      </View>
      <Text style={[styles.tierAction, { color: resolvedScheme === 'dark' ? '#4FD9A0' : '#0F7D50', fontFamily: FONT.uiBold }]}>
        Conversemos →
      </Text>
    </TouchableOpacity>
  )
}

function MobileBanner({
  tone,
  icon: Icon,
  children,
  actionLabel,
  onPress,
}: {
  tone: 'info' | 'warn' | 'danger'
  icon: LucideIcon
  children: ReactNode
  actionLabel: string
  onPress?: () => void
}) {
  const { theme, resolvedScheme } = useTheme()
  const dark = resolvedScheme === 'dark'
  const sport = deriveSportTokens(theme.primary)
  const palette = tone === 'danger'
    ? { border: theme.destructive, background: dark ? 'rgba(244,54,90,0.18)' : '#FCDDE4', foreground: dark ? '#FF9CB0' : '#A8163A' }
    : tone === 'warn'
      ? { border: WARNING_500, background: dark ? 'rgba(245,165,36,0.18)' : '#FDEFD3', foreground: dark ? '#FFD489' : '#8F5A05' }
      : { border: theme.primary, background: dark ? hexToRgba(theme.primary, 0.2) : sport.ramp['100'], foreground: dark ? sport.dark['700'] : sport.ramp['700'] }
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      onPress={onPress}
      accessibilityRole="link"
      style={[
        styles.banner,
        {
          borderColor: hexToRgba(palette.border, 0.3),
          backgroundColor: palette.background,
          borderRadius: theme.radius.xl,
        },
      ]}
    >
      <Icon size={16} color={palette.foreground} strokeWidth={2} />
      <View style={styles.bannerCopy}>
        <Text style={[styles.bannerText, { color: palette.foreground, fontFamily: theme.fontSans }]}>
          {children}
        </Text>
        <Text style={[styles.bannerAction, { color: palette.foreground, fontFamily: FONT.uiBold }]}>{actionLabel}</Text>
      </View>
    </TouchableOpacity>
  )
}

function formatDateES(isoDate: string): string {
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const d = new Date(isoDate)
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export function MobilePublicCodeRequiredModal({
  inviteCode,
  visible,
  onConfirmed,
}: {
  inviteCode: string
  visible: boolean
  onConfirmed: () => void
}) {
  const { theme } = useTheme()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const studentPath = `/c/${inviteCode}/login`
  const studentUrl = `${getApiBaseUrl()}${studentPath}`

  async function confirm() {
    setPending(true)
    setError(null)
    try {
      await apiFetch<{ ok: true }>('/api/mobile/coach/dashboard', {
        method: 'POST',
        authenticated: true,
        body: { action: 'confirm_public_code' },
      })
      onConfirmed()
    } catch {
      setError('No se pudo confirmar el codigo. Intenta de nuevo.')
    } finally {
      setPending(false)
    }
  }

  async function copyLink() {
    setCopied(false)
    await Clipboard.setStringAsync(studentUrl)
    setCopied(true)
  }

  async function shareLink() {
    await Share.share({
      message: `Acceso alumnos EVA: ${studentUrl}`,
      url: studentUrl,
    })
  }

  return (
    <NativeDialog open={visible} onClose={() => {}} title="Tu link de alumnos cambio" showClose={false}>
      <View style={styles.publicCodeModal}>
        <View style={styles.publicCodeIntro}>
          <View style={[styles.publicCodeIcon, { backgroundColor: theme.primary + '1A' }]}>
            <LockKeyhole size={22} color={theme.primary} />
          </View>
          <Text style={[styles.placeholderText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Este cambio mejora el acceso movil y evita errores al compartir links. Tu slug anterior seguira funcionando como respaldo.
          </Text>
        </View>

        <View style={[styles.publicCodeBox, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.xl }]}>
          <Text style={[styles.formLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
            NUEVO ACCESO ALUMNOS
          </Text>
          <View style={styles.publicCodeRow}>
            <Text style={[styles.publicCodeValue, { color: theme.foreground, fontFamily: FONT.uiSemibold }]} numberOfLines={1}>
              {studentPath}
            </Text>
            <TouchableOpacity activeOpacity={0.78} onPress={copyLink} style={styles.publicCodeCopy}>
              <Copy size={14} color={theme.primary} />
              <Text style={[styles.publicCodeCopyText, { color: theme.primary, fontFamily: FONT.uiBold }]}>
                {copied ? 'Copiado' : 'Copiar'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {error ? (
          <Text style={[styles.formErrorText, { color: theme.destructive, fontFamily: FONT.uiSemibold }]}>
            {error}
          </Text>
        ) : null}

        <View style={styles.publicCodeActions}>
          <Button label="Compartir link" variant="secondary" onPress={shareLink} style={styles.formButton} />
          <Button label={pending ? 'Confirmando...' : 'Entendido'} onPress={confirm} disabled={pending} style={styles.formButton} />
        </View>
      </View>
    </NativeDialog>
  )
}

const FREE_WELCOME_KEY = 'eva_free_welcome_seen'

export function MobileFreeWelcomeModal({ enabled }: { enabled: boolean }) {
  const { theme, resolvedScheme } = useTheme()
  const [open, setOpen] = useState(false)
  const dark = resolvedScheme === 'dark'
  const sport = deriveSportTokens(theme.primary)
  const sport100 = dark ? hexToRgba(theme.primary, 0.2) : sport.ramp['100']
  const sport600 = dark ? sport.dark['600'] : sport.ramp['600']
  const ember100 = dark ? 'rgba(255,106,61,0.20)' : '#FFEDE6'
  const ember700 = dark ? '#FFB79E' : '#C23E14'
  const success100 = dark ? 'rgba(31,184,119,0.18)' : '#DBF5EA'
  const success600 = dark ? '#4FD9A0' : '#0F7D50'

  useEffect(() => {
    if (!enabled) return
    let mounted = true
    AsyncStorage.getItem(FREE_WELCOME_KEY).then((seen) => {
      if (mounted && !seen) setOpen(true)
    })
    return () => {
      mounted = false
    }
  }, [enabled])

  async function dismiss() {
    await AsyncStorage.setItem(FREE_WELCOME_KEY, '1')
    setOpen(false)
  }

  return (
    <NativeDialog open={open} onClose={dismiss} maxWidth={390}>
      <View style={styles.freeWelcome}>
        <LinearGradient
          colors={[sport100, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.freeWelcomeHero, { borderBottomColor: theme.border }]}
        >
          <View style={[styles.freeWelcomeIcon, { borderColor: hexToRgba(theme.primary, 0.3), backgroundColor: sport100, borderRadius: theme.radius.md }]}>
            <Sparkles size={32} color={sport600} />
          </View>
          <Text style={[styles.freeWelcomeTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]}>
            ¡Bienvenido a EVA!
          </Text>
          <Text style={[styles.freeWelcomeSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Tu plan gratuito está activo. Puedes empezar ahora mismo.
          </Text>
        </LinearGradient>

        <View style={styles.freeWelcomeSection}>
          <Text style={[styles.freeWelcomeEyebrow, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
            PRIMEROS PASOS
          </Text>
          <WelcomeStep icon={Users} color={sport600} backgroundColor={sport100} title="Agrega tu primer alumno" subtitle="Hasta 3 alumnos en el plan Free" />
          <WelcomeStep icon={Zap} color={ember700} backgroundColor={ember100} title="Crea tu primera rutina" subtitle="Constructor de programas sin límites" />
          <WelcomeStep icon={Palette} color={success600} backgroundColor={success100} title="Personaliza tu app con Pro" subtitle="Tu logo y colores desde $29.990/mes" />
        </View>

        <View style={styles.freeWelcomeSection}>
          <Text style={[styles.freeWelcomeEyebrow, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
            TU PLAN FREE INCLUYE
          </Text>
          <View style={styles.freePlanGrid}>
            {[
              { ok: true, text: '3 alumnos activos' },
              { ok: true, text: 'Entrenos ilimitados' },
              { ok: true, text: 'App para tus alumnos' },
              { ok: true, text: 'Check-ins' },
              { ok: false, text: 'Marca personalizada' },
              { ok: false, text: 'Nutrición' },
            ].map((item) => (
              <View key={item.text} style={styles.freePlanItem}>
                {item.ok ? (
                  <CheckCircle2 size={14} color="#10B981" />
                ) : (
                  <XCircle size={14} color={theme.mutedForeground} opacity={0.45} />
                )}
                <Text
                  style={[
                    styles.freePlanText,
                    {
                      color: item.ok ? theme.mutedForeground : theme.mutedForeground,
                      opacity: item.ok ? 1 : 0.55,
                      fontFamily: theme.fontSans,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {item.text}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.freeWelcomeActions}>
          <Button label="Empezar ahora →" variant="sport" onPress={dismiss} full />
          <Button
            label="Ver todos los planes"
            variant="ghost"
            size="sm"
            onPress={() => {
              dismiss()
              openCoachWebPath('/coach/subscription')
            }}
            full
          />
        </View>
      </View>
    </NativeDialog>
  )
}

function WelcomeStep({
  icon: Icon,
  color,
  backgroundColor,
  title,
  subtitle,
}: {
  icon: LucideIcon
  color: string
  backgroundColor: string
  title: string
  subtitle: string
}) {
  const { theme } = useTheme()
  return (
    <View style={styles.welcomeStep}>
      <View style={[styles.welcomeStepIcon, { backgroundColor }]}>
        <Icon size={16} color={color} />
      </View>
      <View style={styles.welcomeStepCopy}>
        <Text style={[styles.welcomeStepTitle, { color: theme.foreground, fontFamily: FONT.uiBold }]}>
          {title}
        </Text>
        <Text style={[styles.welcomeStepSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          {subtitle}
        </Text>
      </View>
    </View>
  )
}

type OnboardingStepKey = 'profile_branding' | 'first_client' | 'first_plan' | 'first_checkin'
type OnboardingGuideState = {
  completed: Partial<Record<OnboardingStepKey, boolean>>
  dismissed?: boolean
  ahaMomentSent?: boolean
}

function onboardingGuideStorageKey(coachId: string) {
  return `eva:coach-onboarding:v1:${coachId}`
}

function normalizeOnboardingGuide(raw: Record<string, unknown> | null | undefined): OnboardingGuideState {
  if (!raw || typeof raw !== 'object') return { completed: {} }
  const completedRaw = raw.completed
  const completed: Partial<Record<OnboardingStepKey, boolean>> = {}
  if (completedRaw && typeof completedRaw === 'object' && !Array.isArray(completedRaw)) {
    const src = completedRaw as Record<string, unknown>
    ;(['profile_branding', 'first_client', 'first_plan', 'first_checkin'] as OnboardingStepKey[]).forEach((key) => {
      if (typeof src[key] === 'boolean') completed[key] = src[key] as boolean
    })
  }
  return {
    completed,
    dismissed: raw.dismissed === true,
    ahaMomentSent: raw.ahaMomentSent === true,
  }
}

function stateHasOnboardingActivity(state: OnboardingGuideState) {
  return Boolean(state.dismissed || state.ahaMomentSent || Object.keys(state.completed ?? {}).length > 0)
}

function postMobileOnboardingEvent(
  stepKey: OnboardingStepKey,
  eventType: 'step_completed' | 'step_reopened' | 'aha_moment' | 'guide_engagement',
  metadata?: Record<string, string | number | boolean>
) {
  apiFetch<{ ok: true }>('/api/mobile/coach/dashboard', {
    method: 'POST',
    authenticated: true,
    body: {
      action: 'onboarding_event',
      stepKey,
      eventType,
      metadata,
    },
  }).catch(() => null)
}

export function MobileOnboardingChecklist({
  coach,
  publicInviteCode,
  initialOnboardingGuide,
  totalClients,
  activePlans,
  hasStudentSignal30d,
}: {
  coach: CoachProfile
  publicInviteCode?: string | null
  initialOnboardingGuide: Record<string, unknown>
  totalClients: number
  activePlans: number
  hasStudentSignal30d: boolean
}) {
  const router = useRouter()
  const { theme } = useTheme()
  const glass = useGlassStyle()
  const [ready, setReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [manualCompleted, setManualCompleted] = useState<Partial<Record<OnboardingStepKey, boolean>>>({})
  const previousCompletedRef = useRef<Partial<Record<OnboardingStepKey, boolean>>>({})
  const ahaSentRef = useRef(false)
  const isFree = coach.subscriptionTier === 'free'
  const studentPath = `/c/${publicInviteCode || coach.slug}/login`

  useEffect(() => {
    let mounted = true
    async function hydrate() {
      const serverState = normalizeOnboardingGuide(initialOnboardingGuide)
      const localRaw = await AsyncStorage.getItem(onboardingGuideStorageKey(coach.id)).catch(() => null)
      const localState = localRaw ? normalizeOnboardingGuide(JSON.parse(localRaw) as Record<string, unknown>) : { completed: {} }
      const source = stateHasOnboardingActivity(serverState) ? serverState : localState
      if (!mounted) return
      setManualCompleted(source.completed ?? {})
      setDismissed(Boolean(source.dismissed))
      previousCompletedRef.current = source.completed ?? {}
      ahaSentRef.current = Boolean(source.ahaMomentSent)
      setReady(true)
    }
    hydrate().catch(() => {
      if (mounted) setReady(true)
    })
    return () => {
      mounted = false
    }
  }, [coach.id, initialOnboardingGuide])

  const autoCompleted = {
    profile_branding: Boolean(coach.hasCoachLogo),
    first_client: totalClients > 0,
    first_plan: activePlans > 0,
    first_checkin: hasStudentSignal30d,
  }

  const completed: Record<OnboardingStepKey, boolean> = {
    profile_branding:
      manualCompleted.profile_branding === false
        ? false
        : autoCompleted.profile_branding || manualCompleted.profile_branding === true,
    first_client: autoCompleted.first_client || manualCompleted.first_client === true,
    first_plan: autoCompleted.first_plan || manualCompleted.first_plan === true,
    first_checkin: autoCompleted.first_checkin || manualCompleted.first_checkin === true,
  }
  const completedCount = Object.values(completed).filter(Boolean).length
  const progressPct = Math.round((completedCount / 4) * 100)
  const allDone = completedCount === 4

  useEffect(() => {
    if (!ready) return
    const previous = previousCompletedRef.current
    ;(['profile_branding', 'first_client', 'first_plan', 'first_checkin'] as OnboardingStepKey[]).forEach((key) => {
      const beforeDone = Boolean(previous[key])
      const nowDone = Boolean(completed[key])
      if (!beforeDone && nowDone) {
        postMobileOnboardingEvent(key, 'step_completed', { progressPct })
      } else if (beforeDone && !nowDone) {
        postMobileOnboardingEvent(key, 'step_reopened', { progressPct })
      }
    })

    if (allDone && !ahaSentRef.current) {
      ahaSentRef.current = true
      postMobileOnboardingEvent('first_checkin', 'aha_moment', { progressPct: 100 })
      persist({ completed: manualCompleted, dismissed, ahaMomentSent: true })
    }

    previousCompletedRef.current = completed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, progressPct, allDone, completed.profile_branding, completed.first_client, completed.first_plan, completed.first_checkin])

  async function persist(next: OnboardingGuideState) {
    await AsyncStorage.setItem(onboardingGuideStorageKey(coach.id), JSON.stringify(next)).catch(() => null)
    apiFetch<{ ok: true }>('/api/mobile/coach/dashboard', {
      method: 'POST',
      authenticated: true,
      body: { action: 'persist_onboarding_guide', guide: next },
    }).catch(() => null)
  }

  function updateManual(nextCompleted: Partial<Record<OnboardingStepKey, boolean>>, nextDismissed = dismissed) {
    setManualCompleted(nextCompleted)
    setDismissed(nextDismissed)
    persist({
      completed: nextCompleted,
      dismissed: nextDismissed,
      ahaMomentSent: allDone || progressPct === 100,
    })
  }

  function toggleBrandStep() {
    const autoBranding = Boolean(coach.hasCoachLogo)
    const currentlyDone =
      manualCompleted.profile_branding === false
        ? false
        : autoBranding || manualCompleted.profile_branding === true
    updateManual({
      ...manualCompleted,
      profile_branding: currentlyDone ? false : true,
    })
  }

  function dismiss() {
    postMobileOnboardingEvent('profile_branding', 'guide_engagement', {
      widget: 'onboarding_checklist',
      action: 'dismiss_confirm',
      progress_pct: progressPct,
      all_done: allDone,
    })
    persist({ completed: manualCompleted, dismissed: true, ahaMomentSent: allDone })
    setDismissed(true)
  }

  function resumeGuide() {
    persist({ completed: manualCompleted, dismissed: false, ahaMomentSent: allDone })
    setDismissed(false)
  }

  if (!ready) {
    return (
      <View style={[styles.onboardingSkeleton, { borderColor: theme.border, backgroundColor: theme.muted, borderRadius: theme.radius.xl }]} />
    )
  }

  if (dismissed && allDone) return null

  if (dismissed && !allDone) {
    return (
      <View style={[styles.onboardingResume, glass, { borderRadius: theme.radius.xl }]}>
        <CardGlass />
        <Text style={[styles.onboardingResumeText, { color: theme.foreground, fontFamily: FONT.uiSemibold }]}>
          Sigues con pasos pendientes en tu guia de inicio.
        </Text>
        <Button label="Continuar guia" size="sm" onPress={resumeGuide} />
      </View>
    )
  }

  return (
    <View style={[styles.onboardingCard, glass, { borderRadius: theme.radius.xl }]}>
      <CardGlass />
      <View style={styles.onboardingHeader}>
        <View style={styles.onboardingHeaderCopy}>
          <Text style={[styles.eyebrow, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
            TU RUTA EN EVA
          </Text>
          <Text style={[styles.onboardingTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]}>
            Pon tu estudio en marcha
          </Text>
          <Text style={[styles.onboardingDescription, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Cuatro pasos para cerrar el circuito: marca, alumno, plan y senal de uso.
          </Text>
        </View>
        <View style={styles.onboardingProgressBox}>
          <Text style={[styles.onboardingProgressValue, { color: theme.primary, fontFamily: FONT.displayBold }]}>
            {progressPct}%
          </Text>
          <Text style={[styles.onboardingProgressLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
            COMPLETADO
          </Text>
          <TouchableOpacity activeOpacity={0.8} onPress={dismiss} style={styles.skipGuideButton}>
            <XCircle size={13} color="#FFFFFF" />
            <Text style={styles.skipGuideText}>Saltar guia</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isFree ? <MobileOnboardingFreePlan /> : null}
      {!allDone ? <MobileOnboardingLoopStrip /> : null}
      <MobileOnboardingTwinPanels
        studentPath={studentPath}
        onOpenPreview={() => router.push('/coach/settings/brand')}
        onOpenStudentApp={() => Linking.openURL(`${getApiBaseUrl()}${studentPath}`).catch(() => null)}
      />

      <View style={[styles.onboardingTrack, { backgroundColor: theme.muted }]}>
        <View style={[styles.onboardingFill, { width: `${progressPct}%`, backgroundColor: theme.primary }]} />
      </View>

      {!allDone ? <MobileOnboardingCarousel completed={completed} /> : null}

      <View style={styles.onboardingSteps}>
        <MobileOnboardingStepBlock
          title="1. Tu marca en la app del alumno"
          description={isFree
            ? 'Disponible desde Starter. Puedes marcarlo como visto o subir de plan para personalizar logo, color y mensajes.'
            : 'Logo, color y mensajes: lo que ves en Mi Marca es lo que ellos ven al instalar tu espacio.'}
          done={completed.profile_branding}
          actions={isFree ? (
            <>
              <Button label="Desbloquear con Starter" size="sm" onPress={() => openCoachWebPath('/coach/subscription')} style={styles.stepButton} />
              <Button label={completed.profile_branding ? 'Desmarcar paso' : 'Marcar como visto'} variant="ghost" size="sm" onPress={toggleBrandStep} style={styles.stepButton} />
            </>
          ) : (
            <>
              <Button label="Ir a Mi Marca" size="sm" onPress={() => router.push('/coach/settings/brand')} style={styles.stepButton} />
              <Button label={completed.profile_branding ? 'Desmarcar paso' : 'Ya lo deje listo'} variant="ghost" size="sm" onPress={toggleBrandStep} style={styles.stepButton} />
            </>
          )}
        />
        <MobileOnboardingStepBlock
          title="2. Primer alumno"
          description="Crea o importa al menos un perfil para poder asignarle un plan."
          done={completed.first_client}
          actions={<Button label="Ir a alumnos" variant="secondary" size="sm" onPress={() => router.push('/coach/(tabs)/clientes')} style={styles.stepButton} />}
        />
        <MobileOnboardingStepBlock
          title="3. Primer plan asignado"
          description="Desde programas o el constructor: activa un plan para ese alumno."
          done={completed.first_plan}
          actions={<Button label="Abrir constructor" variant="secondary" size="sm" onPress={() => router.push('/coach/(tabs)/builder')} style={styles.stepButton} />}
        />
        <MobileOnboardingStepBlock
          title="4. Tu alumno ya uso la app"
          description="Se marca listo si en los ultimos 30 dias hay al menos un check-in o un registro de entreno."
          done={completed.first_checkin}
          actions={<Button label="Ver alumnos" variant="secondary" size="sm" onPress={() => router.push('/coach/(tabs)/clientes')} style={styles.stepButton} />}
        />
      </View>

      <MobileNutritionTierBlock subscriptionTier={coach.subscriptionTier} />

      {allDone ? (
        <View style={[styles.activationReady, { borderColor: 'rgba(16,185,129,0.32)', backgroundColor: 'rgba(16,185,129,0.1)' }]}>
          <Sparkles size={17} color="#10B981" />
          <View style={styles.activationCopy}>
            <Text style={[styles.activationTitle, { color: '#10B981', fontFamily: FONT.uiBold }]}>
              Activacion lista
            </Text>
            <Text style={[styles.activationText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Completaste el circuito minimo: marca, alumno, plan y senal de uso.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}

function MobileOnboardingFreePlan() {
  const { theme } = useTheme()
  const items = [
    { ok: true, text: '3 alumnos activos' },
    { ok: true, text: 'Entrenos ilimitados' },
    { ok: true, text: 'App para tus alumnos' },
    { ok: true, text: 'Check-ins' },
    { ok: false, text: 'Marca personalizada' },
    { ok: false, text: 'Nutricion' },
  ]
  return (
    <View style={[styles.onboardingFreeBox, { borderColor: hexToRgba(theme.primary, 0.2), backgroundColor: hexToRgba(theme.primary, 0.06), borderRadius: theme.radius.xl }]}>
      <Text style={[styles.onboardingFreeTitle, { color: theme.foreground, fontFamily: FONT.uiBold }]}>
        Plan Free - lo que tienes incluido:
      </Text>
      <View style={styles.freePlanGrid}>
        {items.map((item) => (
          <View key={item.text} style={styles.freePlanItem}>
            {item.ok ? <CheckCircle2 size={14} color="#10B981" /> : <XCircle size={14} color={theme.mutedForeground} opacity={0.45} />}
            <Text style={[styles.freePlanText, { color: theme.mutedForeground, opacity: item.ok ? 1 : 0.6, fontFamily: theme.fontSans }]} numberOfLines={1}>
              {item.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function MobileOnboardingLoopStrip() {
  const { theme } = useTheme()
  return (
    <View style={[styles.loopStrip, { borderColor: theme.border, backgroundColor: theme.muted, borderRadius: theme.radius.xl }]}>
      {[
        { icon: Palette, label: 'Marca' },
        { icon: Users, label: 'Alumno' },
        { icon: Layers, label: 'Plan' },
        { icon: Activity, label: 'Uso' },
      ].map((item, index) => {
        const Icon = item.icon
        return (
          <View key={item.label} style={styles.loopStep}>
            <View style={[styles.loopIcon, { backgroundColor: index === 0 ? hexToRgba(theme.primary, 0.14) : theme.card }]}>
              <Icon size={15} color={index === 0 ? theme.primary : theme.mutedForeground} />
            </View>
            <Text style={[styles.loopLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>{item.label}</Text>
          </View>
        )
      })}
    </View>
  )
}

function MobileOnboardingTwinPanels({
  studentPath,
  onOpenPreview,
  onOpenStudentApp,
}: {
  studentPath: string
  onOpenPreview: () => void
  onOpenStudentApp: () => void
}) {
  const { theme } = useTheme()
  return (
    <View style={styles.twinPanels}>
      <View style={[styles.twinPanel, { borderColor: theme.border, backgroundColor: theme.muted, borderRadius: theme.radius.xl }]}>
        <View style={styles.twinTitleRow}>
          <Monitor size={15} color={theme.primary} />
          <Text style={[styles.twinTitle, { color: theme.foreground, fontFamily: FONT.uiBold }]}>Tu panel</Text>
        </View>
        <Text style={[styles.twinText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Sumas alumnos, armas programas y asignas planes desde tu app de coach.
        </Text>
      </View>
      <View style={[styles.twinPanel, { borderColor: theme.border, backgroundColor: hexToRgba(theme.primary, 0.08), borderRadius: theme.radius.xl }]}>
        <View style={styles.twinTitleRow}>
          <Smartphone size={15} color={theme.primary} />
          <Text style={[styles.twinTitle, { color: theme.foreground, fontFamily: FONT.uiBold }]}>Tu alumno</Text>
        </View>
        <Text style={[styles.twinText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Entra a {studentPath}, ve su plan y registra entrenos o check-ins.
        </Text>
        <View style={styles.twinActions}>
          <Button label="Vista previa" variant="secondary" size="sm" onPress={onOpenPreview} style={styles.twinButton} />
          <Button label="Abrir app" variant="outline" size="sm" rightIcon={ExternalLink} onPress={onOpenStudentApp} style={styles.twinButton} />
        </View>
      </View>
    </View>
  )
}

function MobileOnboardingCarousel({ completed }: { completed: Record<OnboardingStepKey, boolean> }) {
  const { theme } = useTheme()
  const steps: Array<{ key: OnboardingStepKey; title: string; icon: LucideIcon }> = [
    { key: 'profile_branding', title: 'Marca', icon: Palette },
    { key: 'first_client', title: 'Alumno', icon: Users },
    { key: 'first_plan', title: 'Plan', icon: Layers },
    { key: 'first_checkin', title: 'Uso', icon: Activity },
  ]
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.onboardingCarousel}>
      {steps.map((step, index) => {
        const Icon = step.icon
        const done = completed[step.key]
        return (
          <View key={step.key} style={[styles.carouselCard, { borderColor: done ? 'rgba(16,185,129,0.36)' : theme.border, backgroundColor: done ? 'rgba(16,185,129,0.1)' : theme.muted, borderRadius: theme.radius.xl }]}>
            <View style={styles.carouselTop}>
              <Icon size={16} color={done ? '#10B981' : theme.primary} />
              {done ? <CheckCircle2 size={15} color="#10B981" /> : null}
            </View>
            <Text style={[styles.carouselStep, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>PASO {index + 1}</Text>
            <Text style={[styles.carouselTitle, { color: theme.foreground, fontFamily: FONT.uiBold }]}>{step.title}</Text>
          </View>
        )
      })}
    </ScrollView>
  )
}

function MobileOnboardingStepBlock({
  title,
  description,
  done,
  actions,
}: {
  title: string
  description: string
  done: boolean
  actions: ReactNode
}) {
  const { theme } = useTheme()
  return (
    <View style={[styles.stepBlock, { borderColor: theme.border, backgroundColor: theme.card === '#FFFFFF' ? 'rgba(255,255,255,0.48)' : 'rgba(255,255,255,0.04)', borderRadius: theme.radius.xl }]}>
      <View style={styles.stepTitleRow}>
        {done ? <CheckCircle2 size={17} color="#10B981" /> : <View style={[styles.pendingDot, { borderColor: theme.mutedForeground }]} />}
        <Text style={[styles.stepTitle, { color: theme.foreground, fontFamily: FONT.uiBold }]}>{title}</Text>
      </View>
      <Text style={[styles.stepDescription, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {description}
      </Text>
      <View style={styles.stepActions}>{actions}</View>
    </View>
  )
}

function MobileNutritionTierBlock({ subscriptionTier }: { subscriptionTier: CoachProfile['subscriptionTier'] }) {
  const { theme } = useTheme()
  const router = useRouter()
  const enabled = canUseNutrition(subscriptionTier)
  return (
    <View style={[styles.nutritionBlock, { borderColor: enabled ? 'rgba(16,185,129,0.24)' : theme.border, backgroundColor: enabled ? 'rgba(16,185,129,0.08)' : theme.muted, borderRadius: theme.radius.xl }]}>
      <Text style={[styles.eyebrow, { color: enabled ? '#10B981' : theme.mutedForeground, fontFamily: FONT.uiBold }]}>
        NUTRICION {enabled ? '(OPCIONAL)' : ''}
      </Text>
      <Text style={[styles.nutritionTitle, { color: theme.foreground, fontFamily: FONT.uiBold }]}>
        {enabled ? 'Cuando quieras, sigue esta ruta' : 'Planes de nutricion en Pro o superior'}
      </Text>
      <Text style={[styles.nutritionText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {enabled
          ? 'Tu plan ya incluye nutricion. Puedes crear plantillas, catalogo y asignar planes nutricionales.'
          : 'Tu plan actual incluye entrenos. Al subir de plan desbloqueas plantillas, catalogo y asignacion nutricional.'}
      </Text>
      <Button
        label={enabled ? 'Abrir nutricion' : 'Ver planes y upgrade'}
        variant="secondary"
        size="sm"
        onPress={() => enabled ? router.push('/coach/(tabs)/nutricion') : openCoachWebPath('/coach/subscription')}
        style={styles.nutritionButton}
      />
    </View>
  )
}

type QuickActionClient = { id: string; name: string }

export function MobileQuickActionsBar({
  clients,
  onPaymentCreated,
  onClientCreated,
}: {
  clients: QuickActionClient[]
  onPaymentCreated: () => void
  onClientCreated: () => void
}) {
  const router = useRouter()
  const [modal, setModal] = useState<null | 'client' | 'payment'>(null)

  return (
    <>
      <View style={styles.quickActions}>
        <QuickActionButton icon={UserPlus} label="+ Alumno" onPress={() => setModal('client')} />
        <QuickActionButton icon={Layers} label="+ Programa" onPress={() => router.push('/coach/(tabs)/builder')} />
        <QuickActionButton icon={Utensils} label="+ Nutricion" onPress={() => router.push('/coach/(tabs)/nutricion')} />
        <QuickActionButton icon={Receipt} label="+ Pago" onPress={() => setModal('payment')} />
      </View>

      <NativeDialog
        open={modal != null}
        title={modal === 'payment' ? 'Registrar pago' : 'Agregar alumno'}
        onClose={() => setModal(null)}
      >
        {modal === 'payment' ? (
          <QuickAddPaymentForm
            clients={clients}
            onDone={() => {
              setModal(null)
              onPaymentCreated()
            }}
            onCancel={() => setModal(null)}
          />
        ) : (
          <QuickCreateClientForm
            onDone={() => {
              setModal(null)
              onClientCreated()
            }}
            onCancel={() => setModal(null)}
          />
        )}
      </NativeDialog>
    </>
  )
}

/**
 * FAB de acciones rapidas (1:1 con coach-dashboard.jsx → FAB + bottom sheet).
 * Reemplaza la vieja barra de chips superior. Reutiliza los forms de alumno/pago.
 */
export function MobileQuickActionsFab({
  clients,
  onClientCreated,
  onPaymentCreated,
}: {
  clients: QuickActionClient[]
  onClientCreated: () => void
  onPaymentCreated: () => void
}) {
  const router = useRouter()
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const [sheet, setSheet] = useState(false)
  const [modal, setModal] = useState<null | 'client' | 'payment'>(null)

  const actions: Array<{ label: string; icon: LucideIcon; on: () => void }> = [
    { label: 'Crear alumno', icon: UserPlus, on: () => { setSheet(false); setModal('client') } },
    { label: 'Importar', icon: Upload, on: () => { setSheet(false); router.push('/coach/(tabs)/clientes') } },
    { label: 'Programa', icon: Dumbbell, on: () => { setSheet(false); router.push('/coach/(tabs)/builder') } },
  ]

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Acciones rápidas"
        className="bg-cta-fill"
        activeOpacity={0.85}
        onPress={() => setSheet(true)}
        style={[
          {
            position: 'absolute',
            right: 20,
            bottom: insets.bottom + 92,
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
          },
          theme.shadowGlowBlue,
        ]}
      >
        <Plus size={26} color="#FFFFFF" strokeWidth={2.4} />
      </TouchableOpacity>

      <NativeDialog open={sheet} title="Acción rápida" onClose={() => setSheet(false)}>
        <View style={{ gap: 2 }}>
          {actions.map((a) => {
            const Icon = a.icon
            return (
              <TouchableOpacity
                key={a.label}
                activeOpacity={0.8}
                onPress={a.on}
                className="flex-row items-center gap-3.5 py-3"
              >
                <View className="h-10 w-10 items-center justify-center rounded-control bg-surface-inverse">
                  <Icon size={19} color={theme.primary} />
                </View>
                <Text className="font-sans-bold text-[15.5px] text-strong">{a.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </NativeDialog>

      <NativeDialog
        open={modal != null}
        title={modal === 'payment' ? 'Registrar pago' : 'Agregar alumno'}
        onClose={() => setModal(null)}
      >
        {modal === 'payment' ? (
          <QuickAddPaymentForm
            clients={clients}
            onDone={() => { setModal(null); onPaymentCreated() }}
            onCancel={() => setModal(null)}
          />
        ) : (
          <QuickCreateClientForm
            onDone={() => { setModal(null); onClientCreated() }}
            onCancel={() => setModal(null)}
          />
        )}
      </NativeDialog>
    </>
  )
}

const GUIDE_CHIP_HIDDEN_KEY = (coachId: string) => `eva_coach_guide_chip_hidden:${coachId}`

/**
 * P3 — Guia de inicio como chip expandible (1:1 con coach-dashboard.jsx).
 * Libera el fold: barra colapsada con progreso → expande 4 pasos + upsell Pro + "Saltar guia".
 * Los pasos se auto-completan desde la senal real (logo, alumnos, planes, uso 30d).
 */
export function MobileOnboardingGuideChip({
  coach,
  totalClients,
  activePlans,
  hasStudentSignal30d,
}: {
  coach: CoachProfile
  totalClients: number
  activePlans: number
  hasStudentSignal30d: boolean
}) {
  const { theme, resolvedScheme } = useTheme()
  const router = useRouter()
  const dark = resolvedScheme === 'dark'
  const sport = deriveSportTokens(theme.primary)
  const sport100 = dark ? sport.dark['100'] : sport.ramp['100']
  const sport200 = sport.ramp['200']
  const sport300 = sport.ramp['300']
  const sport600 = dark ? sport.dark['600'] : sport.ramp['600']
  const sport700 = dark ? sport.dark['700'] : sport.ramp['700']
  const success100 = dark ? 'rgba(31,184,119,0.18)' : '#DBF5EA'
  const success700 = dark ? '#6FE3B4' : '#0E7A50'
  const isFree = coach.subscriptionTier === 'free'
  const nutritionEnabled = canUseNutrition(coach.subscriptionTier)
  const [brandOverride, setBrandOverride] = useState<boolean | null>(null)
  const brandDone = brandOverride ?? Boolean(coach.hasCoachLogo)
  const steps = [
    { key: 'brand', label: 'Personaliza tu marca', done: brandDone, route: isFree ? 'subscription' : 'brand' },
    { key: 'client', label: 'Suma tu primer alumno', done: totalClients > 0, route: 'clients' },
    { key: 'plan', label: 'Crea tu primer plan', done: activePlans > 0, route: 'programs' },
    { key: 'checkin', label: 'Recibe el primer check-in', done: hasStudentSignal30d, route: 'clients' },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const allDone = doneCount === steps.length

  const [open, setOpen] = useState(doneCount === 0)
  const [hidden, setHidden] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true
    Promise.all([
      AsyncStorage.getItem(GUIDE_CHIP_HIDDEN_KEY(coach.id)),
      AsyncStorage.getItem(`${GUIDE_CHIP_HIDDEN_KEY(coach.id)}:brand`),
    ])
      .then(([hiddenValue, brandValue]) => {
        if (!mounted) return
        setHidden(hiddenValue === '1')
        if (brandValue === '1') setBrandOverride(true)
        if (brandValue === '0') setBrandOverride(false)
        setReady(true)
      })
      .catch(() => { if (mounted) setReady(true) })
    return () => { mounted = false }
  }, [coach.id])

  function skip() {
    setHidden(true)
    AsyncStorage.setItem(GUIDE_CHIP_HIDDEN_KEY(coach.id), '1').catch(() => null)
    postMobileOnboardingEvent('profile_branding', 'guide_engagement', {
      widget: 'onboarding_chip',
      action: 'dismiss',
      progress_pct: Math.round((doneCount / steps.length) * 100),
    })
  }

  function resumeGuide() {
    setHidden(false)
    AsyncStorage.removeItem(GUIDE_CHIP_HIDDEN_KEY(coach.id)).catch(() => null)
  }

  function toggleBrandStep() {
    const next = !brandDone
    setBrandOverride(next)
    AsyncStorage.setItem(`${GUIDE_CHIP_HIDDEN_KEY(coach.id)}:brand`, next ? '1' : '0').catch(() => null)
  }

  function openStep(route: string) {
    if (route === 'subscription') openCoachWebPath('/coach/subscription')
    else if (route === 'brand') router.push('/coach/settings/brand')
    else if (route === 'programs') router.push('/coach/(tabs)/builder')
    else router.push('/coach/(tabs)/clientes')
  }

  if (!ready) return null
  if (hidden && allDone) return null
  if (hidden) {
    return (
      <View
        className="flex-row items-center gap-[11px] px-[13px] py-1"
        style={{ borderWidth: 1, borderColor: sport200, backgroundColor: sport100, borderRadius: theme.radius.md }}
      >
        <Rocket size={16} color={sport600} />
        <Text className="flex-1 font-sans-bold text-[13px]" style={{ color: sport700 }}>
          Sigues con pasos pendientes en tu guía de inicio.
        </Text>
        <TouchableOpacity onPress={resumeGuide} className="min-h-11 justify-center px-1">
          <Text className="font-sans-extra text-[12.5px]" style={{ color: sport700 }}>Continuar guía</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // Momento aha: circuito completo → card de celebracion (cerrable).
  if (allDone) {
    return (
      <Card
        padding="md"
        radius="card"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: success100, borderColor: hexToRgba(theme.success, 0.3), borderWidth: 1 }}
      >
        <View className="h-9 w-9 items-center justify-center rounded-pill" style={{ backgroundColor: theme.success }}>
          <PartyPopper size={18} color="#FFFFFF" />
        </View>
        <View className="flex-1" style={{ minWidth: 0 }}>
          <Text className="font-sans-extra text-[14.5px]" style={{ color: success700 }}>
            ¡Activación lista!
          </Text>
          <Text className="font-sans text-[12.5px]" style={{ color: success700, opacity: 0.85 }}>Tu cuenta está configurada. A entrenar.</Text>
        </View>
        <TouchableOpacity onPress={skip} accessibilityLabel="Cerrar" className="h-11 w-11 items-center justify-center">
          <X size={18} color={success700} />
        </TouchableOpacity>
      </Card>
    )
  }

  return (
    <View>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setOpen((o) => !o)}
        className="flex-row items-center gap-3 px-3 py-[11px]"
        style={{
          borderWidth: 1,
          borderColor: sport200,
          borderBottomWidth: open ? 0 : 1,
          backgroundColor: sport100,
          borderTopLeftRadius: theme.radius.md,
          borderTopRightRadius: theme.radius.md,
          borderBottomLeftRadius: open ? 0 : theme.radius.md,
          borderBottomRightRadius: open ? 0 : theme.radius.md,
        }}
      >
        <Rocket size={16} color={sport600} />
        <Text className="flex-1 font-sans-bold text-[13px]" style={{ color: sport700 }}>
          Guía de inicio
        </Text>
        <View className="flex-row items-center" style={{ gap: 4 }}>
          {steps.map((s) => (
            <View
              key={s.key}
              style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: s.done ? theme.primary : sport300, opacity: s.done ? 1 : 0.5 }}
            />
          ))}
        </View>
        <Text className="font-sans-extra text-[12.5px]" style={{ color: sport700, minWidth: 26, textAlign: 'right' }}>
          {doneCount}/{steps.length}
        </Text>
        <ChevronDown size={16} color={sport600} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </TouchableOpacity>

      {open ? (
        <View
          style={{
            borderWidth: 1,
            borderTopWidth: 0,
            borderColor: sport200,
            backgroundColor: sport100,
            borderBottomLeftRadius: theme.radius.md,
            borderBottomRightRadius: theme.radius.md,
            paddingHorizontal: 13,
            paddingTop: 4,
            paddingBottom: 13,
          }}
        >
          <View style={{ gap: 7 }}>
            {steps.map((s) => (
              <View key={s.key} className="flex-row items-center" style={{ gap: 9 }}>
                <View
                  className="items-center justify-center rounded-pill"
                  style={{
                    width: 20,
                    height: 20,
                    backgroundColor: s.done ? theme.primary : 'transparent',
                    borderWidth: s.done ? 0 : 2,
                    borderColor: sport300,
                  }}
                >
                  {s.done ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                </View>
                <TouchableOpacity onPress={() => openStep(s.route)} className="flex-1 py-0.5">
                  <Text
                    className="font-sans-semibold text-[13.5px]"
                    style={{ color: s.done ? sport600 : sport700, textDecorationLine: s.done ? 'line-through' : 'none', opacity: s.done ? 0.7 : 1 }}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
                {s.key === 'brand' ? (
                  <TouchableOpacity onPress={toggleBrandStep} className="min-h-11 justify-center px-1">
                    <Text className="font-sans-extra text-[12px]" style={{ color: sport700 }}>
                      {s.done ? 'Desmarcar' : 'Marcar visto'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>

          {!nutritionEnabled ? <View
            className="flex-row items-center"
            style={{ gap: 9, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: sport200 }}
          >
            <Sparkles size={15} color={sport600} />
            <Text className="flex-1 font-sans text-[12px]" style={{ color: sport700, lineHeight: 16 }}>
              Suma planes de nutrición con <Text className="font-sans-bold">Pro</Text>.
            </Text>
            <TouchableOpacity onPress={() => openCoachWebPath('/coach/subscription')} hitSlop={6}>
              <Text className="font-sans-extra text-[12px]" style={{ color: sport700 }}>Mejorar</Text>
            </TouchableOpacity>
          </View> : null}

          <TouchableOpacity onPress={skip} className="mt-1 min-h-11 justify-center pr-2">
            <Text className="font-sans-bold text-[12px]" style={{ color: sport600 }}>Saltar guía</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  )
}

type CreateClientResponse = {
  ok: true
  clientName: string
  loginUrl: string
  newClientPhone: string | null
}

function generateTempPassword(): string {
  const n = Math.floor(100000 + Math.random() * 900000)
  return `Eva${n}!`
}

function whatsappUrl(phone: string, message: string) {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

function QuickCreateClientForm({
  onDone,
  onCancel,
}: {
  onDone: () => void
  onCancel: () => void
}) {
  const { theme } = useTheme()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [subscriptionStartDate, setSubscriptionStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [tempPassword, setTempPassword] = useState(generateTempPassword)
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreateClientResponse | null>(null)

  async function submit() {
    setError(null)
    const name = fullName.trim()
    const mail = email.trim().toLowerCase()
    const pass = tempPassword.trim()

    if (name.length < 2) {
      setError('Indica el nombre del alumno.')
      return
    }
    if (!mail.includes('@')) {
      setError('Indica un email valido.')
      return
    }
    if (pass.length < 8) {
      setError('La contrasena temporal debe tener al menos 8 caracteres.')
      return
    }
    if (!ageConfirmed) {
      setError('Confirma edad minima o consentimiento del tutor.')
      return
    }

    setSaving(true)
    try {
      const result = await apiFetch<CreateClientResponse>('/api/mobile/coach/clients', {
        method: 'POST',
        authenticated: true,
        body: {
          fullName: name,
          email: mail,
          phone: phone.trim(),
          subscriptionStartDate,
          tempPassword: pass,
          ageConfirmed,
        },
      })
      setCreated(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear el alumno.'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  if (created) {
    const createdClient = created
    const accessMessage = `Hola ${createdClient.clientName}! Soy tu coach. Aqui esta tu link para acceder a tu plan: ${createdClient.loginUrl}`
    const waUrl = createdClient.newClientPhone ? whatsappUrl(createdClient.newClientPhone, accessMessage) : null
    async function shareAccess() {
      if (waUrl) {
        await Linking.openURL(waUrl).catch(() => Share.share({ message: accessMessage, url: createdClient.loginUrl }))
        return
      }
      await Share.share({ message: accessMessage, url: createdClient.loginUrl })
    }

    return (
      <View style={styles.paymentForm}>
        <View style={[styles.successBox, { borderColor: 'rgba(16,185,129,0.35)', backgroundColor: 'rgba(16,185,129,0.1)' }]}>
          <CheckCircle2 size={19} color="#10B981" />
          <View style={styles.successCopy}>
            <Text style={[styles.successTitle, { color: theme.foreground, fontFamily: FONT.uiBold }]}>
              {createdClient.clientName} creado
            </Text>
            <Text style={[styles.successText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={2}>
              Email enviado. Acceso: {createdClient.loginUrl}
            </Text>
          </View>
        </View>
        <View style={styles.formActions}>
          <Button label="Cerrar" variant="secondary" onPress={onDone} style={styles.formButton} />
          <Button label={waUrl ? 'Enviar WhatsApp' : 'Compartir link'} onPress={shareAccess} style={styles.formButton} />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.paymentForm}>
      {error ? (
        <View style={[styles.formError, { borderColor: theme.destructive, backgroundColor: theme.destructive + '14' }]}>
          <Text style={[styles.formErrorText, { color: theme.destructive, fontFamily: FONT.uiSemibold }]}>
            {error}
          </Text>
        </View>
      ) : null}

      <FormInput label="Nombre" value={fullName} onChangeText={setFullName} placeholder="Nombre completo" />
      <FormInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="alumno@email.com" />
      <FormInput label="Telefono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Opcional" />
      <FormInput label="Inicio suscripcion" value={subscriptionStartDate} onChangeText={setSubscriptionStartDate} placeholder="YYYY-MM-DD" />
      <FormInput label="Contrasena temporal" value={tempPassword} onChangeText={setTempPassword} placeholder="Minimo 8 caracteres" />

      <TouchableOpacity
        activeOpacity={0.82}
        onPress={() => setAgeConfirmed((value) => !value)}
        style={[styles.checkboxRow, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.lg }]}
      >
        <View
          style={[
            styles.checkboxBox,
            {
              borderColor: ageConfirmed ? theme.primary : theme.border,
              backgroundColor: ageConfirmed ? theme.primary : 'transparent',
            },
          ]}
        >
          {ageConfirmed ? <CheckCircle2 size={14} color="#FFFFFF" strokeWidth={2.6} /> : null}
        </View>
        <Text style={[styles.checkboxText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Alumno 14+ o con consentimiento de tutor legal.
        </Text>
      </TouchableOpacity>

      <View style={styles.formActions}>
        <Button label="Cancelar" variant="secondary" onPress={onCancel} disabled={saving} style={styles.formButton} />
        <Button label={saving ? 'Creando...' : 'Crear alumno'} onPress={submit} disabled={saving} style={styles.formButton} />
      </View>
    </View>
  )
}

function QuickAddPaymentForm({
  clients,
  onDone,
  onCancel,
}: {
  clients: QuickActionClient[]
  onDone: () => void
  onCancel: () => void
}) {
  const { theme } = useTheme()
  const [clientId, setClientId] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [periodMonths, setPeriodMonths] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (!clientId) {
      setError('Selecciona un alumno.')
      return
    }
    const amt = Math.round(Number(String(amount).replace(/\s/g, '')))
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Indica un monto valido.')
      return
    }
    if (!paymentDate) {
      setError('Indica la fecha del pago.')
      return
    }
    const desc = description.trim()
    if (!desc) {
      setError('Indica un concepto.')
      return
    }
    const pm = periodMonths.trim() ? Number(periodMonths) : null
    if (periodMonths.trim() !== '' && (!Number.isFinite(pm) || (pm ?? 0) < 1)) {
      setError('Periodo en meses debe ser 1 o mayor.')
      return
    }

    setSaving(true)
    try {
      await apiFetch<{ ok: true }>('/api/mobile/coach/payments', {
        method: 'POST',
        authenticated: true,
        body: {
          clientId,
          amount: amt,
          paymentDate,
          serviceDescription: desc,
          periodMonths: pm,
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo registrar el pago. Intenta de nuevo.'
      setError(message)
      setSaving(false)
      return
    }
    setSaving(false)

    onDone()
  }

  return (
    <View style={styles.paymentForm}>
      {error ? (
        <View style={[styles.formError, { borderColor: theme.destructive, backgroundColor: theme.destructive + '14' }]}>
          <Text style={[styles.formErrorText, { color: theme.destructive, fontFamily: FONT.uiSemibold }]}>
            {error}
          </Text>
        </View>
      ) : null}

      <View style={styles.formField}>
        <Text style={[styles.formLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>Alumno</Text>
        <ScrollView style={[styles.clientPicker, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.lg }]} nestedScrollEnabled>
          {clients.length === 0 ? (
            <Text style={[styles.clientEmpty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Sin alumnos activos.
            </Text>
          ) : (
            clients.map((client) => {
              const active = clientId === client.id
              return (
                <TouchableOpacity
                  key={client.id}
                  activeOpacity={0.78}
                  onPress={() => setClientId(client.id)}
                  style={[
                    styles.clientOption,
                    active && { backgroundColor: theme.primary + '1A' },
                  ]}
                >
                  <Text
                    style={[
                      styles.clientOptionText,
                      { color: active ? theme.primary : theme.foreground, fontFamily: FONT.uiSemibold },
                    ]}
                    numberOfLines={1}
                  >
                    {client.name}
                  </Text>
                </TouchableOpacity>
              )
            })
          )}
        </ScrollView>
      </View>

      <FormInput label="Monto" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="CLP" />
      <FormInput label="Fecha" value={paymentDate} onChangeText={setPaymentDate} placeholder="YYYY-MM-DD" />
      <FormInput label="Concepto" value={description} onChangeText={setDescription} placeholder="Ej. Mensualidad mayo" />
      <FormInput label="Meses" value={periodMonths} onChangeText={setPeriodMonths} keyboardType="number-pad" placeholder="Opcional" />

      <View style={styles.formActions}>
        <Button label="Cancelar" variant="secondary" onPress={onCancel} disabled={saving} style={styles.formButton} />
        <Button label={saving ? 'Guardando...' : 'Confirmar'} onPress={submit} disabled={saving || clients.length === 0} style={styles.formButton} />
      </View>
    </View>
  )
}

function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'number-pad' | 'email-address' | 'phone-pad'
}) {
  const { theme } = useTheme()
  return (
    <View style={styles.formField}>
      <Text style={[styles.formLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        keyboardType={keyboardType}
        style={[
          styles.formInput,
          {
            color: theme.foreground,
            backgroundColor: theme.secondary,
            borderColor: theme.border,
            borderRadius: theme.radius.lg,
            fontFamily: theme.fontSans,
          },
        ]}
      />
    </View>
  )
}

function QuickActionButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: LucideIcon
  label: string
  onPress: () => void
}) {
  const { theme } = useTheme()

  return (
    <TouchableOpacity
      accessibilityLabel={label}
      accessibilityRole="button"
      activeOpacity={0.82}
      onPress={onPress}
      className="min-h-[36px] flex-row items-center gap-1.5 rounded-pill border border-subtle bg-surface-card px-3 py-2"
    >
      <Icon size={16} color={theme.primary} strokeWidth={2.3} />
      <Text className="font-sans-semibold text-[13px] text-strong" numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function useGlassStyle() {
  const { mode } = useTheme()
  const isDark = mode !== 'light'
  return {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.11)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: isDark ? 0.16 : 0.055,
    shadowRadius: isDark ? 20 : 14,
    elevation: isDark ? 4 : 2,
  }
}

/**
 * Header del dashboard (1:1 con coach-dashboard.jsx → bloque Header).
 * Fecha dinámica + "Hola, {nombre}" + cluster de acciones (Insights ✨, Notificaciones 🔔
 * con punto rojo, avatar/workspace). Reemplaza la barra superior global: cada screen
 * renderiza su propio header como el diseño.
 */
export function MobileGreetingHeader({
  coachName,
  logoUrl,
  onInsights,
  onAvatar,
}: {
  coachName: string
  logoUrl?: string | null
  onInsights?: () => void
  onAvatar?: () => void
  /** Pendientes accionables de hoy (riesgo + programas por vencer + check-ins por revisar). */
  pendingCount?: number
}) {
  const { theme } = useTheme()
  const { workspaces } = useWorkspace()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const hasMultipleWorkspaces = (workspaces?.length ?? 0) > 1
  const firstName = coachName?.split(' ')[0] || 'Coach'
  const now = new Date()
  const dateStr = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'America/Santiago',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)

  const iconBtn = {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }

  return (
    <View style={styles.greeting}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text className="font-sans-semibold text-[13px] text-muted" numberOfLines={1}>
          {dateStr}
        </Text>
        <Text
          className="font-display-black text-[28px] text-strong"
          style={{ lineHeight: 29.4, letterSpacing: -0.84 }}
          numberOfLines={1}
        >
          Hola, {firstName}
        </Text>
      </View>

      <View className="flex-row items-center" style={{ gap: 6 }}>
        <TouchableOpacity activeOpacity={0.8} accessibilityLabel="Insights" onPress={onInsights} style={iconBtn}>
          <Sparkles size={19} color={theme.foreground} strokeWidth={2.1} />
        </TouchableOpacity>
        <CoachNewsBell tileStyle={iconBtn} />
        <TouchableOpacity
          activeOpacity={0.85}
          accessibilityLabel={hasMultipleWorkspaces ? 'Cambiar workspace' : 'Tu cuenta'}
          onPress={hasMultipleWorkspaces ? () => setSwitcherOpen(true) : onAvatar}
          testID="coach-avatar-workspace"
          style={{ position: 'relative' }}
        >
          <Avatar src={logoUrl} name={coachName} size={40} />
          {hasMultipleWorkspaces ? (
            <View
              pointerEvents="none"
              style={[
                styles.workspaceCaret,
                { borderColor: theme.background, backgroundColor: theme.card },
                shadow('sm', theme.scheme),
              ]}
            >
              <ChevronDown size={12} color={theme.mutedForeground} strokeWidth={2.2} />
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
      <WorkspaceSwitcherSheet open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </View>
  )
}

// ─── News bell (campana de Novedades) ───────────────────────────────────────
// 1:1 con la NewsBell web (NewsBellButton.tsx): badge con unreadCount, bottom-sheet
// con el feed de novedades y marcar-todo-leido al abrir. Misma fuente de datos que web
// (news_items + news_reads) via /api/mobile/coach/news.

const NEWS_TYPE_META: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  feature: { icon: Sparkles, bg: 'rgba(0,122,255,0.14)', fg: '#0A84FF' },
  improvement: { icon: Wrench, bg: 'rgba(16,185,129,0.14)', fg: '#10B981' },
  fix: { icon: Bug, bg: 'rgba(245,158,11,0.14)', fg: '#F59E0B' },
  announcement: { icon: Megaphone, bg: 'rgba(148,163,184,0.16)', fg: '#94A3B8' },
}
const NEWS_TYPE_LABEL: Record<string, string> = {
  feature: 'Nueva función',
  improvement: 'Mejora',
  fix: 'Corrección',
  announcement: 'Anuncio',
}

function newsRelativeDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (diffDays <= 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) return `Hace ${diffDays} días`
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

// Render inline de **negrita** (unico markdown que el feed usa con frecuencia).
function NewsInline({ text, color }: { text: string; color: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <Text key={i} className="font-sans-bold" style={{ color }}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </>
  )
}

function NewsContent({ text }: { text: string }) {
  const { theme } = useTheme()
  const lines = text.split('\n')
  return (
    <View style={{ gap: 2 }}>
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (trimmed === '') return <View key={i} style={{ height: 3 }} />
        if (trimmed === '---') {
          return <View key={i} style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginVertical: 6 }} />
        }
        if (line.startsWith('## ')) {
          return (
            <Text key={i} className="font-sans-bold text-[13px] text-strong" style={{ marginTop: 4 }}>
              <NewsInline text={line.slice(3)} color={theme.foreground} />
            </Text>
          )
        }
        if (line.startsWith('### ')) {
          return (
            <Text key={i} className="font-sans-extra text-[10.5px] text-muted" style={{ letterSpacing: 0.5, marginTop: 3, textTransform: 'uppercase' }}>
              <NewsInline text={line.slice(4)} color={theme.mutedForeground} />
            </Text>
          )
        }
        if (line.startsWith('- ')) {
          return (
            <View key={i} className="flex-row" style={{ gap: 6, paddingLeft: 4 }}>
              <Text className="font-sans text-[12px] text-muted">{'•'}</Text>
              <Text className="flex-1 font-sans text-[12px] text-muted" style={{ lineHeight: 17 }}>
                <NewsInline text={line.slice(2)} color={theme.foreground} />
              </Text>
            </View>
          )
        }
        return (
          <Text key={i} className="font-sans text-[12px] text-muted" style={{ lineHeight: 17 }}>
            <NewsInline text={line} color={theme.foreground} />
          </Text>
        )
      })}
    </View>
  )
}

function NewsFeedRow({ item, onNavigate }: { item: CoachNewsItem; onNavigate: () => void }) {
  const { theme } = useTheme()
  const meta = NEWS_TYPE_META[item.type] ?? NEWS_TYPE_META.announcement
  const TypeIcon = meta.icon
  return (
    <View
      className="flex-row"
      style={{
        gap: 11,
        paddingVertical: 11,
        paddingHorizontal: 12,
        borderRadius: theme.radius.md,
        backgroundColor: item.is_pinned ? hexToRgba(theme.primary, 0.08) : 'transparent',
      }}
    >
      {item.is_pinned ? (
        <View style={{ position: 'absolute', left: 2, top: 12, bottom: 12, width: 3, borderRadius: 2, backgroundColor: theme.primary }} />
      ) : null}
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: meta.bg, alignItems: 'center', justifyContent: 'center' }}>
        <TypeIcon size={16} color={meta.fg} />
      </View>
      <View className="flex-1" style={{ minWidth: 0, gap: 2 }}>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <Text className="font-sans-extra text-[10.5px] text-muted" style={{ letterSpacing: 0.6, textTransform: 'uppercase' }}>
            {NEWS_TYPE_LABEL[item.type] || item.type}
          </Text>
          {item.is_pinned ? <Pin size={11} color={theme.primary} /> : null}
        </View>
        <Text className="font-sans-bold text-[13px] text-strong" style={{ lineHeight: 18 }}>
          {item.title}
        </Text>
        <NewsContent text={item.content} />
        {item.image_url ? (
          // Espejo de NewsBellButton.tsx:151-160 (mt-1.5 max-h-40 w-full rounded-md object-cover).
          <Image
            source={{ uri: item.image_url }}
            style={{ marginTop: 6, width: '100%', height: 160, borderRadius: theme.radius.md }}
            contentFit="cover"
          />
        ) : null}
        {item.cta_url ? (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              Linking.openURL(item.cta_url as string).catch(() => null)
              onNavigate()
            }}
            style={{ marginTop: 3 }}
          >
            <Text className="font-sans-bold text-[12.5px]" style={{ color: theme.primary }}>
              {item.cta_label || 'Ver más'} →
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text className="font-sans text-[11px] text-muted" style={{ flexShrink: 0 }}>
        {newsRelativeDate(item.published_at)}
      </Text>
    </View>
  )
}

export function CoachNewsBell({ tileStyle }: { tileStyle: object }) {
  const { theme } = useTheme()
  const [items, setItems] = useState<CoachNewsItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)

  // Gotcha 6b: la campana vive en un tab de expo-router que NO se desmonta → un
  // `useEffect` de un disparo congela el badge. `useFocusEffect` refetcha el feed
  // en cada foco de home (espejo del refresh en `visibilitychange` del
  // NewsFeedProvider web) para que el conteo refleje la verdad del servidor.
  useFocusEffect(
    useCallback(() => {
      let active = true
      getCoachNews()
        .then((res) => {
          if (!active) return
          setItems(res.items ?? [])
          setUnreadCount(res.unreadCount ?? 0)
        })
        .catch(() => {
          // Silencioso: la campana es no-critica; sin novedades = sin badge.
        })
      return () => {
        active = false
      }
    }, [])
  )

  const openSheet = useCallback(() => {
    setOpen(true)
    if (unreadCount > 0) {
      const previousCount = unreadCount
      setUnreadCount(0)
      markCoachNewsRead().catch(() => {
        // Rollback optimista (espejo de `setUnreadCount(previousCount)` del
        // NewsFeedProvider web): si el POST falla, restaura el badge.
        setUnreadCount(previousCount)
      })
    }
  }, [unreadCount])

  const badge = unreadCount > 9 ? '9+' : unreadCount > 0 ? String(unreadCount) : null

  return (
    <>
      <TouchableOpacity activeOpacity={0.8} accessibilityLabel="Novedades" testID="coach-news-bell" onPress={openSheet} style={tileStyle}>
        <NavIconRN concept="novedades" size={19} color={theme.foreground} />
        {badge ? (
          <View
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              paddingHorizontal: 3,
              backgroundColor: theme.destructive,
              borderWidth: 2,
              borderColor: theme.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 9, fontFamily: 'HankenGrotesk_700Bold', lineHeight: 11 }}>{badge}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Novedades"
        snapPoints={['80%']}
        nativeModal
        accessibilityLabel="Novedades"
      >
        {items.length === 0 ? (
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 32 }}>
            <Bell size={26} color={theme.mutedForeground} />
            <Text className="font-sans text-[13px] text-muted">No hay novedades por ahora.</Text>
          </View>
        ) : (
          <View style={{ gap: 2 }} testID="coach-news-feed">
            {items.map((item) => (
              <NewsFeedRow key={item.id} item={item} onNavigate={() => setOpen(false)} />
            ))}
          </View>
        )}
      </Sheet>
    </>
  )
}

// P1 — sparkline (área suave + línea), 1:1 con coach-dashboard.jsx → Sparkline.
function PulseSparkline({ data, color, w = 60, h = 22 }: { data: number[]; color: string; w?: number; h?: number }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const rng = max - min || 1
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 2 - ((v - min) / rng) * (h - 4)] as const)
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  const area = line + ` L ${w} ${h} L 0 ${h} Z`
  const gid = 'spark' + color.replace(/[^a-z0-9]/gi, '')
  const last = pts[pts.length - 1]
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Path d={area} fill={`url(#${gid})`} />
      <Path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <SvgCircle cx={last[0]} cy={last[1]} r={2.6} fill={color} />
    </Svg>
  )
}

// P1 — delta de tendencia (verde si la dirección es buena para el negocio).
// 1:1 con coach-dashboard.jsx → deltaView.
function pulseDeltaView(
  delta: number,
  goodDir: 'up' | 'down',
  theme: ReturnType<typeof useTheme>['theme'],
  scheme: 'light' | 'dark',
): { txt: string; color: string; icon: LucideIcon } {
  if (!delta) return { txt: 'igual', color: theme.mutedForeground, icon: Minus }
  const dir = delta > 0 ? 'up' : 'down'
  const good = dir === goodDir
  const dark = scheme === 'dark'
  return {
    txt: (delta > 0 ? '+' : '') + delta,
    // success-600 / danger-600 scheme-aware (1:1 con deltaView web).
    color: good ? (dark ? '#4FD9A0' : '#0F7D50') : (dark ? '#FF7C97' : '#BE183C'),
    icon: dir === 'up' ? TrendingUp : TrendingDown,
  }
}

/**
 * P1 — Pulse hero: 3 stats tocables en una sola card (Activos · En riesgo · Adherencia)
 * con delta de tendencia + sparkline. 1:1 con coach-dashboard.jsx → heroStats.
 * Los deltas/sparkline son placeholders derivados (la data real aún no expone la
 * tendencia semanal) — el elemento visual se renderiza igual que el diseño.
 */
export function MobilePulseHero({
  kpi,
  onActivosPress,
  onRiesgoPress,
  onAdherencePress,
}: {
  kpi: MobileKpiSummary
  onActivosPress: () => void
  onRiesgoPress: () => void
  onAdherencePress: () => void
}) {
  const { theme, resolvedScheme } = useTheme()

  // Serie suave terminando en el valor real (1:1 con sparkSeries de PulseHero.tsx web:
  // mismo wiggle → misma curva). La pipeline no expone histórico agregado (placeholder).
  const base = Math.max(0, Math.min(100, kpi.avgAdherence))
  const adherenceSpark = [-9, -5, -7, -2, -4, 1, 0].map((w) => Math.max(0, Math.min(100, base + w)))

  const stats: Array<{
    key: string
    label: string
    value: string
    danger: boolean
    onPress: () => void
    sub: { txt: string; color: string; icon: LucideIcon }
    spark?: number[]
  }> = [
    {
      key: 'activos',
      label: 'Activos',
      value: String(kpi.totalClients),
      danger: false,
      onPress: onActivosPress,
      sub: pulseDeltaView(1, 'up', theme, resolvedScheme),
    },
    {
      key: 'riesgo',
      label: 'En riesgo',
      value: String(kpi.riskCount),
      danger: kpi.riskCount > 0,
      onPress: onRiesgoPress,
      sub: pulseDeltaView(0, 'down', theme, resolvedScheme),
    },
    {
      key: 'adherencia',
      label: 'Adherencia',
      value: `${kpi.avgAdherence}%`,
      danger: false,
      onPress: onAdherencePress,
      sub: pulseDeltaView(3, 'up', theme, resolvedScheme),
      spark: adherenceSpark,
    },
  ]

  return (
    <Card padding="none" radius="card" style={{ flexDirection: 'row', overflow: 'hidden' }}>
      {stats.map((s, i) => {
        const SubIcon = s.sub.icon
        return (
          <TouchableOpacity
            key={s.key}
            activeOpacity={0.82}
            onPress={s.onPress}
            style={{
              flex: 1,
              paddingVertical: 14,
              paddingHorizontal: 12,
              gap: 5,
              borderLeftWidth: i > 0 ? StyleSheet.hairlineWidth : 0,
              borderLeftColor: theme.border,
            }}
          >
            <Text className="font-sans-extra uppercase text-[10.5px] tracking-[0.6px] text-muted" numberOfLines={1}>
              {s.label}
            </Text>
            <AnimatedNumber
              value={Number(s.value.replace('%', ''))}
              duration={820}
              format={(value) => `${Math.round(value)}${s.key === 'adherencia' ? '%' : ''}`}
              // Número "En riesgo" = danger-600 scheme-aware (web PulseHero.tsx:106-108
              // usa var(--danger-600): light #BE183C / dark #FF7C97), NO danger-500.
              style={{ fontFamily: FONT.displayBold, fontSize: 27, lineHeight: 27, letterSpacing: -0.27, color: s.danger ? (resolvedScheme === 'dark' ? '#FF7C97' : '#BE183C') : theme.foreground, fontVariant: ['tabular-nums'] }}
            />
            {s.spark ? (
              <View className="flex-row items-end" style={{ gap: 6, width: '100%' }}>
                <View className="flex-row items-center" style={{ gap: 2 }}>
                  <SubIcon size={12} color={s.sub.color} strokeWidth={2.4} />
                  <Text className="font-sans-extra text-[11px]" style={{ color: s.sub.color }} numberOfLines={1}>
                    {s.sub.txt}
                  </Text>
                </View>
                <View style={{ marginLeft: 'auto' }}>
                  <PulseSparkline data={s.spark} color={theme.primary} />
                </View>
              </View>
            ) : (
              <View className="flex-row items-center" style={{ gap: 2 }}>
                <SubIcon size={12} color={s.sub.color} strokeWidth={2.4} />
                <Text className="font-sans-extra text-[11px]" style={{ color: s.sub.color }} numberOfLines={1}>
                  {s.sub.txt}
                </Text>
                <Text className="font-sans-semibold text-[11px] text-subtle"> sem.</Text>
              </View>
            )}
          </TouchableOpacity>
        )
      })}
    </Card>
  )
}

export function MobileKpiStrip({
  kpi,
  onMrrPress,
  onAdherencePress,
}: {
  kpi: MobileKpiSummary
  onMrrPress?: () => void
  onAdherencePress?: () => void
}) {
  const router = useRouter()
  return (
    <View style={styles.kpiGrid}>
      <MobileKpiTile
        label="Ingresos del mes"
        value={formatCurrency(kpi.mrrCurrentMonth)}
        icon={TrendingUp}
        accent="sport"
        deltaPct={kpi.mrrDeltaPct}
        onPress={onMrrPress}
      />
      <MobileKpiTile
        label="Alumnos activos"
        value={String(kpi.totalClients)}
        icon={Users}
        accent="neutral"
        onPress={() => router.push('/coach/(tabs)/clientes')}
      />
      <MobileKpiTile
        label="En riesgo"
        value={String(kpi.riskCount)}
        icon={TriangleAlert}
        accent="ember"
        onPress={onAdherencePress}
      />
      <MobileKpiTile
        label="Adherencia"
        value={String(kpi.avgAdherence)}
        unit="%"
        icon={Activity}
        accent="sport"
        onPress={onAdherencePress}
      />
    </View>
  )
}

type KpiAccent = 'sport' | 'ember' | 'aqua' | 'neutral'

function MobileKpiTile({
  label,
  value,
  unit,
  icon: Icon,
  accent = 'sport',
  deltaPct,
  onPress,
}: {
  label: string
  value: string
  unit?: string
  icon: LucideIcon
  accent?: KpiAccent
  deltaPct?: number
  onPress?: () => void
}) {
  const delta =
    typeof deltaPct === 'number' ? `${deltaPct >= 0 ? '+' : ''}${deltaPct}%` : null

  const card = (
    <StatCard
      label={label}
      value={value}
      unit={unit}
      delta={delta}
      accent={accent}
      icon={Icon}
      style={{ width: '100%' }}
    />
  )

  if (!onPress) {
    return <View style={styles.kpiTouch}>{card}</View>
  }

  return (
    <TouchableOpacity activeOpacity={0.84} onPress={onPress} style={styles.kpiTouch}>
      {card}
    </TouchableOpacity>
  )
}

// Banda de riesgo P5: etiqueta + color (no solo color). Colores fijos on-dark
// (la card de prioridad es siempre oscura, no usar tokens que cambian por tema).
function focusRiskBand(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Riesgo alto', color: '#FF7C97' }
  if (score >= 50) return { label: 'Riesgo medio', color: '#FFC861' }
  return { label: 'Seguimiento', color: '#939DAB' }
}

// Etiqueta humana por flag (1:1 con coach-dashboard.jsx → FLAG_LABEL).
const FOCUS_FLAG_LABEL: Record<string, string> = {
  SIN_CHECKIN_1M: 'Sin check-in en 1 mes',
  SIN_EJERCICIO_7D: 'Sin ejercicio en 7 dias',
  NUTRICION_RIESGO: 'Nutricion en riesgo',
  PROGRAMA_VENCIDO: 'Programa vencido',
  PROGRAMA_POR_VENCER: 'Programa por vencer',
  FUERZA_CAYENDO: 'Fuerza cayendo',
}

/**
 * P2 + P6 — Zona de prioridad unica (card oscura inverse): titulo + alumnos nombrados
 * con score/100 + banda de riesgo + NextBestAction embebido. 1:1 con coach-dashboard.jsx.
 * La card es SIEMPRE oscura → colores fijos on-dark.
 */
export function MobileFocusList({
  items,
  kpi,
  agenda,
  expiringPrograms,
  onAdherencePress,
}: {
  items: MobileRiskAlertItem[]
  kpi: MobileKpiSummary
  agenda: MobileAgendaItem[]
  expiringPrograms: MobileExpiringProgramItem[]
  onAdherencePress: () => void
}) {
  const router = useRouter()
  const { theme, resolvedScheme } = useTheme()
  const sport = deriveSportTokens(theme.primary)
  const sport400 = sport.ramp['400']
  const hasRisk = items.length > 0
  const riesgoCount = items.length
  const nba = resolveMobileNextBestAction({ kpi, topRiskClients: items, agenda, expiringPrograms })

  function handleNba() {
    if (nba.id === 'programas-vencidos') {
      router.push('/coach/(tabs)/builder')
    } else if (nba.id === 'focus-list') {
      const first = items[0]
      if (first) router.push(`/coach/cliente/${first.clientId}`)
    } else if (nba.id === 'adherencia-baja') {
      onAdherencePress()
    } else if (nba.id === 'agenda-hoy') {
      const first = agenda[0]
      if (first) router.push(`/coach/cliente/${first.clientId}`)
    } else {
      router.push('/coach/(tabs)/clientes')
    }
  }

  return (
    <Card variant="inverse" padding="md" radius="card" style={{ overflow: 'hidden' }}>
      <LinearGradient
        pointerEvents="none"
        colors={resolvedScheme === 'dark' ? ['#14191F', '#0E1117'] : ['#12161D', '#0B0E13']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="font-sans-extra uppercase text-[11px] tracking-[0.88px] text-sport-400">
          Prioridad de hoy
        </Text>
        <View
          className="rounded-pill px-2 py-0.5"
          style={{ backgroundColor: hasRisk ? theme.destructive : theme.success }}
        >
          <Text className="font-sans-extra text-[11px]" style={{ color: '#0B0E13' }}>
            {riesgoCount}
          </Text>
        </View>
      </View>

      {!hasRisk ? (
        <View className="flex-row items-center px-0 pb-2.5 pt-1" style={{ gap: 11 }}>
          <View
            className="h-[38px] w-[38px] items-center justify-center rounded-pill"
            style={{ backgroundColor: 'rgba(31,184,119,0.16)' }}
          >
            <CheckCircle2 size={20} color="#4FD9A0" />
          </View>
          <View className="flex-1">
            <Text className="font-sans-extra text-[15px] text-on-dark">Ningún alumno en riesgo</Text>
            <Text className="font-sans text-[12.5px] text-on-dark-muted">Todo al día. Buen trabajo.</Text>
          </View>
        </View>
      ) : (
        <>
          <Text
            className="font-display-black text-[20px] text-on-dark"
            style={{ lineHeight: 22.4, letterSpacing: -0.4, marginBottom: 14 }}
          >
            {riesgoCount} {riesgoCount === 1 ? 'alumno necesita' : 'alumnos necesitan'} tu atención
          </Text>
          <View>
            {items.map((item, index) => {
              const band = focusRiskBand(item.attentionScore)
              const flagLabel = FOCUS_FLAG_LABEL[item.flags?.[0] ?? ''] ?? item.label
              return (
                <TouchableOpacity
                  key={item.clientId}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/coach/cliente/${item.clientId}`)}
                  className="flex-row items-center gap-3 py-2.5"
                  style={
                    index > 0
                      ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.10)' }
                      : undefined
                  }
                >
                  <Avatar name={item.clientName} size="sm" />
                  <View className="flex-1" style={{ minWidth: 0 }}>
                    <Text className="font-sans-bold text-[14px] text-on-dark" numberOfLines={1}>
                      {item.clientName}
                    </Text>
                    <Text className="font-sans text-[12px] text-on-dark-muted" numberOfLines={1}>
                      {flagLabel}
                    </Text>
                  </View>
                  <View className="items-end" style={{ gap: 2 }}>
                    <View className="flex-row items-center" style={{ gap: 5 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: band.color }} />
                      <Text className="font-sans-bold text-[11px]" style={{ color: band.color }} numberOfLines={1}>
                        {band.label}
                      </Text>
                    </View>
                    <Text className="font-mono-bold text-[12px] text-on-dark">
                      {item.attentionScore}
                      <Text className="text-on-dark-muted">/100</Text>
                    </Text>
                  </View>
                  <ChevronRight size={17} color="#5A6573" />
                </TouchableOpacity>
              )
            })}
          </View>

          {/* NextStepInset embebido (1:1 con PriorityCard.tsx): icono por tono en
              circulo + eyebrow "Tu próximo paso" + titulo + CTA con flecha, radius 10. */}
          {(() => {
            const acc = nba.tone === 'warn' ? '#FFC861' : nba.tone === 'positive' ? '#4FD9A0' : '#7FB0FF'
            const NbaIcon =
              nba.id === 'programas-vencidos' ? CalendarX
              : nba.id === 'focus-list' ? OctagonAlert
              : nba.id === 'adherencia-baja' ? Activity
              : nba.id === 'mrr-cayendo' ? TrendingDown
              : nba.id === 'agenda-hoy' ? CalendarClock
              : CheckCircle2
            return (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleNba}
                className="mt-3 w-full flex-row items-center px-3 py-[11px]"
                style={{ gap: 11, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }}
              >
                <View className="h-8 w-8 items-center justify-center rounded-pill" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                  <NbaIcon size={16} color={acc} />
                </View>
                <View className="flex-1" style={{ minWidth: 0 }}>
                  <Text className="font-sans-extra text-[10px] uppercase" style={{ color: acc, letterSpacing: 0.7 }} numberOfLines={1}>
                    Tu próximo paso
                  </Text>
                  <Text className="font-sans-bold text-[13.5px] text-on-dark" style={{ marginTop: 1 }} numberOfLines={1}>
                    {nba.title}
                  </Text>
                </View>
                <View className="flex-row items-center" style={{ gap: 3 }}>
                  <Text className="font-sans-extra text-[12px]" style={{ color: acc }} numberOfLines={1}>
                    {nba.ctaLabel}
                  </Text>
                  <ArrowRight size={13} color={acc} />
                </View>
              </TouchableOpacity>
            )
          })()}

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push('/coach/(tabs)/clientes')}
            className="mt-[9px] h-9 flex-row items-center justify-center gap-1"
          >
            <Text className="font-sans-extra text-[13px] text-sport-400">Ver todos en Alumnos</Text>
            <ArrowRight size={14} color={sport400} />
          </TouchableOpacity>
        </>
      )}
    </Card>
  )
}

type MobileNextAction = {
  id: string
  title: string
  description: string
  ctaLabel: string
  tone: 'info' | 'warn' | 'positive'
}

function resolveMobileNextBestAction({
  kpi,
  topRiskClients,
  agenda,
  expiringPrograms,
}: {
  kpi: MobileKpiSummary
  topRiskClients: MobileRiskAlertItem[]
  agenda: MobileAgendaItem[]
  expiringPrograms: MobileExpiringProgramItem[]
}): MobileNextAction {
  const overdueExpiring = expiringPrograms.filter((program) => program.daysLeft <= 0)
  if (overdueExpiring.length > 0) {
    return {
      id: 'programas-vencidos',
      title: `${overdueExpiring.length} programa${overdueExpiring.length === 1 ? '' : 's'} vencido${overdueExpiring.length === 1 ? '' : 's'}`,
      description: 'Renueva para que tus alumnos no pierdan continuidad.',
      ctaLabel: 'Revisar programas',
      tone: 'warn',
    }
  }

  if (topRiskClients.length >= 3) {
    return {
      id: 'focus-list',
      title: `${topRiskClients.length} alumnos en riesgo`,
      description: 'Prioriza a quienes estan sin check-in o sin ejercicio esta semana.',
      ctaLabel: 'Ver focus list',
      tone: 'warn',
    }
  }

  if (kpi.avgAdherence < 60) {
    return {
      id: 'adherencia-baja',
      title: 'Adherencia promedio < 60%',
      description: 'Revisa patrones de abandono y ajusta cargas o frecuencia.',
      ctaLabel: 'Ver detalle',
      tone: 'warn',
    }
  }

  if (kpi.mrrDeltaPct <= -10) {
    return {
      id: 'mrr-cayendo',
      title: `MRR ${kpi.mrrDeltaPct}% vs mes anterior`,
      description: 'Activa un programa de referidos o revisa renovaciones.',
      ctaLabel: 'Ir a facturacion',
      tone: 'warn',
    }
  }

  if (agenda.length > 0) {
    return {
      id: 'agenda-hoy',
      title: `${agenda.length} pendientes hoy`,
      description: 'Cierra los check-ins y recordatorios pendientes.',
      ctaLabel: 'Ver agenda',
      tone: 'info',
    }
  }

  return {
    id: 'todo-ok',
    title: 'Todo bajo control',
    description: 'Buen momento para planificar la semana o revisar progresos.',
    ctaLabel: 'Ver alumnos',
    tone: 'positive',
  }
}

export function MobileNextBestAction({
  kpi,
  topRiskClients,
  agenda,
  expiringPrograms,
  onAdherencePress,
  onRevenuePress,
}: {
  kpi: MobileKpiSummary
  topRiskClients: MobileRiskAlertItem[]
  agenda: MobileAgendaItem[]
  expiringPrograms: MobileExpiringProgramItem[]
  onAdherencePress: () => void
  onRevenuePress: () => void
}) {
  const router = useRouter()
  const { theme } = useTheme()
  const action = resolveMobileNextBestAction({ kpi, topRiskClients, agenda, expiringPrograms })
  const toneColor = action.tone === 'warn' ? '#F59E0B' : action.tone === 'positive' ? '#10B981' : theme.primary

  function handlePress() {
    if (action.id === 'programas-vencidos') {
      router.push('/coach/(tabs)/builder')
      return
    }
    if (action.id === 'focus-list') {
      const first = topRiskClients[0]
      if (first) router.push(`/coach/cliente/${first.clientId}`)
      return
    }
    if (action.id === 'adherencia-baja') {
      onAdherencePress()
      return
    }
    if (action.id === 'mrr-cayendo') {
      onRevenuePress()
      return
    }
    if (action.id === 'agenda-hoy') {
      const first = agenda[0]
      if (first) router.push(`/coach/cliente/${first.clientId}`)
      return
    }
    router.push('/coach/(tabs)/clientes')
  }

  return (
    <Card variant="default" padding="md" radius="card" style={{ gap: 10 }}>
      <View className="flex-row items-center gap-2">
        <Sparkles size={17} color={toneColor} />
        <Text className="font-sans-bold uppercase text-[10px] tracking-[1.5px] text-muted">
          PROXIMA ACCION
        </Text>
      </View>
      <Text className="font-display-bold text-[20px] text-strong" style={{ lineHeight: 24 }}>
        {action.title}
      </Text>
      <Text className="font-sans text-[13px] text-muted" style={{ lineHeight: 19 }}>
        {action.description}
      </Text>
      <Button
        label={action.ctaLabel}
        variant="sport"
        size="sm"
        rightIcon={ArrowRight}
        onPress={handlePress}
        style={{ alignSelf: 'flex-start' }}
      />
    </Card>
  )
}

export function MobileTodayAgenda({ items }: { items: MobileAgendaItem[] }) {
  const router = useRouter()
  const { theme } = useTheme()

  return (
    <View style={{ gap: 10 }}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <CalendarClock size={16} color={theme.primary} />
          <Text className="font-display-black text-[18px] text-strong">Agenda de hoy</Text>
        </View>
        <Text className="font-sans text-[12px] text-muted">0 de {items.length} hechas</Text>
      </View>
      {items.length === 0 ? (
        <Card padding="md" radius="card">
          <EmptyPanel icon={<CheckCircle2 size={25} color={theme.success} />} title="Todo cerrado" subtitle="Sin pendientes en el día." />
        </Card>
      ) : (
        <Card padding="none" radius="card" style={{ overflow: 'hidden' }}>
          {items.map((item, index) => {
            const startMinutes = 9 * 60 + index * 90
            const slot = `${String(Math.floor(startMinutes / 60) % 24).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`
            const AgendaIcon = item.kind === 'programa_vence'
              ? CalendarClock
              : item.kind === 'checkin_pendiente'
                ? ClipboardCheck
                : item.kind === 'sin_ejercicio'
                  ? Dumbbell
                  : Calendar
            return (
            <View key={item.id}>
              {index > 0 ? (
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginHorizontal: 14 }} />
              ) : null}
              <ListRow
                leading={
                  <View style={{ width: 86, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text style={{ width: 42, color: theme.mutedForeground, fontFamily: FONT.monoBold, fontSize: 12, fontVariant: ['tabular-nums'] }}>{slot}</Text>
                    <View className="h-8 w-8 items-center justify-center rounded-pill" style={{ backgroundColor: theme.muted }}>
                      <AgendaIcon size={15} color={theme.foreground} />
                    </View>
                  </View>
                }
                title={item.clientName}
                subtitle={item.label}
                showChevron
                onPress={() => router.push(`/coach/cliente/${item.clientId}`)}
              />
            </View>
            )
          })}
        </Card>
      )}
    </View>
  )
}

export function MobileExpiringPrograms({ items }: { items: MobileExpiringProgramItem[] }) {
  const router = useRouter()
  const { theme } = useTheme()

  return (
    <View style={{ gap: 10 }}>
      <View className="flex-row items-center gap-2">
        <Clock size={17} color="#F59E0B" />
        <Text className="font-display-bold text-[17px] text-strong">Programas por vencer</Text>
      </View>
      {items.length === 0 ? (
        <Card padding="md" radius="card">
          <Text className="font-sans text-[12px] text-muted" style={{ textAlign: 'center' }}>
            Sin programas vencidos ni por vencer.
          </Text>
        </Card>
      ) : (
        <Card padding="none" radius="card" style={{ overflow: 'hidden' }}>
          {items.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? (
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginHorizontal: 14 }} />
              ) : null}
              <ListRow
                title={item.clientName}
                subtitle={item.name}
                trailing={
                  <Badge tone={item.daysLeft <= 0 ? 'danger' : 'warning'} variant="soft" size="sm">
                    {item.daysLeft <= 0 ? 'Vencido' : `${item.daysLeft}d`}
                  </Badge>
                }
                showChevron
                onPress={() =>
                  item.clientId
                    ? router.push(`/coach/cliente/${item.clientId}`)
                    : router.push('/coach/(tabs)/builder')
                }
              />
            </View>
          ))}
        </Card>
      )}
    </View>
  )
}

function ActivityTypeIcon({ type, size, color }: { type: MobileActivityItem['type']; size: number; color: string }) {
  if (type === 'nuevo alumno') return <UserPlus size={size} color={color} />
  if (type === 'check-in') return <CheckCircle2 size={size} color={color} />
  return <Dumbbell size={size} color={color} />
}

// Tonos de actividad [bg, fg] — espejo 1:1 del ACT_TONE web (sport / success / ember).
// Scheme-aware porque los tokens -100/-600/-700 divergen por tema en globals.css.
function activityTone(type: MobileActivityItem['type'], scheme: 'light' | 'dark'): [string, string] {
  const dark = scheme === 'dark'
  if (type === 'nuevo alumno') return dark ? ['rgba(38,128,255,0.20)', '#7FB0FF'] : ['#E8F1FF', '#1462DC']
  if (type === 'check-in') return dark ? ['rgba(31,184,119,0.18)', '#4FD9A0'] : ['#DBF5EA', '#0F7D50']
  return dark ? ['rgba(255,106,61,0.20)', '#FFB79E'] : ['#FFEDE6', '#C23E14']
}

export function MobileActivityFeed({ items }: { items: MobileActivityItem[] }) {
  const router = useRouter()
  const { theme, resolvedScheme } = useTheme()

  return (
    <View style={{ gap: 10 }}>
      <View className="flex-row items-center gap-2">
        <Activity size={17} color={theme.primary} />
        <Text className="font-display-bold text-[17px] text-strong">Actividad reciente</Text>
      </View>
      {items.length === 0 ? (
        <Card padding="md" radius="card">
          <Text className="font-sans text-[12px] text-muted" style={{ textAlign: 'center' }}>
            Sin actividad reciente.
          </Text>
        </Card>
      ) : (
        <Card padding="none" radius="card" style={{ overflow: 'hidden' }}>
          {items.map((item, index) => {
            const [toneBg, toneFg] = activityTone(item.type, resolvedScheme)
            return (
              <View key={item.id}>
                {index > 0 ? (
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginHorizontal: 14 }} />
                ) : null}
                <ListRow
                  leading={
                    item.type === 'check-in' && item.photoUrl ? (
                      <Image
                        source={{ uri: item.photoUrl }}
                        style={{ width: 38, height: 38, borderRadius: 12 }}
                        contentFit="cover"
                        transition={200}
                      />
                    ) : (
                      <View
                        className="h-8 w-8 items-center justify-center rounded-pill"
                        style={{ backgroundColor: toneBg }}
                      >
                        <ActivityTypeIcon type={item.type} size={16} color={toneFg} />
                      </View>
                    )
                  }
                  title={item.title}
                  subtitle={item.subtitle}
                  trailing={<Text className="font-sans text-[11px] text-muted">{timeAgo(item.date)}</Text>}
                  disabled={!item.clientId}
                  onPress={item.clientId ? () => router.push(`/coach/cliente/${item.clientId}`) : undefined}
                />
              </View>
            )
          })}
        </Card>
      )}
    </View>
  )
}

type NovedadesFilter = 'todos' | 'pendientes' | 'revisados'

/** `reviewed` llega en el shape V2 (E5-15): check-ins con `reviewed_at != null`. Se lee defensivo. */
function activityReviewed(it: MobileActivityItem): boolean {
  return Boolean(it.reviewed)
}

/**
 * Novedades (NewsFeed) — programas por vencer + actividad reciente en una sola card,
 * con la cola de check-ins encima: badge "por revisar" (ember) + filtro segmentado
 * (Todos / Por revisar / Revisados) que aparece SOLO si hay check-ins y acota el feed
 * client-side por estado. 1:1 con NewsFeed.tsx (web). El badge usa el conteo server-side
 * `pendingCheckins` (ventana del feed, misma semantica que DashboardV2Data.pendingCheckinsCount);
 * el filtro/senal por fila usan `reviewed` del propio item.
 */
export function MobileNovedades({
  expiringPrograms,
  activities,
  pendingCheckins: pendingCheckinsProp,
}: {
  expiringPrograms: MobileExpiringProgramItem[]
  activities: MobileActivityItem[]
  /** Conteo server-side de check-ins por revisar (V2). Fallback: derivado de `activities`. */
  pendingCheckins?: number
}) {
  const router = useRouter()
  const { theme, resolvedScheme } = useTheme()
  const [filter, setFilter] = useState<NovedadesFilter>('todos')

  const hasCheckins = activities.some((a) => a.type === 'check-in')
  const pendingCheckins =
    pendingCheckinsProp ?? activities.filter((a) => a.type === 'check-in' && !activityReviewed(a)).length

  // "todos" = programas + toda la actividad; estados de cola = solo check-ins del estado.
  const showPrograms = filter === 'todos'
  const shownActivities =
    filter === 'todos'
      ? activities
      : activities.filter((a) => a.type === 'check-in' && activityReviewed(a) === (filter === 'revisados'))
  const isEmpty = (showPrograms ? expiringPrograms.length : 0) + shownActivities.length === 0
  const emptyCopy =
    filter === 'pendientes'
      ? 'Todo al día. Sin check-ins por revisar.'
      : filter === 'revisados'
        ? 'Aún no marcas check-ins como revisados.'
        : 'Sin novedades por ahora.'

  let rowIndex = -1
  function Divider({ index }: { index: number }) {
    if (index <= 0) return null
    return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginHorizontal: 14 }} />
  }

  return (
    <View style={{ gap: 10 }}>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <Text className="font-display-bold text-[17px] text-strong">Novedades</Text>
        {pendingCheckins > 0 ? (
          <Badge tone="ember" variant="soft" size="sm">
            {`${pendingCheckins > 9 ? '9+' : pendingCheckins} por revisar`}
          </Badge>
        ) : null}
      </View>

      {hasCheckins ? (
        <SegmentedTabs
          size="sm"
          value={filter}
          onChange={(v) => setFilter(v)}
          items={[
            { value: 'todos', label: 'Todos' },
            { value: 'pendientes', label: 'Por revisar' },
            { value: 'revisados', label: 'Revisados' },
          ]}
        />
      ) : null}

      {isEmpty ? (
        <Card padding="md" radius="card">
          <Text className="font-sans text-[12px] text-muted" style={{ textAlign: 'center' }}>
            {emptyCopy}
          </Text>
        </Card>
      ) : (
        <Card padding="none" radius="card" style={{ overflow: 'hidden' }}>
          {showPrograms
            ? expiringPrograms.map((it) => {
                rowIndex += 1
                const expired = it.daysLeft <= 0
                const urgent = expired || it.daysLeft <= 2
                const progDark = resolvedScheme === 'dark'
                // bg = danger-100 / warning-100 (token solido); fg = danger-600 / warning-600 (1:1 con ProgramRow web).
                const progBg = urgent
                  ? (progDark ? 'rgba(244,54,90,0.18)' : '#FCDDE4')
                  : (progDark ? 'rgba(245,165,36,0.18)' : '#FDEFD3')
                const progFg = urgent
                  ? (progDark ? '#FF7C97' : '#BE183C')
                  : (progDark ? '#FFC861' : '#A8690A')
                return (
                  <View key={`prog-${it.id}`}>
                    <Divider index={rowIndex} />
                    <TouchableOpacity
                      activeOpacity={0.82}
                      testID={`novedades-program-${it.id}`}
                      onPress={() =>
                        it.clientId
                          ? router.push(`/coach/cliente/${it.clientId}`)
                          : router.push('/coach/(tabs)/builder')
                      }
                      className="flex-row items-center gap-3 px-[14px] py-[11px]"
                    >
                      <View
                        className="h-[34px] w-[34px] items-center justify-center rounded-pill"
                        style={{ backgroundColor: progBg }}
                      >
                        <CalendarClock size={16} color={progFg} />
                      </View>
                      <View className="flex-1" style={{ minWidth: 0 }}>
                        <Text className="font-sans text-[13.5px] text-body" numberOfLines={1}>
                          Plan de <Text className="font-sans-bold text-strong">{it.clientName}</Text>{' '}
                          {expired ? 'venció' : 'vence pronto'}
                        </Text>
                        <Text className="font-sans text-[12px] text-muted" numberOfLines={1}>
                          {it.name}
                        </Text>
                      </View>
                      <Badge tone={urgent ? 'danger' : 'warning'} variant="soft" size="sm">
                        {expired ? 'Vencido' : `${it.daysLeft} días`}
                      </Badge>
                    </TouchableOpacity>
                  </View>
                )
              })
            : null}
          {shownActivities.map((it) => {
            rowIndex += 1
            const [toneBg, toneFg] = activityTone(it.type, resolvedScheme)
            const isCheckin = it.type === 'check-in'
            const reviewed = activityReviewed(it)
            return (
              <View key={`act-${it.id}`}>
                <Divider index={rowIndex} />
                <TouchableOpacity
                  testID={`novedades-activity-${it.id}`}
                  activeOpacity={0.82}
                  disabled={!it.clientId}
                  onPress={it.clientId ? () => router.push(`/coach/cliente/${it.clientId}`) : undefined}
                  className="flex-row items-center gap-3 px-[14px] py-[11px]"
                >
                  {isCheckin && it.photoUrl ? (
                      <Image
                        source={{ uri: it.photoUrl }}
                        style={{ width: 34, height: 34, borderRadius: 17 }}
                        contentFit="cover"
                        transition={200}
                      />
                    ) : (
                      <View
                        className="h-[34px] w-[34px] items-center justify-center rounded-pill"
                        style={{ backgroundColor: toneBg }}
                      >
                        <ActivityTypeIcon type={it.type} size={16} color={toneFg} />
                      </View>
                    )}
                  <Text className="min-w-0 flex-1 font-sans-bold text-[13.5px] text-strong" numberOfLines={1}>
                    {it.title}
                  </Text>
                  {isCheckin ? (
                    reviewed ? (
                      <CheckCircle2 size={16} color={resolvedScheme === 'dark' ? '#4FD9A0' : '#0F7D50'} />
                    ) : (
                      <View className="h-2 w-2 rounded-pill bg-ember-500" />
                    )
                  ) : null}
                  <Text className="font-sans text-[11.5px] text-subtle">{timeAgo(it.date)}</Text>
                </TouchableOpacity>
              </View>
            )
          })}
        </Card>
      )}
    </View>
  )
}

export function MobileDashboardCharts({ areaData, barData }: { areaData: MobileChartPoint[]; barData: MobileChartPoint[] }) {
  return (
    <View style={styles.chartsGrid}>
      <MobileSessionsChart data={areaData} />
      <MobileGrowthChart data={barData} />
    </View>
  )
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const INTER_FONT = require('@expo-google-fonts/hanken-grotesk/HankenGrotesk_400Regular.ttf')

// Touch tooltip (Skia, UI-thread) — dot + value where the user presses the chart.
function ChartTooltip({ xPos, yPos, value, color, font }: {
  xPos: SharedValue<number>
  yPos: SharedValue<number>
  value: SharedValue<number>
  color: string
  font: ReturnType<typeof useFont>
}) {
  const label = useDerivedValue(() => `${Math.round(value.value)}`)
  const tx = useDerivedValue(() => xPos.value + 8)
  const ty = useDerivedValue(() => yPos.value - 10)
  return (
    <>
      <Circle cx={xPos} cy={yPos} r={5} color={color} />
      {font ? <SkiaText x={tx} y={ty} text={label} font={font} color={color} /> : null}
    </>
  )
}

function MobileSessionsChart({ data }: { data: MobileChartPoint[] }) {
  const { theme } = useTheme()
  const glass = useGlassStyle()
  const font = useFont(INTER_FONT, 9)
  const { state, isActive } = useChartPressState({ x: '', y: { sesiones: 0 } })
  const chartData = data.length > 0 ? data : [{ name: '-', sesiones: 0 }]

  return (
    <View style={[styles.chartCard, glass, { borderRadius: theme.radius.xl }]}>
      <CardGlass />
      <View style={styles.chartHeader}>
        <View style={[styles.chartIcon, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
          <TrendingUp size={16} color="#3B82F6" />
        </View>
        <Text style={[styles.chartTitle, { color: theme.foreground, fontFamily: FONT.uiBold }]}>
          SESIONES 30 DIAS
        </Text>
      </View>
      <View style={styles.chartCanvas}>
        {data.length === 0 ? (
          <View style={styles.chartEmpty}>
            <TrendingUp size={30} color={theme.mutedForeground} opacity={0.25} />
            <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Sin sesiones registradas en los ultimos 30 dias
            </Text>
          </View>
        ) : (
          <CartesianChart
            data={chartData}
            xKey="name"
            yKeys={['sesiones']}
            domainPadding={{ left: 10, right: 10, top: 20 }}
            axisOptions={{ font, tickCount: 4, labelColor: theme.mutedForeground }}
            chartPressState={state}
          >
            {({ points, chartBounds }) => (
              <>
                <Area
                  points={points.sesiones}
                  y0={chartBounds.bottom}
                  color="#3B82F6"
                  opacity={0.22}
                  animate={{ type: 'timing', duration: 400 }}
                />
                <Line
                  points={points.sesiones}
                  color="#3B82F6"
                  strokeWidth={2.5}
                  animate={{ type: 'timing', duration: 400 }}
                />
                {isActive ? (
                  <ChartTooltip xPos={state.x.position} yPos={state.y.sesiones.position} value={state.y.sesiones.value} color="#3B82F6" font={font} />
                ) : null}
              </>
            )}
          </CartesianChart>
        )}
      </View>
    </View>
  )
}

function MobileGrowthChart({ data }: { data: MobileChartPoint[] }) {
  const { theme } = useTheme()
  const glass = useGlassStyle()
  const font = useFont(INTER_FONT, 9)
  const { state, isActive } = useChartPressState({ x: '', y: { alumnos: 0 } })
  const chartData = data.length > 0 ? data : [{ name: '-', alumnos: 0 }]

  return (
    <View style={[styles.chartCard, glass, { borderRadius: theme.radius.xl }]}>
      <CardGlass />
      <View style={styles.chartHeader}>
        <View style={[styles.chartIcon, { backgroundColor: 'rgba(34,211,238,0.12)' }]}>
          <Activity size={16} color="#22D3EE" />
        </View>
        <Text style={[styles.chartTitle, { color: theme.foreground, fontFamily: FONT.uiBold }]}>
          CRECIMIENTO DE ALUMNOS
        </Text>
      </View>
      <View style={styles.chartCanvas}>
        {data.length === 0 ? (
          <View style={styles.chartEmpty}>
            <Activity size={30} color={theme.mutedForeground} opacity={0.25} />
            <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Sin datos de crecimiento registrados
            </Text>
          </View>
        ) : (
          <CartesianChart
            data={chartData}
            xKey="name"
            yKeys={['alumnos']}
            domainPadding={{ left: 14, right: 14, top: 20 }}
            axisOptions={{ font, tickCount: 6, labelColor: theme.mutedForeground }}
            chartPressState={state}
          >
            {({ points, chartBounds }) => (
              <>
                <Bar
                  points={points.alumnos}
                  chartBounds={chartBounds}
                  color="#22D3EE"
                  roundedCorners={{ topLeft: 5, topRight: 5 }}
                  animate={{ type: 'timing', duration: 400 }}
                />
                {isActive ? (
                  <ChartTooltip xPos={state.x.position} yPos={state.y.alumnos.position} value={state.y.alumnos.value} color="#22D3EE" font={font} />
                ) : null}
              </>
            )}
          </CartesianChart>
        )}
      </View>
    </View>
  )
}

export function MobileRevenueSheet({
  open,
  onClose,
  kpi,
  clientPaymentSummary,
}: {
  open: boolean
  onClose: () => void
  kpi: MobileKpiSummary
  clientPaymentSummary: MobileClientPaymentSummary[]
}) {
  const router = useRouter()
  const { theme } = useTheme()
  const deltaPct = kpi.mrrDeltaPct
  const DeltaIcon = deltaPct > 0 ? TrendingUp : deltaPct < 0 ? TrendingDown : Minus
  const deltaColor = deltaPct > 0 ? '#10B981' : deltaPct < 0 ? theme.destructive : theme.mutedForeground

  return (
    <NativeDialog open={open} title="Panel de ingresos" onClose={onClose}>
      <View style={styles.revenueSheet}>
        <View style={styles.revenueHeader}>
          <Text style={[styles.revenueAmount, { color: theme.foreground, fontFamily: FONT.displayBold }]}>
            {formatCurrency(kpi.mrrCurrentMonth)}
          </Text>
          <View style={styles.revenueDelta}>
            <DeltaIcon size={16} color={deltaColor} />
            <Text style={[styles.revenueDeltaText, { color: deltaColor, fontFamily: FONT.uiBold }]}>
              {deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%
            </Text>
          </View>
        </View>
        <Text style={[styles.revenueHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Mes anterior: {formatCurrency(kpi.mrrPreviousMonth)}
        </Text>

        {clientPaymentSummary.length === 0 ? (
          <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Sin datos de pagos registrados.
          </Text>
        ) : (
          <ScrollView style={styles.revenueList} nestedScrollEnabled>
            {clientPaymentSummary.map((client, index) => (
              <TouchableOpacity
                key={client.clientId}
                activeOpacity={0.78}
                onPress={() => {
                  onClose()
                  router.push(`/coach/cliente/${client.clientId}`)
                }}
                style={[
                  styles.revenueRow,
                  index < clientPaymentSummary.length - 1 && {
                    borderBottomColor: theme.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <View style={styles.rowCopy}>
                  <View style={styles.revenueNameRow}>
                    <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: FONT.uiBold }]} numberOfLines={1}>
                      {client.clientName}
                    </Text>
                    <ArrowUpRight size={13} color={theme.mutedForeground} />
                  </View>
                  <Text style={[styles.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={2}>
                    {client.lastPaymentDate
                      ? `Ultimo pago: ${formatDateES(client.lastPaymentDate)}${client.lastPaymentAmount != null ? ` · ${formatCurrency(client.lastPaymentAmount)}` : ''}`
                      : 'Sin pagos registrados'}
                    {client.nextRenewalDate ? ` · Renovacion: ${formatDateES(client.nextRenewalDate)}` : ''}
                  </Text>
                </View>
                <PaymentStatusBadge hasRecentPayment={client.hasRecentPayment} hasAnyPayment={client.lastPaymentDate != null} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </NativeDialog>
  )
}

function clientStatsColor(pct: number, theme: ReturnType<typeof useTheme>['theme']): string {
  if (pct >= 75) return theme.primary
  if (pct >= 50) return WARNING_500
  return theme.destructive
}

export function MobileClientStatsSheet({
  open,
  onClose,
  clientStats,
}: {
  open: boolean
  onClose: () => void
  clientStats: MobileClientStats[]
}) {
  const router = useRouter()
  const { theme } = useTheme()
  const [tab, setTab] = useState<'adherence' | 'nutrition'>('adherence')
  const rows = clientStats.filter((client) =>
    tab === 'adherence' ? client.hasAdherenceData : client.hasNutritionData,
  )
  const sorted = [...rows].sort((a, b) => {
    const av = tab === 'adherence' ? a.adherencePct : a.nutritionPct
    const bv = tab === 'adherence' ? b.adherencePct : b.nutritionPct
    return av - bv
  })
  const avg = sorted.length
    ? Math.round(
        sorted.reduce(
          (total, client) => total + (tab === 'adherence' ? client.adherencePct : client.nutritionPct),
          0,
        ) / sorted.length,
      )
    : 0

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      snapPoints={['88%']}
      showHandle={false}
      showCloseButton={false}
      accessibilityLabel="Detalle por alumno"
    >
      <View style={{ marginHorizontal: -2 }}>
        <View className="mx-auto mb-3.5 h-1 w-[38px] rounded-pill bg-ink-200" />
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="font-display-extra text-[19px] text-strong">Detalle por alumno</Text>
          <Text
            className="font-display-extra text-[20px]"
            style={{ color: clientStatsColor(avg, theme), fontVariant: ['tabular-nums'] }}
          >
            {avg}%
          </Text>
        </View>

        <View className="mb-3.5 flex-row gap-[2px] rounded-control bg-surface-sunken p-[3px]">
          {([
            ['adherence', 'Adherencia'],
            ['nutrition', 'Nutrición'],
          ] as const).map(([key, label]) => {
            const active = tab === key
            return (
              <TouchableOpacity
                key={key}
                activeOpacity={0.82}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setTab(key)}
                className={`h-9 flex-1 items-center justify-center rounded-control ${active ? 'bg-surface-card' : 'bg-transparent'}`}
                style={active ? shadow('xs', theme.scheme) : undefined}
              >
                <Text className={`font-sans-bold text-[13.5px] ${active ? 'text-strong' : 'text-subtle'}`}>
                  {label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <Text className="mb-2.5 font-sans text-[11.5px] text-subtle">
          Ordenado por menor cumplimiento — los que necesitan ayuda primero.
        </Text>

        {sorted.length === 0 ? (
          <Text className="py-8 text-center font-sans text-sm text-muted">Sin datos.</Text>
        ) : (
          <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 2 }}>
              {sorted.map((client) => {
                const pct = tab === 'adherence' ? client.adherencePct : client.nutritionPct
                const hint = tab === 'adherence' ? client.adherenceHint : client.nutritionHint
                const color = clientStatsColor(pct, theme)
                return (
                  <TouchableOpacity
                    key={client.clientId}
                    activeOpacity={0.82}
                    onPress={() => {
                      onClose()
                      router.push(`/coach/cliente/${client.clientId}`)
                    }}
                    className="flex-row items-center gap-3 px-1 py-2.5"
                  >
                    <View className="h-[34px] w-[34px] shrink-0 items-center justify-center rounded-pill bg-ink-900">
                      <Text className="font-display-extra text-sm text-sport-400">
                        {client.clientName.charAt(0)}
                      </Text>
                    </View>
                    <View className="min-w-0 flex-1">
                      <View className="mb-[5px] flex-row items-baseline justify-between">
                        <Text className="flex-1 font-sans-bold text-[13.5px] text-strong" numberOfLines={1}>
                          {client.clientName}
                        </Text>
                        <Text
                          className="ml-2 shrink-0 text-[12.5px]"
                          style={{ color, fontFamily: FONT.monoBold, fontVariant: ['tabular-nums'] }}
                        >
                          {pct}%
                        </Text>
                      </View>
                      <View className="h-[5px] w-full overflow-hidden rounded-pill bg-track">
                        <View
                          className="h-full rounded-pill"
                          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }}
                        />
                      </View>
                      <Text className="mt-1 font-sans text-[11px] text-subtle" numberOfLines={1}>
                        {hint}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          </ScrollView>
        )}
      </View>
    </Sheet>
  )
}

function PaymentStatusBadge({ hasRecentPayment, hasAnyPayment }: { hasRecentPayment: boolean; hasAnyPayment: boolean }) {
  const { theme } = useTheme()
  const label = !hasAnyPayment ? 'Sin pago' : hasRecentPayment ? 'Al dia' : 'Vencido'
  const color = !hasAnyPayment ? theme.mutedForeground : hasRecentPayment ? '#10B981' : '#F59E0B'
  return (
    <View style={[styles.paymentBadge, { borderColor: hexToRgba(color, 0.42), backgroundColor: hexToRgba(color, 0.12) }]}>
      <Text style={[styles.paymentBadgeText, { color, fontFamily: FONT.uiBold }]}>{label}</Text>
    </View>
  )
}

function EmptyPanel({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  const { theme } = useTheme()
  return (
    <View style={styles.emptyPanel}>
      {icon}
      <Text style={[styles.emptyTitle, { color: theme.foreground, fontFamily: FONT.uiBold }]}>
        {title}
      </Text>
      <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {subtitle}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  greeting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: 14,
  },
  workspaceCaret: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  bannerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 10,
  },
  bannerText: {
    fontSize: 13,
    lineHeight: 19,
  },
  bannerAction: {
    alignSelf: 'flex-start',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  tierStack: {
    gap: 8,
  },
  tierBanner: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  tierMain: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  tierTitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  tierSubtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
  tierAction: {
    flexShrink: 0,
    fontSize: 12,
  },
  usageTrack: {
    height: 6,
    width: '100%',
    borderRadius: 999,
    overflow: 'hidden',
  },
  usageFill: {
    height: '100%',
    borderRadius: 999,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  quickActionButton: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  quickActionShort: {
    fontSize: 13,
  },
  placeholderDialog: {
    gap: 16,
  },
  placeholderText: {
    fontSize: 14,
    lineHeight: 20,
  },
  publicCodeModal: {
    gap: 15,
  },
  publicCodeIntro: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  publicCodeIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publicCodeBox: {
    borderWidth: 1,
    padding: 12,
    gap: 9,
  },
  publicCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  publicCodeValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
  },
  publicCodeCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  publicCodeCopyText: {
    fontSize: 12,
  },
  publicCodeActions: {
    flexDirection: 'row',
    gap: 10,
  },
  freeWelcome: {
    gap: 0,
    marginHorizontal: -18,
    marginVertical: -18,
  },
  freeWelcomeHero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  freeWelcomeIcon: {
    width: 64,
    height: 64,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  freeWelcomeTitle: {
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'center',
  },
  freeWelcomeSub: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  freeWelcomeSection: {
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 16,
  },
  freeWelcomeEyebrow: {
    fontSize: 10,
    letterSpacing: 1.3,
  },
  welcomeStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  welcomeStepIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  welcomeStepCopy: {
    flex: 1,
    gap: 2,
  },
  welcomeStepTitle: {
    fontSize: 14,
    lineHeight: 18,
  },
  welcomeStepSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  freePlanGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  freePlanItem: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  freePlanText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
  },
  freeWelcomeActions: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 8,
  },
  onboardingSkeleton: {
    minHeight: 120,
    borderWidth: 1,
    opacity: 0.55,
  },
  onboardingResume: {
    borderWidth: 1,
    padding: 14,
    gap: 12,
    overflow: 'hidden',
  },
  onboardingResumeText: {
    fontSize: 14,
    lineHeight: 20,
  },
  onboardingCard: {
    borderWidth: 1,
    padding: 14,
    gap: 13,
    overflow: 'hidden',
  },
  onboardingHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  onboardingHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  onboardingTitle: {
    fontSize: 20,
    lineHeight: 25,
  },
  onboardingDescription: {
    fontSize: 13,
    lineHeight: 19,
  },
  onboardingProgressBox: {
    alignItems: 'flex-end',
    gap: 4,
  },
  onboardingProgressValue: {
    fontSize: 25,
    lineHeight: 29,
  },
  onboardingProgressLabel: {
    fontSize: 9,
    letterSpacing: 1,
  },
  skipGuideButton: {
    minHeight: 34,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
  },
  skipGuideText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: FONT.uiBold,
  },
  onboardingFreeBox: {
    borderWidth: 1,
    padding: 12,
    gap: 9,
  },
  onboardingFreeTitle: {
    fontSize: 13,
    lineHeight: 17,
  },
  loopStrip: {
    borderWidth: 1,
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  loopStep: {
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  loopIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loopLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  twinPanels: {
    gap: 10,
  },
  twinPanel: {
    borderWidth: 1,
    padding: 13,
    gap: 8,
  },
  twinTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  twinTitle: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  twinText: {
    fontSize: 13,
    lineHeight: 19,
  },
  twinActions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 2,
  },
  twinButton: {
    flex: 1,
  },
  onboardingTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  onboardingFill: {
    height: '100%',
    borderRadius: 999,
  },
  onboardingCarousel: {
    gap: 10,
    paddingRight: 2,
  },
  carouselCard: {
    width: 126,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  carouselTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  carouselStep: {
    fontSize: 9,
    letterSpacing: 1.1,
  },
  carouselTitle: {
    fontSize: 14,
  },
  onboardingSteps: {
    gap: 10,
  },
  stepBlock: {
    borderWidth: 1,
    padding: 13,
    gap: 8,
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingDot: {
    width: 17,
    height: 17,
    borderRadius: 999,
    borderWidth: 1.5,
    opacity: 0.55,
  },
  stepTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
  },
  stepDescription: {
    paddingLeft: 25,
    fontSize: 12,
    lineHeight: 18,
  },
  stepActions: {
    paddingLeft: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stepButton: {
    flexGrow: 1,
  },
  nutritionBlock: {
    borderWidth: 1,
    padding: 13,
    gap: 6,
  },
  nutritionTitle: {
    fontSize: 15,
    lineHeight: 19,
  },
  nutritionText: {
    fontSize: 12,
    lineHeight: 18,
  },
  nutritionButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  activationReady: {
    borderWidth: 1,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderRadius: 14,
  },
  activationCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  activationTitle: {
    fontSize: 14,
  },
  activationText: {
    fontSize: 12,
    lineHeight: 17,
  },
  paymentForm: {
    gap: 12,
  },
  formError: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  formErrorText: {
    fontSize: 12,
    lineHeight: 16,
  },
  successBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  successCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  successTitle: {
    fontSize: 14,
    lineHeight: 18,
  },
  successText: {
    fontSize: 12,
    lineHeight: 17,
  },
  formField: {
    gap: 7,
  },
  formLabel: {
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  formInput: {
    minHeight: 44,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  clientPicker: {
    maxHeight: 132,
    borderWidth: 1,
  },
  clientOption: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  clientOptionText: {
    fontSize: 14,
  },
  clientEmpty: {
    padding: 12,
    fontSize: 13,
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 4,
  },
  formButton: {
    flex: 1,
  },
  checkboxRow: {
    minHeight: 50,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 17,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  greetingTitle: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: 0,
  },
  greetingSub: {
    fontSize: 14,
    lineHeight: 20,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiTouch: {
    width: '48.5%',
  },
  kpiCard: {
    flex: 1,
    minHeight: 128,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    overflow: 'hidden',
  },
  kpiTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  kpiLabel: {
    flex: 1,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 27,
    lineHeight: 31,
  },
  deltaPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deltaText: {
    fontSize: 11,
  },
  kpiHint: {
    marginTop: 'auto',
    fontSize: 11,
  },
  panel: {
    borderWidth: 1,
    padding: 14,
    gap: 12,
    overflow: 'hidden',
  },
  nextCard: {
    borderWidth: 1,
    padding: 14,
    gap: 10,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelTitle: {
    fontSize: 17,
    letterSpacing: 0,
  },
  panelAction: {
    fontSize: 10,
    letterSpacing: 1,
  },
  panelCount: {
    fontSize: 12,
  },
  rows: {
    gap: 0,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowTitle: {
    fontSize: 14,
    lineHeight: 18,
  },
  rowSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  scorePill: {
    borderRadius: 999,
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  scoreText: {
    color: '#F59E0B',
    fontSize: 11,
  },
  nextTitle: {
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: 0,
  },
  nextDescription: {
    fontSize: 13,
    lineHeight: 19,
  },
  ctaPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  duePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dueText: {
    fontSize: 11,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 11,
  },
  chartsGrid: {
    gap: 14,
  },
  chartCard: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  chartHeader: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(127,127,127,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(127,127,127,0.06)',
  },
  chartIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartTitle: {
    fontSize: 11,
    letterSpacing: 1.6,
  },
  chartCanvas: {
    height: 230,
    paddingHorizontal: 12,
    paddingVertical: 16,
    backgroundColor: 'transparent',
  },
  chartEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  revenueSheet: {
    gap: 12,
  },
  revenueHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  revenueAmount: {
    flex: 1,
    minWidth: 0,
    fontSize: 30,
    lineHeight: 36,
  },
  revenueDelta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingBottom: 5,
  },
  revenueDeltaText: {
    fontSize: 14,
  },
  revenueHint: {
    fontSize: 12,
  },
  revenueList: {
    maxHeight: 420,
  },
  revenueRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
  },
  revenueNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  paymentBadge: {
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  paymentBadgeText: {
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  emptyPanel: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 22,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
  },
  emptySub: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  kpiDetailCta: {
    fontSize: 10,
    marginTop: 'auto',
    letterSpacing: 0.3,
  },
  agendaIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityPhoto: {
    width: 38,
    height: 38,
  },
  statsExtras: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  statsDeltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  statsDeltaText: {
    fontSize: 10,
  },
  statsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  statsChipText: {
    fontSize: 10,
  },
  statsPlanText: {
    fontSize: 11,
    lineHeight: 15,
  },
})
