import { useEffect, useState } from 'react'
import { Stack, usePathname, useRouter, useSegments } from 'expo-router'
import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RotateCcw } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { AppBackground } from '../../components/AppBackground'
import { Button } from '../../components/Button'
import { refreshCoachAccess, useCoachAccess } from '../../lib/coach-access'
import { getCachedCoachPersonaStatus, PERSONA_ROUTE, resolveCoachPersonaGate } from '../../lib/coach-persona'
import { OnboardingModeProvider } from '../../lib/onboarding-mode'

/** Unica ruta del arbol coach que un coach SIN acceso efectivo puede ver (es su salida). */
const REACTIVATE_PATH = '/coach/reactivate'

/**
 * Rutas del arbol coach que el gate de PERSONA nunca intercepta (espejo de
 * `PERSONA_GATE_EXEMPT_PREFIXES` en services/coach/persona.service): la pantalla misma (redirigir
 * sobre ella seria un loop) y las salidas de cuenta — elegir especialidad jamas puede quedar por
 * delante de recuperar el acceso.
 */
const PERSONA_EXEMPT_PATHS = [PERSONA_ROUTE, REACTIVATE_PATH, '/coach/subscription']

/**
 * Layout raiz del arbol COACH — existe para que el gate de suscripcion cubra TODAS sus rutas.
 *
 * Antes el gate vivia solo en `(tabs)/_layout.tsx`, de modo que las ~21 rutas coach fuera del grupo
 * de tabs (ficha del alumno, program-builder, nutrition-v2, cardio, bodycomp, movement, settings/*,
 * foods, tools, meal-groups, modules, brand-preview, nutrition-builder) quedaban SIN gate: un coach
 * con el plan vencido las abria y operaba normal. Ademas aquel chequeo corria una sola vez por
 * arranque (el layout de tabs no se desmonta al cambiar de tab), asi que un back-gesture bastaba
 * para volver al dashboard.
 *
 * Aca el gate es ESTADO (`useCoachAccess`), no un efecto de una pasada: mientras el acceso no esté
 * resuelto o `blocked` sea true no se renderiza ninguna ruta coach salvo /coach/reactivate. Se
 * revalida al volver de background y en cada navegacion dentro de /coach (throttled en el store).
 *
 * El `Stack` replica exactamente las opciones del navegador raiz (`headerShown: false`) para no
 * alterar la presentacion de ninguna pantalla existente: este layout agrega el gate, nada mas.
 */
export default function CoachLayout() {
  const { theme } = useTheme()
  const router = useRouter()
  const pathname = usePathname()
  const segments = useSegments()
  const insets = useSafeAreaInsets()
  const { blocked, ready, status, refresh } = useCoachAccess()

  const onReactivate = pathname === REACTIVATE_PATH
  const personaExempt = PERSONA_EXEMPT_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + '/'),
  )

  // Gate de PERSONA (onboarding v2 W5 F5.1). `null` = todavia sin veredicto.
  //
  // NO bloquea el render del arbol coach a proposito: el veredicto lo da un endpoint y hacer
  // esperar TODO el panel por una request en cada arranque es peor que el parpadeo (el home ya
  // muestra su propio loader mientras carga el dashboard, que tarda mas que esta consulta).
  // Fail-open: sin red, o si el server no pudo responder, `resolveCoachPersonaGate` devuelve null
  // y no se redirige a nadie. La consulta se resuelve UNA vez por sesion y por cuenta (cache con
  // dedupe en `lib/coach-persona`), asi que navegar dentro de /coach no dispara requests.
  const [needsPersona, setNeedsPersona] = useState<boolean | null>(
    () => getCachedCoachPersonaStatus()?.needsPersona ?? null,
  )

  // Revalidar en cada navegacion dentro del arbol coach. El store deduplica y aplica throttle, asi
  // que navegar rapido NO dispara una query por salto.
  const segmentKey = segments.join('/')
  useEffect(() => {
    void refreshCoachAccess()
  }, [segmentKey])

  // Expulsar SOLO con un veredicto resuelto. `blocked` incluye "todavia no resolvi" (ver
  // `useCoachAccess`), asi que sin este `ready` una revalidacion en vuelo mandaba a
  // /coach/reactivate a un coach al dia; al resolver, el efecto de abajo lo devolvia a /coach/home
  // y perdia la pantalla a la que iba (QA device 2026-08-08: la ficha de nutricion era inalcanzable).
  // Mientras no este resuelto no se navega, pero tampoco se renderiza el arbol coach: el fail-closed
  // vive en el `return` de abajo, que es donde corresponde.
  useEffect(() => {
    if (ready && blocked && !onReactivate) router.replace(REACTIVATE_PATH)
  }, [ready, blocked, onReactivate, router])

  useEffect(() => {
    if (ready && !blocked && onReactivate) router.replace('/coach/home')
  }, [blocked, onReactivate, ready, router])

  // Resolver el gate de persona recien con el acceso RESUELTO y vigente: a un coach vencido se le
  // pide pagar, no elegir especialidad.
  useEffect(() => {
    if (!ready || blocked) return
    let cancelled = false
    void resolveCoachPersonaGate().then((status) => {
      if (!cancelled) setNeedsPersona(status?.needsPersona ?? false)
    })
    return () => {
      cancelled = true
    }
  }, [ready, blocked, segmentKey])

  useEffect(() => {
    if (ready && !blocked && needsPersona === true && !personaExempt) router.replace(PERSONA_ROUTE)
  }, [ready, blocked, needsPersona, personaExempt, router])

  // Bloqueado y todavia fuera del muro: no renderizar el arbol coach ni un frame (antes se veia el
  // dashboard real por un instante mientras resolvia el `replace`).
  //
  // `status === 'error'` (no se pudo PREGUNTAR: sin red / 5xx) mantiene el fail-closed, pero desde
  // aca no hay navegacion posible: sin este reintento el loader quedaba sellado hasta reiniciar la
  // app o volver de background (auditoria 2026-08-09).
  if (blocked && !onReactivate) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <AppBackground />
        <EvaLoaderScreen subtitle={status === 'error' ? 'No pudimos verificar tu plan' : 'Revisando tu plan…'} />
        {status === 'error' ? (
          <View
            style={{
              position: 'absolute',
              left: 24,
              right: 24,
              bottom: insets.bottom + 40,
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Text
              className="font-sans text-[13px] text-muted"
              style={{ textAlign: 'center', lineHeight: 19, maxWidth: 300 }}
            >
              Revisa tu conexion e intenta de nuevo.
            </Text>
            <Button
              label="Reintentar"
              variant="outline"
              leftIcon={RotateCcw}
              onPress={() => {
                void refresh(true)
              }}
            />
          </View>
        ) : null}
      </View>
    )
  }

  // `OnboardingModeProvider` envuelve TODO el arbol coach: mientras la guia v2 este activa ningun
  // tour ni modal de modulo se dispara solo (decision del owner 22-08, «un solo onboarding por
  // area»). No consulta nada — lee la foto que el dashboard y la guia ya publican.
  return (
    <OnboardingModeProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </OnboardingModeProvider>
  )
}
