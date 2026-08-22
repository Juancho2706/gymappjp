import { useCallback, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Svg, { Circle } from 'react-native-svg'
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { ArrowRight, Minus } from 'lucide-react-native'
import {
  ONBOARDING_STEP_KEYS,
  nextStep,
  progress,
  type OnboardingStepKey,
} from '@eva/onboarding'
import { useTheme } from '../../context/ThemeContext'
import { useWorkspace } from '../../lib/workspace'
import { EvaFigure } from '../entry/EvaFigure'
import { EASE, useEvaMotion } from '../../lib/motion'
import { resolveSportRamp } from '../../lib/theme'
import {
  postCoachOnboardingEvent,
  useCoachOnboarding,
  type MobileOnboardingV2,
} from '../../lib/coach-dashboard'

/**
 * Píldora flotante de la guía de inicio — el único rastro de la guía dentro del panel de la app.
 *
 * Paridad con la web (`apps/web/src/components/coach/GuidePill.tsx`, decisión del owner 22-08): el
 * dashboard del día 1 se ve LLENO, así que la guía se mudó a su pantalla propia (`/coach/guia`) y
 * de ella queda acá un acceso permanente. Minimizada es un círculo de 48 px con la figura blanca
 * de EVA sobre el color de marca y un anillo de progreso; maximizada dice en qué va la guía y cuál
 * es el siguiente paso.
 *
 * Geometría: flota sobre la CÁPSULA del nav, no debajo. La cápsula
 * (`CoachMobileChrome.tsx`) vive en `bottom: insets.bottom + 16` y mide ≈70 px de alto
 * (padding 8×2 + tile de 52 + borde 1×2), así que la píldora arranca 12 px más arriba. Se alinea a
 * la izquierda porque el FAB de acciones rápidas del dashboard ocupa la derecha.
 *
 * Datos: NO consulta nada. El dashboard y la guía —las dos pantallas que ya pagan la consulta—
 * publican su foto en el store de `lib/coach-dashboard`, y la píldora la lee. Un coach que todavía
 * no cargó el panel en esta sesión simplemente no la ve.
 *
 * Se apaga sola con la guía completa, descartada, oculta, en un workspace administrado (team/org:
 * ese panel no es suyo) y en las pantallas donde estorbaría.
 */

/** Rutas donde la píldora NO se pinta. Espejo de `PILL_HIDDEN_PREFIXES` de la web. */
const HIDDEN_PREFIXES = [
  // La guía misma: sería un botón hacia donde ya estás.
  '/coach/guia',
  // «¿A qué te dedicas?»: pantalla completa de primer ingreso.
  '/coach/onboarding',
  // Lienzos densos de trabajo: el builder y los editores full-screen.
  '/coach/program-builder',
  '/coach/nutrition-builder',
] as const

/** Estado abierto/cerrado, por coach. Misma clave que la web, distinto almacén. */
function pillStorageKey(coachId: string): string {
  return `eva.guide-pill.v1:${coachId}`
}

const CIRCLE = 48
const RING_STROKE = 3
/** Alto real de la cápsula del nav + el aire que la separa de la píldora. */
const CAPSULE_BOTTOM = 16
const CAPSULE_HEIGHT = 70
const CAPSULE_GAP = 12

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

export function GuidePill() {
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const { theme, branding } = useTheme()
  const workspace = useWorkspace()
  const motion = useEvaMotion()
  const snapshot = useCoachOnboarding()

  const [expanded, setExpanded] = useState(true)
  const [ready, setReady] = useState(false)
  const coachId = snapshot?.coachId ?? null

  // Estado guardado por coach. Primera vez: expandida (el coach nuevo tiene que ver qué es esto).
  useEffect(() => {
    if (coachId == null) return
    let alive = true
    setReady(false)
    AsyncStorage.getItem(pillStorageKey(coachId))
      .then((saved) => {
        if (!alive) return
        setExpanded(saved !== 'collapsed')
        setReady(true)
      })
      .catch(() => {
        if (alive) setReady(true)
      })
    return () => {
      alive = false
    }
  }, [coachId])

  const visible = ready && snapshot != null && workspace.kind === 'standalone'
    && isPillVisible(snapshot.onboardingV2, pathname ?? '')

  const setOpen = useCallback(
    (next: boolean) => {
      setExpanded(next)
      if (coachId != null) {
        AsyncStorage.setItem(pillStorageKey(coachId), next ? 'expanded' : 'collapsed').catch(() => null)
      }
      void postCoachOnboardingEvent('guide_engagement', {
        widget: 'guide_pill',
        action: next ? 'pill_expand' : 'pill_collapse',
        progress_done: snapshot ? persistedDone(snapshot.onboardingV2) : 0,
        persona: snapshot?.onboardingV2.persona ?? 'sin_persona',
      })
    },
    [coachId, snapshot],
  )

  if (!visible || snapshot == null) return null

  const v2 = snapshot.onboardingV2
  const completed = completedMap(v2)
  const { done, total } = progress(completed)
  const step = v2.persona != null ? nextStep(v2.persona, completed) : null
  // Sin persona el siguiente paso no es de la guía: es elegir especialidad (decisión D8 — al coach
  // viejo no se lo secuestra con la pantalla completa, se lo invita desde acá).
  const nextLabel = v2.persona == null ? 'Elige tu especialidad' : (step?.label ?? 'Todo listo')

  // Color de marca CRUDO por la rampa sport (`branding.primaryColor`, no `theme.primary`, que está
  // clampeado por contraste): así el círculo queda del mismo tono que el resto del white-label.
  const brand = resolveSportRamp(branding?.primaryColor).sport500

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: insets.bottom + CAPSULE_BOTTOM + CAPSULE_HEIGHT + CAPSULE_GAP,
      }}
    >
      <View className="flex-row items-center self-start" style={{ gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Guía de inicio, ${done} de ${total}`}
          accessibilityState={{ expanded }}
          onPress={() => setOpen(!expanded)}
          hitSlop={6}
          style={{
            width: CIRCLE,
            height: CIRCLE,
            borderRadius: CIRCLE / 2,
            backgroundColor: brand,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#0D121C',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.26,
            shadowRadius: 16,
            elevation: 10,
          }}
        >
          <PillProgressRing done={done} total={total} reduced={motion.reduced} />
          <EvaFigure size={22} />
        </Pressable>

        {expanded ? (
          <PillPanel
            done={done}
            total={total}
            nextLabel={nextLabel}
            theme={theme}
            reduced={motion.reduced}
            onOpen={() => {
              void postCoachOnboardingEvent('guide_engagement', {
                widget: 'guide_pill',
                action: 'pill_open',
                progress_done: done,
                persona: v2.persona ?? 'sin_persona',
              })
              router.push('/coach/guia')
            }}
            onCollapse={() => setOpen(false)}
          />
        ) : null}
      </View>
    </View>
  )
}

/** Panel expandido: «Tu guía · n/5», el siguiente paso, «Abrir» y «–». */
function PillPanel({
  done,
  total,
  nextLabel,
  theme,
  reduced,
  onOpen,
  onCollapse,
}: {
  done: number
  total: number
  nextLabel: string
  theme: ReturnType<typeof useTheme>['theme']
  reduced: boolean
  onOpen: () => void
  onCollapse: () => void
}) {
  const enter = useSharedValue(reduced ? 1 : 0)
  useEffect(() => {
    enter.value = withTiming(1, { duration: reduced ? 0 : 220, easing: EASE.out })
  }, [enter, reduced])

  const style = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: (1 - enter.value) * -10 }],
  }))

  return (
    <Animated.View
      style={[
        style,
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 12,
          paddingRight: 6,
          paddingVertical: 6,
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.card,
          shadowColor: '#0D121C',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.2,
          shadowRadius: 16,
          elevation: 8,
        },
      ]}
    >
      <View style={{ minWidth: 0, maxWidth: 148 }}>
        <Text className="font-sans-extra text-strong" style={{ fontSize: 12 }}>
          Tu guía · {done}/{total}
        </Text>
        <Text className="font-sans-semibold text-muted" style={{ fontSize: 11.5 }} numberOfLines={1}>
          Siguiente: {nextLabel}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abrir la guía"
        onPress={onOpen}
        className="flex-row items-center rounded-pill bg-primary"
        style={{ gap: 4, height: 34, paddingHorizontal: 12 }}
      >
        <Text className="font-sans-bold" style={{ fontSize: 12.5, color: theme.primaryForeground }}>
          Abrir
        </Text>
        <ArrowRight size={13} strokeWidth={2.4} color={theme.primaryForeground} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Minimizar la guía"
        onPress={onCollapse}
        hitSlop={6}
        className="items-center justify-center rounded-pill"
        style={{ width: 34, height: 34 }}
      >
        <Minus size={16} strokeWidth={2.4} color={theme.mutedForeground} />
      </Pressable>
    </Animated.View>
  )
}

/** Anillo alrededor de la figura. Blanco sobre el color de marca: legible en los dos modos. */
function PillProgressRing({ done, total, reduced }: { done: number; total: number; reduced: boolean }) {
  const radius = (CIRCLE - RING_STROKE) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = total > 0 ? Math.min(Math.max(done / total, 0), 1) : 0
  const target = circumference * (1 - ratio)

  const offset = useSharedValue(circumference)
  useEffect(() => {
    offset.value = withTiming(target, { duration: reduced ? 0 : 420, easing: EASE.out })
  }, [offset, target, reduced])
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }))

  return (
    <Svg
      width={CIRCLE}
      height={CIRCLE}
      style={{ position: 'absolute', top: 0, left: 0 }}
      pointerEvents="none"
    >
      <Circle
        cx={CIRCLE / 2}
        cy={CIRCLE / 2}
        r={radius}
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={RING_STROKE}
        fill="none"
      />
      <AnimatedCircle
        cx={CIRCLE / 2}
        cy={CIRCLE / 2}
        r={radius}
        stroke="#FFFFFF"
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        animatedProps={animatedProps}
        transform={`rotate(-90 ${CIRCLE / 2} ${CIRCLE / 2})`}
      />
    </Svg>
  )
}

// ── Resolvers (exportados para poder probarlos sin montar el árbol) ──────────────────────────

/** Los 5 pasos como mapa completo. Lo que no está persistido cuenta como pendiente. */
export function completedMap(v2: MobileOnboardingV2): Record<OnboardingStepKey, boolean> {
  const out = {} as Record<OnboardingStepKey, boolean>
  for (const key of ONBOARDING_STEP_KEYS) out[key] = v2.guide.completed[key] === true
  return out
}

function persistedDone(v2: MobileOnboardingV2): number {
  return progress(completedMap(v2)).done
}

/**
 * ¿Se pinta la píldora? A diferencia del redirect de primera entrada, con `persona === null` SÍ se
 * pinta: es justamente al coach al que hay que invitar a elegir especialidad.
 */
export function isPillVisible(v2: MobileOnboardingV2, pathname: string): boolean {
  if (v2.guide.dismissed || v2.guide.hidden) return false
  if (persistedDone(v2) >= ONBOARDING_STEP_KEYS.length) return false
  return !HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'))
}
