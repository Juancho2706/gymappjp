import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { cssInterop } from 'nativewind'
import {
  Activity,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Compass,
  Dumbbell,
  Eye,
  HeartPulse,
  Palette,
  PartyPopper,
  Salad,
  Smartphone,
  Sparkles,
  Trash2,
  UserPlus,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import Svg, { Circle } from 'react-native-svg'
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_KEYS,
  ONBOARDING_TOTAL_STEPS,
  progress,
  resolveAutoCompleted,
  resolveRnRoute,
  type OnboardingStep,
  type OnboardingStepKey,
} from '@eva/onboarding'
import { PERSONA_COPY, type Persona } from '@eva/schemas'
import { AppBackground } from '../../components/AppBackground'
import { Card } from '../../components'
import { toast } from '../../components/Toast'
import { useTheme } from '../../context/ThemeContext'
import {
  GUIDE_SEEN_AT_KEY,
  getCoachDashboardDataMobile,
  persistCoachOnboardingGuide,
  postCoachOnboardingEvent,
  publishCoachOnboarding,
  type MobileDashboardData,
  type MobileOnboardingV2,
} from '../../lib/coach-dashboard'
import { deleteDemoStudent, openViveTuApp } from '../../lib/vive-tu-app'
import { resolveSportRamp } from '../../lib/theme'

/**
 * «Tus primeros pasos» — la guía de inicio del coach, en su PANTALLA PROPIA (paridad con la web
 * `/coach/guia`, decisión del owner 2026-08-22 que manda sobre «la guía arriba del home»).
 *
 * Por qué mudarla: el home del día 1 se ve LLENO (banners de plan, saludo, pastilla de código,
 * hero, prioridad, agenda, novedades) y la guía —que vivía ÚLTIMA, debajo de todo eso— no la veía
 * nadie. Acá tiene la pantalla entera: tarjetas grandes, un solo paso destacado, la marca y el
 * alumno de ejemplo. En el home solo queda la píldora flotante (`components/coach/GuidePill.tsx`).
 *
 * Estado: el servidor manda. Los pasos se tildan SOLOS con señales reales (`onboardingV2.signals`)
 * y lo que se tilda se PERSISTE en `coaches.onboarding_guide` con la acción `persist_onboarding_guide`
 * del endpoint del dashboard (merge server-side) — la misma fila que lee la web, así que ocultar la
 * guía o completar un paso cruza panel ↔ teléfono y sobrevive a una reinstalación. No hay tilde
 * manual: la guía refleja trabajo hecho, no clics.
 *
 * Copy y pasos vienen de `@eva/onboarding`: si cambia el texto, cambia en un solo archivo para las
 * dos superficies.
 */

