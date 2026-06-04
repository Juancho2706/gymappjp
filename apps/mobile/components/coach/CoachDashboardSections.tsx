import type { ReactNode } from 'react'
import { Linking, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { Image } from 'expo-image'
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Dumbbell,
  ExternalLink,
  Layers,
  LockKeyhole,
  Minus,
  Monitor,
  Palette,
  Receipt,
  Sparkles,
  Smartphone,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  UserPlus,
  Users,
  Utensils,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react-native'
import { MotiView } from 'moti'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { CartesianChart, Area, Line, Bar, useChartPressState } from 'victory-native'
import { useFont, Circle, Text as SkiaText } from '@shopify/react-native-skia'
import { useDerivedValue, type SharedValue } from 'react-native-reanimated'
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
import { Button } from '../Button'
import { useEffect, useId, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiFetch, getApiBaseUrl } from '../../lib/api'

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
 * Difuminado de color de marca en la esquina sup-der de una card (espeja la
 * GlassCard de la web). Se monta como PRIMER hijo de la card (queda detrás del
 * contenido); requiere `overflow:'hidden'` en la card para recortar a las esquinas.
 */
function CardGlow({ color }: { color?: string }) {
  const { theme, mode } = useTheme()
  const isDark = mode !== 'light'
  const c = color ?? theme.primary
  const a = isDark ? 0.075 : 0.055
  const id = `dashglow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
      <Defs>
        <RadialGradient id={id} cx="100%" cy="0%" r="58%">
          <Stop offset="0" stopColor={hexToRgba(c, a)} />
          <Stop offset="0.5" stopColor={hexToRgba(c, a * 0.22)} />
          <Stop offset="1" stopColor={c} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
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
      <MobileBanner tone="danger" icon={TriangleAlert} onPress={() => openCoachWebPath('/coach/subscription')}>
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
      <MobileBanner tone="warn" icon={Clock}>
        <Text>
          Cancelaste tu plan. Acceso hasta por {days} dia{days === 1 ? '' : 's'}.
        </Text>
        {showRec && recConfig ? (
          <Text>
            Con {activeClientCount} alumnos: Plan {recConfig.label} hasta {recConfig.maxClients}.
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
      <MobileBanner tone="info" icon={Clock}>
        <Text>
          Periodo de prueba - {days} dia{days === 1 ? '' : 's'} restantes.
        </Text>
        {showRec && recConfig ? (
          <Text>
            Con {activeClientCount} alumnos: Plan {recConfig.label} hasta {recConfig.maxClients}.
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
      {coach.subscriptionTier === 'elite' && totalClients >= 48 ? <MobileGrowthUpgradeBanner totalClients={totalClients} /> : null}
    </View>
  )
}

function MobileFreeTierBanner({ totalClients }: { totalClients: number }) {
  const { theme } = useTheme()
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
          borderColor: full ? 'rgba(245,158,11,0.32)' : theme.border,
          backgroundColor: full ? 'rgba(245,158,11,0.1)' : hexToRgba(theme.card === '#FFFFFF' ? '#FFFFFF' : '#000000', theme.card === '#FFFFFF' ? 0.62 : 0.34),
          borderRadius: theme.radius.xl,
        },
      ]}
    >
      <View style={styles.tierMain}>
        <Text style={[styles.tierTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
          {used}/{max} alumnos - Plan gratuito
        </Text>
        <View style={[styles.usageTrack, { backgroundColor: theme.muted }]}>
          <View
            style={[
              styles.usageFill,
              {
                width: `${pct}%`,
                backgroundColor: full ? '#F59E0B' : '#10B981',
              },
            ]}
          />
        </View>
      </View>
      <Text style={[styles.tierAction, { color: full ? '#F59E0B' : theme.primary, fontFamily: 'Inter_700Bold' }]}>
        {full ? 'Expandir limite' : 'Ver planes'}
      </Text>
    </TouchableOpacity>
  )
}

function MobileGrowthUpgradeBanner({ totalClients }: { totalClients: number }) {
  const { theme } = useTheme()
  const max = TIER_CONFIG.elite.maxClients
  const pct = Math.round((Math.min(totalClients, max) / max) * 100)

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => openCoachWebPath('/coach/subscription?upgrade=growth')}
      style={[
        styles.tierBanner,
        {
          borderColor: 'rgba(16,185,129,0.32)',
          backgroundColor: 'rgba(16,185,129,0.1)',
          borderRadius: theme.radius.xl,
        },
      ]}
    >
      <View style={styles.tierMain}>
        <Text style={[styles.tierTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
          {totalClients}/{max} alumnos - {pct}% de tu plan Elite
        </Text>
        <Text style={[styles.tierSubtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Hay un plan Growth para coaches con 60-120 alumnos.
        </Text>
      </View>
      <Text style={[styles.tierAction, { color: '#10B981', fontFamily: 'Inter_700Bold' }]}>
        Ver Growth
      </Text>
    </TouchableOpacity>
  )
}

function MobileBanner({
  tone,
  icon: Icon,
  children,
  onPress,
}: {
  tone: 'info' | 'warn' | 'danger'
  icon: LucideIcon
  children: ReactNode
  onPress?: () => void
}) {
  const { theme } = useTheme()
  const toneColor = tone === 'danger' ? '#F43F5E' : tone === 'warn' ? '#F59E0B' : theme.primary
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      onPress={onPress ?? (() => openCoachWebPath('/coach/subscription'))}
      style={[
        styles.banner,
        {
          borderColor: hexToRgba(toneColor, 0.32),
          backgroundColor: hexToRgba(toneColor, 0.1),
          borderRadius: theme.radius.xl,
        },
      ]}
    >
      <Icon size={18} color={toneColor} strokeWidth={2.2} />
      <View style={styles.bannerCopy}>
        <Text style={[styles.bannerText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
          {children}
        </Text>
        <View style={[styles.bannerCta, { backgroundColor: toneColor }]}>
          <CreditCard size={13} color="#FFFFFF" strokeWidth={2.3} />
          <Text style={[styles.bannerCtaText, { fontFamily: 'Inter_700Bold' }]}>
            Revisar plan
          </Text>
        </View>
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
          <Text style={[styles.formLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
            NUEVO ACCESO ALUMNOS
          </Text>
          <View style={styles.publicCodeRow}>
            <Text style={[styles.publicCodeValue, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
              {studentPath}
            </Text>
            <TouchableOpacity activeOpacity={0.78} onPress={copyLink} style={styles.publicCodeCopy}>
              <Copy size={14} color={theme.primary} />
              <Text style={[styles.publicCodeCopyText, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>
                {copied ? 'Copiado' : 'Copiar'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {error ? (
          <Text style={[styles.formErrorText, { color: theme.destructive, fontFamily: 'Inter_600SemiBold' }]}>
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
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)

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
        <View style={[styles.freeWelcomeHero, { borderBottomColor: theme.border }]}>
          <View style={[styles.freeWelcomeIcon, { borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.18)' }]}>
            <Sparkles size={31} color="#10B981" />
          </View>
          <Text style={[styles.freeWelcomeTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
            Bienvenido a EVA
          </Text>
          <Text style={[styles.freeWelcomeSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Tu plan gratuito esta activo. Puedes empezar ahora mismo.
          </Text>
        </View>

        <View style={styles.freeWelcomeSection}>
          <Text style={[styles.freeWelcomeEyebrow, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
            PRIMEROS PASOS
          </Text>
          <WelcomeStep icon={Users} color="#38BDF8" title="Agrega tu primer alumno" subtitle="Hasta 3 alumnos en el plan Free" />
          <WelcomeStep icon={Zap} color="#8B5CF6" title="Crea tu primera rutina" subtitle="Constructor de programas sin limites" />
          <WelcomeStep icon={Palette} color="#F59E0B" title="Personaliza tu app con Starter" subtitle="Tu logo y colores desde el siguiente plan" />
        </View>

        <View style={styles.freeWelcomeSection}>
          <Text style={[styles.freeWelcomeEyebrow, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
            TU PLAN FREE INCLUYE
          </Text>
          <View style={styles.freePlanGrid}>
            {[
              { ok: true, text: '3 alumnos activos' },
              { ok: true, text: 'Entrenos ilimitados' },
              { ok: true, text: 'App para tus alumnos' },
              { ok: true, text: 'Check-ins' },
              { ok: false, text: 'Marca personalizada' },
              { ok: false, text: 'Nutricion' },
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
          <Button label="Empezar ahora" onPress={dismiss} full />
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
  title,
  subtitle,
}: {
  icon: LucideIcon
  color: string
  title: string
  subtitle: string
}) {
  const { theme } = useTheme()
  return (
    <View style={styles.welcomeStep}>
      <View style={[styles.welcomeStepIcon, { backgroundColor: hexToRgba(color, 0.15) }]}>
        <Icon size={16} color={color} />
      </View>
      <View style={styles.welcomeStepCopy}>
        <Text style={[styles.welcomeStepTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
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
        <Text style={[styles.onboardingResumeText, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>
          Sigues con pasos pendientes en tu guia de inicio.
        </Text>
        <Button label="Continuar guia" size="sm" onPress={resumeGuide} />
      </View>
    )
  }

  return (
    <View style={[styles.onboardingCard, glass, { borderRadius: theme.radius.xl }]}>
      <CardGlow />
      <View style={styles.onboardingHeader}>
        <View style={styles.onboardingHeaderCopy}>
          <Text style={[styles.eyebrow, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
            TU RUTA EN EVA
          </Text>
          <Text style={[styles.onboardingTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
            Pon tu estudio en marcha
          </Text>
          <Text style={[styles.onboardingDescription, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Cuatro pasos para cerrar el circuito: marca, alumno, plan y senal de uso.
          </Text>
        </View>
        <View style={styles.onboardingProgressBox}>
          <Text style={[styles.onboardingProgressValue, { color: theme.primary, fontFamily: 'Montserrat_800ExtraBold' }]}>
            {progressPct}%
          </Text>
          <Text style={[styles.onboardingProgressLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
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
        onOpenPreview={() => router.push('/coach/(tabs)/settings')}
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
              <Button label="Ir a Mi Marca" size="sm" onPress={() => router.push('/coach/(tabs)/settings')} style={styles.stepButton} />
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
            <Text style={[styles.activationTitle, { color: '#10B981', fontFamily: 'Inter_700Bold' }]}>
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
      <Text style={[styles.onboardingFreeTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
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
            <Text style={[styles.loopLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{item.label}</Text>
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
          <Text style={[styles.twinTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>Tu panel</Text>
        </View>
        <Text style={[styles.twinText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Sumas alumnos, armas programas y asignas planes desde tu app de coach.
        </Text>
      </View>
      <View style={[styles.twinPanel, { borderColor: theme.border, backgroundColor: hexToRgba(theme.primary, 0.08), borderRadius: theme.radius.xl }]}>
        <View style={styles.twinTitleRow}>
          <Smartphone size={15} color={theme.primary} />
          <Text style={[styles.twinTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>Tu alumno</Text>
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
            <Text style={[styles.carouselStep, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>PASO {index + 1}</Text>
            <Text style={[styles.carouselTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>{step.title}</Text>
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
        <Text style={[styles.stepTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>{title}</Text>
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
      <Text style={[styles.eyebrow, { color: enabled ? '#10B981' : theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
        NUTRICION {enabled ? '(OPCIONAL)' : ''}
      </Text>
      <Text style={[styles.nutritionTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
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
        <QuickActionButton icon={UserPlus} label="+ Alumno" shortLabel="+" onPress={() => setModal('client')} />
        <QuickActionButton icon={Layers} label="+ Programa" shortLabel="+" onPress={() => router.push('/coach/(tabs)/builder')} />
        <QuickActionButton icon={Utensils} label="+ Nutricion" shortLabel="+" onPress={() => router.push('/coach/(tabs)/nutricion')} />
        <QuickActionButton icon={Receipt} label="+ Pago" shortLabel="+" onPress={() => setModal('payment')} />
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
            <Text style={[styles.successTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
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
          <Text style={[styles.formErrorText, { color: theme.destructive, fontFamily: 'Inter_600SemiBold' }]}>
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
          <Text style={[styles.formErrorText, { color: theme.destructive, fontFamily: 'Inter_600SemiBold' }]}>
            {error}
          </Text>
        </View>
      ) : null}

      <View style={styles.formField}>
        <Text style={[styles.formLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Alumno</Text>
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
                      { color: active ? theme.primary : theme.foreground, fontFamily: 'Inter_600SemiBold' },
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
      <Text style={[styles.formLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{label}</Text>
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
  shortLabel,
  onPress,
}: {
  icon: LucideIcon
  label: string
  shortLabel: string
  onPress: () => void
}) {
  const { theme, mode } = useTheme()
  const isDark = mode !== 'light'

  return (
    <TouchableOpacity
      accessibilityLabel={label}
      accessibilityRole="button"
      activeOpacity={0.82}
      onPress={onPress}
      style={[
        styles.quickActionButton,
        {
          backgroundColor: isDark ? 'rgba(10,10,10,0.58)' : 'rgba(255,255,255,0.82)',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.11)',
          shadowColor: '#000',
        },
      ]}
    >
      <Icon size={16} color={theme.primary} strokeWidth={2.3} />
      <Text
        style={[styles.quickActionShort, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}
        numberOfLines={1}
      >
        {shortLabel}
      </Text>
    </TouchableOpacity>
  )
}

function useGlassStyle() {
  const { mode } = useTheme()
  const isDark = mode !== 'light'
  return {
    backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.76)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.11)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: isDark ? 0.16 : 0.055,
    shadowRadius: isDark ? 20 : 14,
    elevation: isDark ? 4 : 2,
  }
}

export function MobileGreetingHeader({ coachName, pendingCount }: { coachName: string; pendingCount: number }) {
  const { theme } = useTheme()
  const firstName = coachName?.split(' ')[0] || 'Coach'
  const dateStr = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos dias' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <View style={styles.greeting}>
      <Text style={[styles.eyebrow, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
        {dateStr}
      </Text>
      <Text style={[styles.greetingTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
        {greeting},{' '}
        <Text style={{ color: theme.primary }}>
          {firstName}
        </Text>
      </Text>
      <Text style={[styles.greetingSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {pendingCount > 0
          ? `Tienes ${pendingCount} pendiente${pendingCount === 1 ? '' : 's'} hoy.`
          : 'Todo al dia. Buen momento para planificar.'}
      </Text>
    </View>
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
        hint={`Mes anterior: ${formatCurrency(kpi.mrrPreviousMonth)}`}
        icon={TrendingUp}
        deltaPct={kpi.mrrDeltaPct}
        onPress={onMrrPress}
      />
      <MobileKpiTile
        label="Alumnos activos"
        value={String(kpi.totalClients)}
        icon={Users}
        onPress={() => router.push('/coach/(tabs)/clientes')}
      />
      <MobileKpiTile
        label="En riesgo"
        value={String(kpi.riskCount)}
        hint={kpi.riskCount > 0 ? 'Requieren atencion inmediata' : 'Todos al dia'}
        icon={TriangleAlert}
        onPress={onAdherencePress}
      />
      <MobileKpiTile
        label="Adherencia"
        value={`${kpi.avgAdherence}%`}
        hint={`Nutricion: ${kpi.avgNutrition}%`}
        icon={Activity}
        onPress={onAdherencePress}
      />
    </View>
  )
}

function MobileKpiTile({
  label,
  value,
  hint,
  icon: Icon,
  deltaPct,
  onPress,
}: {
  label: string
  value: string
  hint?: string
  icon: LucideIcon
  deltaPct?: number
  onPress?: () => void
}) {
  const { theme } = useTheme()
  const glass = useGlassStyle()
  const hasDelta = typeof deltaPct === 'number'
  const up = hasDelta && deltaPct >= 0

  const body = (
    <MotiView
      from={{ opacity: 0, translateY: 14 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 320 }}
      style={[styles.kpiCard, glass, { borderRadius: theme.radius.xl }]}
    >
      <CardGlow />
      <View style={styles.kpiTop}>
        <Text style={[styles.kpiLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]} numberOfLines={2}>
          {label}
        </Text>
        <Icon size={17} color={theme.primary} strokeWidth={2.2} />
      </View>
      <Text
        style={[styles.kpiValue, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {hasDelta ? (
        <View style={[styles.deltaPill, { backgroundColor: up ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)' }]}>
          {up ? <ArrowUpRight size={12} color="#10B981" /> : <ArrowDownRight size={12} color="#F43F5E" />}
          <Text style={[styles.deltaText, { color: up ? '#10B981' : '#F43F5E', fontFamily: 'Inter_700Bold' }]}>
            {Math.abs(deltaPct)}%
          </Text>
        </View>
      ) : null}
      {hint ? (
        <Text style={[styles.kpiHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
      {onPress ? (
        <Text style={[styles.kpiDetailCta, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>
          Ver detalle →
        </Text>
      ) : null}
    </MotiView>
  )

  if (!onPress) {
    return <View style={styles.kpiTouch}>{body}</View>
  }

  return (
    <TouchableOpacity activeOpacity={0.84} onPress={onPress} style={styles.kpiTouch}>
      {body}
    </TouchableOpacity>
  )
}

export function MobileFocusList({ items }: { items: MobileRiskAlertItem[] }) {
  const router = useRouter()
  const { theme } = useTheme()
  const glass = useGlassStyle()

  return (
    <View style={[styles.panel, glass, { borderRadius: theme.radius.xl }]}>
      <CardGlow />
      <View style={styles.panelHeader}>
        <View style={styles.panelTitleRow}>
          <TriangleAlert size={17} color="#F59E0B" />
          <Text style={[styles.panelTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            Focus list
          </Text>
        </View>
        <TouchableOpacity activeOpacity={0.72} onPress={() => router.push('/coach/(tabs)/clientes')}>
          <Text style={[styles.panelAction, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>
            VER TODOS
          </Text>
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <EmptyPanel icon={<Sparkles size={24} color={theme.mutedForeground} />} title="Sin alumnos en riesgo" subtitle="Todos con check-in y ejercicio al dia." />
      ) : (
        <View style={styles.rows}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={item.clientId}
              activeOpacity={0.78}
              onPress={() => router.push(`/coach/cliente/${item.clientId}`)}
              style={[styles.row, index < items.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                  {item.clientName}
                </Text>
                <Text style={[styles.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <View style={[
                  styles.scorePill,
                  {
                    backgroundColor: 'rgba(245,158,11,0.15)',
                  },
                ]}>
                  <Text style={[
                    styles.scoreText,
                    {
                      fontFamily: 'Inter_700Bold',
                      color: '#F59E0B',
                    },
                  ]}>{item.attentionScore}</Text>
                </View>
                <ChevronRight size={18} color={theme.mutedForeground} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
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
  const glass = useGlassStyle()
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
    <View style={[styles.nextCard, glass, { borderRadius: theme.radius.xl, borderLeftWidth: 3, borderLeftColor: toneColor }]}>
      <CardGlow color={toneColor} />
      <View style={styles.panelTitleRow}>
        <Sparkles size={17} color={theme.primary} />
        <Text style={[styles.eyebrow, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
          PROXIMA ACCION
        </Text>
      </View>
      <Text style={[styles.nextTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
        {action.title}
      </Text>
      <Text style={[styles.nextDescription, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {action.description}
      </Text>
      <TouchableOpacity activeOpacity={0.82} onPress={handlePress} style={[styles.ctaPill, { backgroundColor: theme.primary }]}>
        <Text style={[styles.ctaText, { fontFamily: 'Inter_700Bold' }]}>{action.ctaLabel}</Text>
        <ArrowRight size={16} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  )
}

export function MobileTodayAgenda({ items }: { items: MobileAgendaItem[] }) {
  const router = useRouter()
  const { theme } = useTheme()
  const glass = useGlassStyle()

  return (
    <View style={[styles.panel, glass, { borderRadius: theme.radius.xl }]}>
      <CardGlow />
      <View style={styles.panelHeader}>
        <View style={styles.panelTitleRow}>
          <CalendarClock size={17} color={theme.primary} />
          <Text style={[styles.panelTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            Agenda de hoy
          </Text>
        </View>
        <Text style={[styles.panelCount, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          {items.length} pendientes
        </Text>
      </View>
      {items.length === 0 ? (
        <EmptyPanel icon={<CheckCircle2 size={25} color="#10B981" />} title="Todo cerrado" subtitle="Sin pendientes en el dia." />
      ) : (
        <View style={styles.rows}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.78}
              onPress={() => router.push(`/coach/cliente/${item.clientId}`)}
              style={[styles.row, index < items.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <View style={[styles.agendaIconWrap, { backgroundColor: hexToRgba(theme.primary, 0.1) }]}>
                {item.kind === 'programa_vence'
                  ? <Clock size={15} color={theme.primary} />
                  : item.kind === 'checkin_pendiente'
                    ? <Camera size={15} color={theme.primary} />
                    : <Dumbbell size={15} color={theme.primary} />}
              </View>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                  {item.clientName}
                </Text>
                <Text style={[styles.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
              <ChevronRight size={18} color={theme.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

export function MobileExpiringPrograms({ items }: { items: MobileExpiringProgramItem[] }) {
  const router = useRouter()
  const { theme } = useTheme()
  const glass = useGlassStyle()

  return (
    <View style={[styles.panel, glass, { borderRadius: theme.radius.xl }]}>
      <CardGlow />
      <View style={styles.panelTitleRow}>
        <Clock size={17} color="#F59E0B" />
        <Text style={[styles.panelTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          Programas por vencer
        </Text>
      </View>
      {items.length === 0 ? (
        <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Sin programas vencidos ni por vencer.
        </Text>
      ) : (
        <View style={styles.rows}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.78}
              onPress={() => item.clientId
                ? router.push(`/coach/cliente/${item.clientId}`)
                : router.push('/coach/(tabs)/builder')}
              style={[styles.row, index < items.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                  {item.clientName}
                </Text>
                <Text style={[styles.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <View style={[styles.duePill, { backgroundColor: item.daysLeft <= 0 ? 'rgba(244,63,94,0.15)' : 'rgba(245,158,11,0.15)' }]}>
                  <Text style={[styles.dueText, { color: item.daysLeft <= 0 ? '#F43F5E' : '#F59E0B', fontFamily: 'Inter_700Bold' }]}>
                    {item.daysLeft <= 0 ? 'Vencido' : `${item.daysLeft}d`}
                  </Text>
                </View>
                <ChevronRight size={16} color={theme.mutedForeground} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

function ActivityTypeIcon({ type, size, color }: { type: MobileActivityItem['type']; size: number; color: string }) {
  if (type === 'nuevo alumno') return <UserPlus size={size} color={color} />
  if (type === 'check-in') return <Camera size={size} color={color} />
  return <Dumbbell size={size} color={color} />
}

export function MobileActivityFeed({ items }: { items: MobileActivityItem[] }) {
  const router = useRouter()
  const { theme } = useTheme()
  const glass = useGlassStyle()

  return (
    <View style={[styles.panel, glass, { borderRadius: theme.radius.xl }]}>
      <CardGlow />
      <View style={styles.panelTitleRow}>
        <Activity size={17} color={theme.primary} />
        <Text style={[styles.panelTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          Actividad reciente
        </Text>
      </View>
      {items.length === 0 ? (
        <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Sin actividad reciente.
        </Text>
      ) : (
        <View style={styles.rows}>
          {items.map((item, index) => {
            const iconColor = item.type === 'nuevo alumno' ? '#10B981' : item.type === 'check-in' ? '#3B82F6' : theme.primary
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.78}
                disabled={!item.clientId}
                onPress={() => item.clientId && router.push(`/coach/cliente/${item.clientId}`)}
                style={[styles.row, index < items.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
              >
                {item.type === 'check-in' && item.photoUrl ? (
                  <Image
                    source={{ uri: item.photoUrl }}
                    style={[styles.activityPhoto, { borderRadius: theme.radius.lg }]}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View style={[styles.activityIcon, { backgroundColor: hexToRgba(iconColor, 0.11) }]}>
                    <ActivityTypeIcon type={item.type} size={16} color={iconColor} />
                  </View>
                )}
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[styles.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                </View>
                <Text style={[styles.timeText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  {timeAgo(item.date)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
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
const INTER_FONT = require('@expo-google-fonts/inter/Inter_400Regular.ttf')

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
      <CardGlow />
      <View style={styles.chartHeader}>
        <View style={[styles.chartIcon, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
          <TrendingUp size={16} color="#3B82F6" />
        </View>
        <Text style={[styles.chartTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
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
      <CardGlow />
      <View style={styles.chartHeader}>
        <View style={[styles.chartIcon, { backgroundColor: 'rgba(34,211,238,0.12)' }]}>
          <Activity size={16} color="#22D3EE" />
        </View>
        <Text style={[styles.chartTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
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
          <Text style={[styles.revenueAmount, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
            {formatCurrency(kpi.mrrCurrentMonth)}
          </Text>
          <View style={styles.revenueDelta}>
            <DeltaIcon size={16} color={deltaColor} />
            <Text style={[styles.revenueDeltaText, { color: deltaColor, fontFamily: 'Inter_700Bold' }]}>
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
                    <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
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

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values)
  const barW = 8
  const barGap = 3
  const h = 22
  const totalW = values.length * barW + (values.length - 1) * barGap
  return (
    <Svg width={totalW} height={h}>
      {values.map((v, i) => {
        const barH = Math.max(2, (v / max) * h)
        return (
          <Rect
            key={i}
            x={i * (barW + barGap)}
            y={h - barH}
            width={barW}
            height={barH}
            rx={2}
            fill={color}
            opacity={0.3 + (v / max) * 0.7}
          />
        )
      })}
    </Svg>
  )
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
  const sorted = [...clientStats].sort((a, b) => {
    const av = tab === 'adherence' ? a.adherencePct : a.nutritionPct
    const bv = tab === 'adherence' ? b.adherencePct : b.nutritionPct
    return av - bv
  })

  return (
    <NativeDialog open={open} title="Detalle por alumno" onClose={onClose}>
      <View style={styles.statsSheet}>
        <Text style={[styles.revenueHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Ordenado de menor a mayor cumplimiento.
        </Text>
        <View style={styles.statsTabs}>
          <StatsTabButton active={tab === 'adherence'} label="Adherencia" onPress={() => setTab('adherence')} />
          <StatsTabButton active={tab === 'nutrition'} label="Nutricion" onPress={() => setTab('nutrition')} />
        </View>
        {sorted.length === 0 ? (
          <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Sin datos.
          </Text>
        ) : (
          <ScrollView style={styles.statsList} nestedScrollEnabled>
            {sorted.map((client) => {
              const pct = tab === 'adherence' ? client.adherencePct : client.nutritionPct
              const hint = tab === 'adherence' ? client.adherenceHint : client.nutritionHint
              const sparkValues = tab === 'adherence' ? client.adherenceHistory4w : []
              const hasDelta = client.weightDelta7d !== null
              const deltaUp = hasDelta && (client.weightDelta7d ?? 0) >= 0
              return (
                <TouchableOpacity
                  key={client.clientId}
                  activeOpacity={0.78}
                  onPress={() => {
                    onClose()
                    router.push(`/coach/cliente/${client.clientId}`)
                  }}
                  style={[
                    styles.statsRow,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.background === '#F5F5F5' ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.04)',
                      borderRadius: theme.radius.xl,
                    },
                  ]}
                >
                  <View style={styles.statsRowHeader}>
                    <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                      {client.clientName}
                    </Text>
                    <Text style={[styles.statsPct, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
                      {pct}%
                    </Text>
                  </View>
                  <View style={[styles.progressTrack, { backgroundColor: theme.muted }]}>
                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: theme.primary }]} />
                  </View>
                  <Text style={[styles.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                    {hint}
                  </Text>
                  {(sparkValues.length > 0 || hasDelta || client.streak > 0 || client.latestEnergyLevel !== null) ? (
                    <View style={styles.statsExtras}>
                      {sparkValues.length > 0 && (
                        <MiniSparkline values={sparkValues} color={theme.primary} />
                      )}
                      {hasDelta && (
                        <View style={[styles.statsDeltaBadge, { backgroundColor: deltaUp ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)' }]}>
                          {deltaUp
                            ? <ArrowUpRight size={11} color="#10B981" />
                            : <ArrowDownRight size={11} color="#F43F5E" />}
                          <Text style={[styles.statsDeltaText, { color: deltaUp ? '#10B981' : '#F43F5E', fontFamily: 'Inter_700Bold' }]}>
                            {Math.abs(client.weightDelta7d ?? 0).toFixed(1)}kg 7d
                          </Text>
                        </View>
                      )}
                      {client.streak > 0 && (
                        <View style={[styles.statsChip, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                          <Zap size={11} color="#F59E0B" />
                          <Text style={[styles.statsChipText, { color: '#F59E0B', fontFamily: 'Inter_700Bold' }]}>
                            {client.streak}d racha
                          </Text>
                        </View>
                      )}
                      {client.latestEnergyLevel !== null && (
                        <View style={[styles.statsChip, { backgroundColor: hexToRgba(theme.primary, 0.12) }]}>
                          <Text style={[styles.statsChipText, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>
                            ⚡ {client.latestEnergyLevel}/10
                          </Text>
                        </View>
                      )}
                    </View>
                  ) : null}
                  {(client.planCurrentWeek !== null || client.oneRMDelta !== null) ? (
                    <View style={styles.statsExtras}>
                      {client.planCurrentWeek !== null && client.planTotalWeeks !== null && (
                        <Text style={[styles.statsPlanText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                          Semana {client.planCurrentWeek}/{client.planTotalWeeks}
                          {client.planDaysRemaining ? ` · ${client.planDaysRemaining}d restantes` : ''}
                        </Text>
                      )}
                      {client.oneRMDelta !== null && (
                        <View style={[styles.statsDeltaBadge, { backgroundColor: client.oneRMDelta >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)' }]}>
                          {client.oneRMDelta >= 0
                            ? <TrendingUp size={11} color="#10B981" />
                            : <TrendingDown size={11} color="#F43F5E" />}
                          <Text style={[styles.statsDeltaText, { color: client.oneRMDelta >= 0 ? '#10B981' : '#F43F5E', fontFamily: 'Inter_700Bold' }]}>
                            {client.oneRMDelta > 0 ? '+' : ''}{client.oneRMDelta.toFixed(1)}% fuerza 7d
                          </Text>
                        </View>
                      )}
                    </View>
                  ) : null}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        )}
      </View>
    </NativeDialog>
  )
}

function StatsTabButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { theme } = useTheme()
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[
        styles.statsTab,
        {
          backgroundColor: active ? theme.primary : theme.muted,
          borderRadius: 999,
        },
      ]}
    >
      <Text style={[styles.statsTabText, { color: active ? '#FFFFFF' : theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function PaymentStatusBadge({ hasRecentPayment, hasAnyPayment }: { hasRecentPayment: boolean; hasAnyPayment: boolean }) {
  const { theme } = useTheme()
  const label = !hasAnyPayment ? 'Sin pago' : hasRecentPayment ? 'Al dia' : 'Vencido'
  const color = !hasAnyPayment ? theme.mutedForeground : hasRecentPayment ? '#10B981' : '#F59E0B'
  return (
    <View style={[styles.paymentBadge, { borderColor: hexToRgba(color, 0.42), backgroundColor: hexToRgba(color, 0.12) }]}>
      <Text style={[styles.paymentBadgeText, { color, fontFamily: 'Inter_700Bold' }]}>{label}</Text>
    </View>
  )
}

function EmptyPanel({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  const { theme } = useTheme()
  return (
    <View style={styles.emptyPanel}>
      {icon}
      <Text style={[styles.emptyTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
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
    gap: 4,
  },
  banner: {
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
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
  bannerCta: {
    alignSelf: 'flex-start',
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bannerCtaText: {
    color: '#FFFFFF',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  tierStack: {
    gap: 8,
  },
  tierBanner: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
    fontSize: 11,
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
    paddingTop: 28,
    paddingBottom: 22,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  freeWelcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  freeWelcomeTitle: {
    fontSize: 21,
    lineHeight: 26,
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
    paddingTop: 18,
    gap: 12,
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
    width: 30,
    height: 30,
    borderRadius: 9,
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
    paddingTop: 18,
    paddingBottom: 22,
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
    fontFamily: 'Inter_700Bold',
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
  statsSheet: {
    gap: 12,
  },
  statsTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  statsTab: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  statsTabText: {
    fontSize: 13,
  },
  statsList: {
    maxHeight: 430,
  },
  statsRow: {
    borderWidth: 1,
    padding: 12,
    gap: 8,
    marginBottom: 10,
  },
  statsRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statsPct: {
    fontSize: 14,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
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