// lucide y react-native-svg no aceptan `className`: cssInterop deja que las clases `text-*`
// resuelvan el `color` del icono, y con eso el white-label del coach entra solo (regla de
// `apps/mobile/AGENTS.md` + auditoría de iconos del 12-08).
for (const Icon of [
  Activity, ArrowRight, Check, ChevronLeft, ChevronRight, ClipboardList, Compass, Dumbbell,
  Eye, HeartPulse, Palette, PartyPopper, Salad, Smartphone, Sparkles, Trash2, UserPlus,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

/** Icono por paso. El 3 cambia por persona: es el único que cambia de verdad entre ramas. */
const STEP_ICON: Record<OnboardingStepKey, LucideIcon> = {
  profile_branding: Palette,
  vive_tu_app: Smartphone,
  first_artifact: ClipboardList,
  first_client: UserPlus,
  aha: Sparkles,
}

const FIRST_ARTIFACT_ICON: Record<Persona, LucideIcon> = {
  strength: Dumbbell,
  nutrition: Salad,
  rehab: Activity,
  endurance: HeartPulse,
  other: ClipboardList,
}

/** Verbo del CTA por paso: el coach tiene que saber qué pasa al tocarlo. */
const STEP_CTA: Record<OnboardingStepKey, string> = {
  profile_branding: 'Abrir Mi Marca',
  vive_tu_app: 'Ver mi app',
  first_artifact: 'Empezar',
  first_client: 'Invitar',
  aha: 'Ver el panel',
}

/**
 * Etiqueta corta de la persona para el chip de la cabecera. Gemela de `PERSONA_CHIP_LABEL` de la
 * web (`app/coach/guia/_lib/guide-view.ts`): los `tileTitle` de `PERSONA_COPY` son frases enteras
 * («Entreno fuerza y acondicionamiento») y no entran en un chip de una línea.
 * DEUDA declarada: las dos copias deberían vivir en `@eva/schemas/persona`.
 */
const PERSONA_CHIP_LABEL: Record<Persona, string> = {
  strength: 'Fuerza y acondicionamiento',
  nutrition: 'Nutrición',
  rehab: 'Rehabilitación',
  endurance: 'Resistencia',
  other: 'Panel completo',
}

type StepState = 'done' | 'next' | 'pending'
type StepView = { step: OnboardingStep; position: number; state: StepState }

/**
 * Estado de los 5 pasos: los tildados van `done`, el PRIMERO sin tildar es `next` (el único
 * destacado) y el resto `pending`. Mismo criterio que `nextStep` de `@eva/onboarding`, pero
 * devolviendo la lista completa de una pasada. Gemelo de `resolveStepViews` de la web.
 */
function resolveStepViews(
  steps: readonly OnboardingStep[],
  completed: Record<OnboardingStepKey, boolean>,
): StepView[] {
  let nextTaken = false
  return steps.map((step, index) => {
    const done = completed[step.key] === true
    let state: StepState = 'pending'
    if (done) {
      state = 'done'
    } else if (!nextTaken) {
      state = 'next'
      nextTaken = true
    }
    return { step, position: index + 1, state }
  })
}

/** Mapa completo de los 5 pasos: persistido ∪ auto-tildado por señales reales. */
function mergeCompleted(v2: MobileOnboardingV2): Record<OnboardingStepKey, boolean> {
  const auto = resolveAutoCompleted(v2.signals)
  const out = {} as Record<OnboardingStepKey, boolean>
  for (const key of ONBOARDING_STEP_KEYS) {
    out[key] = v2.guide.completed[key] === true || auto[key] === true
  }
  return out
}

export default function CoachGuiaScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { theme, branding } = useTheme()
  const params = useLocalSearchParams<{ bienvenida?: string }>()

  const [data, setData] = useState<MobileDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<null | 'vive' | 'demo'>(null)
  const persistedRef = useRef(false)

  const load = useCallback(async () => {
    try {
      // Datos nuevos = otra oportunidad de persistir. El guard de abajo evita la doble escritura
      // sobre la MISMA foto, no que un paso recién tildado (volver de Mi Marca con el logo puesto)
      // espere hasta la próxima visita para quedar guardado.
      persistedRef.current = false
      const next = await getCoachDashboardDataMobile()
      setData(next)
      if (next) publishCoachOnboarding({ coachId: next.coach.id, onboardingV2: next.onboardingV2 })
    } finally {
      setLoading(false)
    }
  }, [])

  // El tab de abajo no se desmonta, pero esta pantalla del stack sí puede quedar en segundo plano
  // mientras el coach va a Mi Marca o al builder: al volver, las señales tienen que estar frescas
  // (si acaba de subir su logo, el paso 1 tiene que aparecer tildado).
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const v2 = data?.onboardingV2 ?? null
  /**
   * Banda de bienvenida: por el param (como la web, `?bienvenida=1`) o porque es la PRIMERA visita
   * (`guide_seen_at` sin sellar). Las dos puertas y no solo el param, porque en RN quien manda acá
   * al coach recien registrado es el gate de persona, y un destino sin query string no puede
   * costarle la bienvenida. El sello lo estampa esta misma pantalla, asi que la banda aparece una
   * vez y no vuelve.
   */
  const welcome = params.bienvenida === '1' || (v2 != null && v2.guide.guideSeenAt == null)
  const persona: Persona = v2?.persona ?? 'other'
  const steps = ONBOARDING_STEPS[persona]
  const completed = useMemo(
    () => (v2 ? mergeCompleted(v2) : ({} as Record<OnboardingStepKey, boolean>)),
    [v2],
  )
  const { done, total } = v2 ? progress(completed) : { done: 0, total: ONBOARDING_TOTAL_STEPS }
  const allDone = v2 != null && done >= total

  /**
   * Escritura ÚNICA por visita: sella `guide_seen_at` (lo que hace que la primera entrada mande a
   * la guía una sola vez) y persiste los pasos que las señales acaban de tildar.
   *
   * Van juntos en UN parche a propósito: el merge del servidor es read-modify-write sobre el jsonb,
   * así que dos escrituras en paralelo pueden pisarse. `completed` viaja ENTERO (no un delta):
   * el merge es de claves de primer nivel y un `completed` parcial reemplazaría al de la web.
   */
  useEffect(() => {
    if (v2 == null || persistedRef.current) return
    const patch: Record<string, unknown> = {}

    if (v2.guide.guideSeenAt == null) patch[GUIDE_SEEN_AT_KEY] = new Date().toISOString()

    const newlyDone = ONBOARDING_STEP_KEYS.filter(
      (key) => completed[key] === true && v2.guide.completed[key] !== true,
    )
    if (newlyDone.length > 0) patch.completed = { ...v2.guide.completed, ...completed }

    if (Object.keys(patch).length === 0) return
    persistedRef.current = true
    void persistCoachOnboardingGuide(patch)
  }, [v2, completed])

  const openStep = useCallback(
    (step: OnboardingStep) => {
      const route = resolveRnRoute(step, { demoClientId: v2?.demoClientId ?? null })
      void postCoachOnboardingEvent('guide_engagement', {
        widget: 'guide_screen',
        action: 'step_open',
        step: step.key,
        persona: v2?.persona ?? 'sin_persona',
      })
      if (route != null) router.push(route as never)
    },
    [router, v2],
  )

  const onViveTuApp = useCallback(async () => {
    if (busy != null) return
    setBusy('vive')
    const result = await openViveTuApp()
    setBusy(null)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    // El paso se tilda con el evento que escribió el servidor; refrescar trae la señal ya real.
    persistedRef.current = false
    await load()
  }, [busy, load])

  const onDeleteDemo = useCallback(async () => {
    if (busy != null) return
    setBusy('demo')
    const result = await deleteDemoStudent()
    setBusy(null)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('Borramos el alumno de ejemplo.')
    await load()
  }, [busy, load])

  /**
   * Único camino para apagar la píldora del panel. Escribe `dismissed` Y `hidden`, igual que el
   * `hide()` de la web (`_lib/use-onboarding-guide.ts`): apagarla en el teléfono la apaga también
   * en el panel, que es todo el punto de persistir contra `coaches.onboarding_guide`.
   */
  const onHideGuide = useCallback(() => {
    if (data == null) return
    const hidden: MobileOnboardingV2 = {
      ...data.onboardingV2,
      guide: { ...data.onboardingV2.guide, dismissed: true, hidden: true },
    }
    publishCoachOnboarding({ coachId: data.coach.id, onboardingV2: hidden })
    void persistCoachOnboardingGuide({ dismissed: true, hidden: true })
    void postCoachOnboardingEvent('guide_engagement', {
      widget: 'guide_screen',
      action: 'hide',
      progress_done: done,
    })
    router.replace('/coach/home')
  }, [data, done, router])

  const firstName = (data?.coach.fullName ?? '').trim().split(' ')[0] || 'coach'
  // El coach puede haber renombrado al demo: se usa el nombre REAL, y de pila (el CTA «Ver como
  // Matías Soto Fernández» no entra en una fila de 390 px).
  const demoFirstName = (v2?.demoName ?? '').trim().split(' ')[0] || 'tu alumno de ejemplo'

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View className="flex-row items-center" style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
          <Pressable
            testID="guia-back"
            accessibilityRole="button"
            accessibilityLabel="Volver al panel"
            onPress={() => router.replace('/coach/home')}
            hitSlop={10}
            className="flex-row items-center"
            style={{ gap: 2, paddingVertical: 6, paddingHorizontal: 4 }}
          >
            <ChevronLeft size={22} strokeWidth={2.2} className="text-sport-600" />
            <Text className="font-sans-bold text-sport-600" style={{ fontSize: 15 }}>Mi panel</Text>
          </Pressable>
        </View>

        {loading && data == null ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}
            showsVerticalScrollIndicator={false}
          >
            {welcome ? <WelcomeBand firstName={firstName} persona={v2?.persona ?? null} /> : null}

            {/* Cabecera: anillo n/5 + título + chip de persona */}
            <View className="flex-row items-center" style={{ gap: 14, paddingTop: 8, paddingBottom: 6 }}>
              <GuideRing done={done} total={total} color={resolveSportRamp(branding?.primaryColor).sport500} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="font-display-black text-strong" style={{ fontSize: 24, letterSpacing: -0.5 }}>
                  Tus primeros pasos
                </Text>
                <Text className="font-sans text-muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 19 }}>
                  Cinco pasos para dejar tu app andando hoy. Se tildan solos: no hay nada que marcar
                  a mano.
                </Text>
              </View>
            </View>

            {v2?.persona != null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${PERSONA_CHIP_LABEL[v2.persona]}. Cambiar en Opciones`}
                // «Opciones» y no «Mi panel» como en la web: el editor de persona de RN todavía no
                // existe (deuda de W5-A/F5.1) y el hub de Opciones es donde va a vivir. Prometer un
                // nombre de pantalla que no está sería mandar al coach a buscar algo que no hay.
                onPress={() => router.push('/coach/(tabs)/settings')}
                className="flex-row items-center self-start rounded-pill border border-subtle bg-surface-card"
                style={{ gap: 6, paddingHorizontal: 12, minHeight: 36, marginTop: 4, marginBottom: 14 }}
              >
                <Text className="font-sans-bold text-muted" style={{ fontSize: 12 }}>
                  {PERSONA_CHIP_LABEL[v2.persona]}
                </Text>
                <Text className="font-sans text-subtle" style={{ fontSize: 12 }}>· Cambiar en Opciones</Text>
                <ChevronRight size={13} strokeWidth={2.4} className="text-subtle" />
              </Pressable>
            ) : (
              <PersonaNudge onPress={() => router.push('/coach/onboarding/persona')} />
            )}

            {allDone ? (
              <ClosingCard
                hasDemo={v2?.demoClientId != null}
                deleting={busy === 'demo'}
                onGoDashboard={() => router.replace('/coach/home')}
                onDeleteDemo={() => void onDeleteDemo()}
              />
            ) : null}

            {/* Los 5 pasos */}
            <View style={{ gap: 12 }}>
              {resolveStepViews(steps, completed).map((view) => (
                <StepCard
                  key={view.step.key}
                  view={view}
                  persona={persona}
                  ctaLabel={STEP_CTA[view.step.key]}
                  route={resolveRnRoute(view.step, { demoClientId: v2?.demoClientId ?? null })}
                  onOpen={() => openStep(view.step)}
                  viveTuApp={
                    view.step.key === 'vive_tu_app'
                      ? { busy: busy === 'vive', onPress: () => void onViveTuApp(), enabled: v2?.demoClientId != null }
                      : null
                  }
                />
              ))}
            </View>

            {/* Tu marca, en compacto */}
            <BrandCard
              brandName={branding?.displayName || data?.coach.brandName || 'Tu marca'}
              primaryColor={branding?.primaryColor ?? data?.coach.primaryColor ?? theme.primary}
              logoUrl={branding?.logoUrl ?? null}
              hasBrand={v2?.signals.hasBrand === true}
              onOpenBrand={() => router.push('/coach/settings/brand')}
              onOpenPreview={() =>
                router.push({
                  pathname: '/coach/brand-preview',
                  params: {
                    color: branding?.primaryColor ?? data?.coach.primaryColor ?? '',
                    name: branding?.displayName || data?.coach.brandName || '',
                    logo: branding?.logoUrl ?? '',
                  },
                })
              }
            />

            {/* Alumno de ejemplo */}
            {v2?.demoClientId != null ? (
              <DemoCard
                name={demoFirstName}
                tagline={v2.persona != null ? PERSONA_COPY[v2.persona].demoTagline : null}
                noun={PERSONA_COPY[persona].noun.singular}
                viveBusy={busy === 'vive'}
                deleting={busy === 'demo'}
                onVive={() => void onViveTuApp()}
                onOpenFicha={() => router.push(`/coach/cliente/${v2.demoClientId}`)}
                onDelete={() => void onDeleteDemo()}
              />
            ) : null}

            {/* Pie: salida al panel + apagar la guía */}
            <View style={{ marginTop: 18, gap: 6 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/coach/home')}
                className="flex-row items-center"
                style={{ gap: 6, minHeight: 44 }}
              >
                <Text className="font-sans-bold text-strong" style={{ fontSize: 13 }}>Ir a mi panel</Text>
                <ArrowRight size={15} strokeWidth={2.4} className="text-strong" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onHideGuide}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text className="font-sans-semibold text-muted" style={{ fontSize: 12.5 }}>
                  No mostrar la guía en mi panel
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  )
}

/**
 * Banda de bienvenida (`?bienvenida=1`): DOS líneas, sin modal. La guía ya ES la bienvenida.
 * Gemela de `welcomeLines` de la web.
 */
function WelcomeBand({ firstName, persona }: { firstName: string; persona: Persona | null }) {
  const demoName = persona != null ? PERSONA_COPY[persona].demoName : null
  const noun = persona != null ? PERSONA_COPY[persona].noun.singular : 'alumno'
  const second =
    persona == null
      ? 'Elige tu especialidad cuando quieras y ordenamos el panel a tu medida. Mientras tanto, estos cinco pasos te dejan andando hoy.'
      : demoName == null
        ? 'Te dejamos el panel completo. Estos cinco pasos te dejan andando hoy.'
        : `Tu panel quedó armado a tu medida y te dejamos a ${demoName}, tu ${noun} de ejemplo, para que pruebes sin gastar cupo.`

  return (
    <View
      accessibilityLabel="Bienvenida"
      className="rounded-card bg-sport-100"
      style={{ paddingHorizontal: 14, paddingVertical: 13, marginTop: 8, marginBottom: 14 }}
    >
      <Text className="font-sans-extra text-sport-700" style={{ fontSize: 15 }}>
        Te damos la bienvenida, {firstName}.
      </Text>
      <Text className="font-sans text-sport-700" style={{ fontSize: 13, lineHeight: 19, marginTop: 3, opacity: 0.9 }}>
        {second}
      </Text>
    </View>
  )
}

/** Al coach viejo (sin persona) no se lo secuestra con la pantalla completa: se lo invita. */
function PersonaNudge({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center rounded-card border border-subtle bg-surface-card"
      style={{ gap: 11, padding: 14, marginTop: 4, marginBottom: 14 }}
    >
      <View className="items-center justify-center rounded-xl bg-sport-100" style={{ width: 42, height: 42 }}>
        <Compass size={20} strokeWidth={2} className="text-sport-600" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text className="font-sans-bold text-strong" style={{ fontSize: 14.5 }}>Elige tu especialidad</Text>
        <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 18, marginTop: 2 }}>
          Nos dices a qué te dedicas y dejamos el panel con lo tuyo a mano. Se cambia cuando quieras.
        </Text>
      </View>
      <ChevronRight size={18} strokeWidth={2.2} className="text-subtle" />
    </Pressable>
  )
}

/** Tarjeta de un paso: número/tilde, icono, copy y CTA. Solo el `next` va destacado. */
function StepCard({
  view,
  persona,
  ctaLabel,
  route,
  onOpen,
  viveTuApp,
}: {
  view: StepView
  persona: Persona
  ctaLabel: string
  route: string | null
  onOpen: () => void
  viveTuApp: { busy: boolean; enabled: boolean; onPress: () => void } | null
}) {
  const { theme } = useTheme()
  const { step, position, state } = view
  const done = state === 'done'
  const Icon = step.key === 'first_artifact' ? FIRST_ARTIFACT_ICON[persona] : STEP_ICON[step.key]

  return (
    <Card
      padding="md"
      radius="card"
      style={
        state === 'next'
          ? { borderWidth: 1.5, borderColor: theme.primary }
          : done
            ? { opacity: 0.82 }
            : undefined
      }
    >
      <View className="flex-row items-start" style={{ gap: 12 }}>
        <View
          className={`items-center justify-center rounded-xl ${done ? 'bg-success-100' : 'bg-sport-100'}`}
          style={{ width: 44, height: 44 }}
        >
          {done ? (
            <Check size={20} strokeWidth={2.6} className="text-success-700" />
          ) : (
            <Icon size={20} strokeWidth={2} className="text-sport-600" />
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="font-sans text-subtle" style={{ fontSize: 11, letterSpacing: 0.4 }}>
            PASO {position} DE {ONBOARDING_TOTAL_STEPS}
          </Text>
          <Text
            className="font-sans-bold text-strong"
            style={{ fontSize: 15, marginTop: 2, textDecorationLine: done ? 'line-through' : 'none' }}
          >
            {step.label}
          </Text>
          <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 18, marginTop: 3 }}>
            {step.description}
          </Text>

          {/* El paso 5 lo completa el ALUMNO, no el coach: no lleva CTA. */}
          {step.key === 'aha' ? (
            <Text className="font-sans text-subtle" style={{ fontSize: 11.5, lineHeight: 17, marginTop: 8 }}>
              Este lo completa tu alumno: te avisamos en el panel apenas ocurra.
            </Text>
          ) : viveTuApp != null ? (
            <StepAction
              label={viveTuApp.busy ? 'Abriendo…' : ctaLabel}
              icon={Eye}
              disabled={viveTuApp.busy || !viveTuApp.enabled}
              highlighted={state === 'next'}
              onPress={viveTuApp.onPress}
            />
          ) : route != null && !done ? (
            <StepAction label={ctaLabel} icon={ArrowRight} highlighted={state === 'next'} onPress={onOpen} />
          ) : null}

          {/* Sin alumno de ejemplo el paso 2 no tiene a quién entrar (rama «otra cosa», o el coach
              ya borró el ejemplo): se dice, en vez de dejar un botón muerto. */}
          {viveTuApp != null && !viveTuApp.enabled ? (
            <Text className="font-sans text-subtle" style={{ fontSize: 11.5, lineHeight: 17, marginTop: 6 }}>
              Disponible cuando tengas tu alumno de ejemplo.
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  )
}

function StepAction({
  label,
  icon: Icon,
  onPress,
  disabled,
  highlighted,
}: {
  label: string
  icon: LucideIcon
  onPress: () => void
  disabled?: boolean
  highlighted?: boolean
}) {
  const { theme } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      className={`flex-row items-center self-start rounded-control ${highlighted ? '' : 'border border-subtle'}`}
      style={{
        gap: 6,
        height: 42,
        paddingHorizontal: 14,
        marginTop: 10,
        opacity: disabled === true ? 0.55 : 1,
        backgroundColor: highlighted ? theme.primary : 'transparent',
      }}
    >
      <Text
        className="font-sans-bold"
        style={{ fontSize: 13, color: highlighted ? theme.primaryForeground : theme.foreground }}
      >
        {label}
      </Text>
      <Icon size={14} strokeWidth={2.4} color={highlighted ? theme.primaryForeground : theme.foreground} />
    </Pressable>
  )
}

/** Tu marca, en compacto: estado + las dos puertas que ya existen (Mi Marca y la vista previa). */
function BrandCard({
  brandName,
  primaryColor,
  logoUrl,
  hasBrand,
  onOpenBrand,
  onOpenPreview,
}: {
  brandName: string
  primaryColor: string
  logoUrl: string | null
  hasBrand: boolean
  onOpenBrand: () => void
  onOpenPreview: () => void
}) {
  return (
    <Card padding="md" radius="card" style={{ marginTop: 14 }}>
      <View className="flex-row items-center" style={{ gap: 12 }}>
        <View
          className="items-center justify-center rounded-xl"
          style={{ width: 44, height: 44, backgroundColor: primaryColor }}
        >
          <Palette size={20} strokeWidth={2} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="font-sans-bold text-strong" style={{ fontSize: 14.5 }} numberOfLines={1}>
            {brandName}
          </Text>
          <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 18, marginTop: 2 }}>
            {hasBrand
              ? logoUrl == null || logoUrl === ''
                ? 'Tu color ya está puesto. Sube tu logo y queda redonda.'
                : 'Tu logo y tu color ya están puestos.'
              : 'Tu color y tu logo son lo primero que ve tu alumno al entrar.'}
          </Text>
        </View>
      </View>

      <View className="flex-row flex-wrap items-center" style={{ gap: 8, marginTop: 12 }}>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenBrand}
          className="flex-row items-center rounded-control border border-subtle"
          style={{ gap: 6, height: 40, paddingHorizontal: 13 }}
        >
          <Text className="font-sans-bold text-strong" style={{ fontSize: 12.5 }}>Abrir Mi Marca</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenPreview}
          className="flex-row items-center rounded-control"
          style={{ gap: 6, height: 40, paddingHorizontal: 13 }}
        >
          <Eye size={14} strokeWidth={2.4} className="text-muted" />
          <Text className="font-sans-bold text-muted" style={{ fontSize: 12.5 }}>Vista del alumno</Text>
        </Pressable>
      </View>
    </Card>
  )
}

/** Alumno de ejemplo: entrar como él, abrir su ficha o borrarlo con todo lo sembrado. */
function DemoCard({
  name,
  tagline,
  noun,
  viveBusy,
  deleting,
  onVive,
  onOpenFicha,
  onDelete,
}: {
  name: string
  tagline: string | null
  noun: string
  viveBusy: boolean
  deleting: boolean
  onVive: () => void
  onOpenFicha: () => void
  onDelete: () => void
}) {
  return (
    <Card padding="md" radius="card" style={{ marginTop: 12 }}>
      <View className="flex-row items-center self-start rounded-pill bg-surface-sunken" style={{ paddingHorizontal: 9, paddingVertical: 3 }}>
        <Text className="font-sans-bold text-muted" style={{ fontSize: 10.5 }}>
          {`${noun[0]?.toUpperCase() ?? ''}${noun.slice(1)} de ejemplo`}
        </Text>
      </View>
      <Text className="font-sans-bold text-strong" style={{ fontSize: 15, marginTop: 8 }}>{name}</Text>
      <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 18, marginTop: 2 }}>
        {tagline ?? 'Está cargado con datos de mentira para que pruebes sin gastar cupo.'}
      </Text>
      <Text className="font-sans text-subtle" style={{ fontSize: 11.5, lineHeight: 17, marginTop: 6 }}>
        No ocupa tu cupo y no recibe correos.
      </Text>

      <View className="flex-row flex-wrap items-center" style={{ gap: 8, marginTop: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ver como ${name}`}
          disabled={viveBusy}
          onPress={onVive}
          className="flex-row items-center rounded-control border border-subtle"
          style={{ gap: 6, height: 40, paddingHorizontal: 13, opacity: viveBusy ? 0.55 : 1 }}
        >
          <Eye size={14} strokeWidth={2.4} className="text-strong" />
          <Text className="font-sans-bold text-strong" style={{ fontSize: 12.5 }}>
            {viveBusy ? 'Abriendo…' : `Ver como ${name}`}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenFicha}
          className="flex-row items-center rounded-control"
          style={{ gap: 6, height: 40, paddingHorizontal: 13 }}
        >
          <Text className="font-sans-bold text-muted" style={{ fontSize: 12.5 }}>Ver su ficha</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Borrar el alumno de ejemplo"
          disabled={deleting}
          onPress={onDelete}
          className="flex-row items-center rounded-control"
          style={{ gap: 6, height: 40, paddingHorizontal: 11, opacity: deleting ? 0.55 : 1 }}
        >
          <Trash2 size={14} strokeWidth={2.4} className="text-muted" />
          <Text className="font-sans-bold text-muted" style={{ fontSize: 12.5 }}>
            {deleting ? 'Borrando…' : 'Borrar ejemplo'}
          </Text>
        </Pressable>
      </View>
    </Card>
  )
}

/** Cierre 5/5. El confeti ya lo lanzó el aha: acá no se repite. */
function ClosingCard({
  hasDemo,
  deleting,
  onGoDashboard,
  onDeleteDemo,
}: {
  hasDemo: boolean
  deleting: boolean
  onGoDashboard: () => void
  onDeleteDemo: () => void
}) {
  const { theme } = useTheme()
  return (
    <Card
      padding="md"
      radius="card"
      style={{ marginBottom: 14, backgroundColor: theme.success + '1F', borderColor: theme.success + '4D', borderWidth: 1 }}
    >
      <View className="flex-row items-start" style={{ gap: 12 }}>
        <View className="items-center justify-center rounded-xl" style={{ width: 42, height: 42, backgroundColor: theme.success }}>
          <PartyPopper size={20} strokeWidth={2} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="font-sans-extra text-success-700" style={{ fontSize: 15.5 }}>
            Listo: los cinco pasos están hechos
          </Text>
          <Text className="font-sans text-success-700" style={{ fontSize: 12.5, lineHeight: 18, marginTop: 3, opacity: 0.9 }}>
            Tu app está andando con tu marca y tu primer alumno ya la usó. De acá en adelante, el
            panel es tu lugar de trabajo.
          </Text>
          <View className="flex-row flex-wrap items-center" style={{ gap: 8, marginTop: 12 }}>
            <Pressable
              accessibilityRole="button"
              onPress={onGoDashboard}
              className="flex-row items-center rounded-control"
              style={{ gap: 6, height: 42, paddingHorizontal: 14, backgroundColor: theme.primary }}
            >
              <Text className="font-sans-bold" style={{ fontSize: 13, color: theme.primaryForeground }}>
                Ir a mi panel
              </Text>
              <ArrowRight size={14} strokeWidth={2.4} color={theme.primaryForeground} />
            </Pressable>
            {hasDemo ? (
              <Pressable
                accessibilityRole="button"
                disabled={deleting}
                onPress={onDeleteDemo}
                className="flex-row items-center rounded-control"
                style={{ gap: 6, height: 42, paddingHorizontal: 12, opacity: deleting ? 0.55 : 1 }}
              >
                <Trash2 size={14} strokeWidth={2.4} color={theme.success} />
                <Text className="font-sans-bold" style={{ fontSize: 12.5, color: theme.success }}>
                  {deleting ? 'Borrando…' : 'Borrar ejemplo'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  )
}

/** Anillo n/5 de la cabecera. */
function GuideRing({ done, total, color }: { done: number; total: number; color: string }) {
  const { theme } = useTheme()
  const size = 62
  const stroke = 5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = total > 0 ? Math.min(Math.max(done / total, 0), 1) : 0

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Guía de inicio, ${done} de ${total} pasos`}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.muted} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text className="font-display-black text-strong" style={{ fontSize: 17 }}>{done}/{total}</Text>
    </View>
  )
}
