import 'react-native-gesture-handler'
// Sentry SEGUNDO (detrás de gesture-handler, que exige ir primero) y antes que todo lo demás:
// Babel emite los require() en orden de fuente, así que un throw a tiempo de módulo en cualquier
// import de abajo solo llega a Sentry si el init ya corrió. Ver lib/sentry-boot.ts (21-08-2026).
import { SENTRY_DSN, navigationIntegration, syncSentryUser } from '../lib/sentry-boot'
import '../global.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { Stack, useNavigationContainerRef, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import * as Notifications from 'expo-notifications'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
// EVA Design System families (TOKENS.md §4): Archivo (display),
// Hanken Grotesk (UI/body), JetBrains Mono (metrics/timers).
// 2R-3: los slots display 600-900 se registran vía brandDisplayFontMap (lib/brand-fonts.ts)
// — Archivo real por default, o la fuente white-label del coach (espejo de --brand-font web).
import { Archivo_400Regular, Archivo_500Medium } from '@expo-google-fonts/archivo'
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk'
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono'
// Share Entreno: Inter FIJA (FONT.share*). Los assets ya viajaban en el bundle por el catálogo
// white-label (`lib/brand-fonts.ts`), pero solo se registraban cuando el coach elegía Inter.
import { Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter'
import type { Session } from '@supabase/supabase-js'
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated'
import * as Sentry from '@sentry/react-native'
import type { ErrorBoundaryProps } from 'expo-router'
import { supabase } from '../lib/supabase'
import { registerSessionCacheJanitor } from '../lib/auth-actions'
import { brandDisplayFontMap } from '../lib/brand-fonts'
import { loadStoredBranding, type CoachBranding } from '../lib/branding'
import { ThemeProvider, useTheme } from '../context/ThemeContext'
import { DashboardReadyProvider } from '../context/DashboardReadyContext'
import { DashboardSplashOverlay } from '../components/entry/DashboardSplashOverlay'
import { ENTRY_TOKENS } from '../lib/theme'
import { configurePushHandler, setupAndroidChannel, syncPushToken } from '../lib/push'
import { Toaster } from '../components/Toast'
import { AppErrorBoundary } from '../components/AppErrorBoundary'
import { BiometricLock } from '../components/BiometricLock'
import { SessionMorphProvider } from '../components/alumno/workout/v3/session-morph'
import { observeAppStateForRelock, shouldArmBiometricLock } from '../lib/biometric'
import { useUpdates } from 'expo-updates'
import { checkForOtaUpdate, promptReloadOnce } from '../lib/ota'
import { registerRestNotificationEvents } from '../components/alumno/workout/timers/rest-remote-commands'
import { registerCardioNotificationEvents } from '../components/alumno/workout/timers/cardio-remote-commands'
import { registerLiveActivityCommandDrain } from '../components/alumno/workout/timers/live-activity-commands'
import { AppState, View } from 'react-native'

// Retain the native launch screen until stored branding and fonts are ready.
// During Fast Refresh it may already be hidden, so that rejection is harmless.
void SplashScreen.preventAutoHideAsync().catch(() => {})

// Telemetría de errores (E0-G1 / G11 §1.8): el `Sentry.init` y la integración de navegación viven
// en `lib/sentry-boot.ts`, importado PRIMERO arriba. Acá solo se consumen `SENTRY_DSN` y
// `navigationIntegration` (mismo gate: sin DSN, no-op total).

// Expo Router: fallback global ante un throw no atrapado (en vez de pantalla blanca).
// Envolvemos el boundary de marca para reportar el error a Sentry (si hay DSN).
function ReportingErrorBoundary(props: ErrorBoundaryProps) {
  useEffect(() => {
    if (SENTRY_DSN && props.error) Sentry.captureException(props.error)
  }, [props.error])
  return <AppErrorBoundary {...props} />
}
export { ReportingErrorBoundary as ErrorBoundary }

configurePushHandler()

// Botones de las notificaciones vivas del ejecutor: descanso (Pausar / +15 s / Saltar / Reanudar,
// QA-11 fase 2) y cardio (Pausar / Fase siguiente / Reanudar).
// A nivel de MÓDULO, no dentro de un componente: `notifee.onBackgroundEvent` es un handler HEADLESS
// que Android invoca levantando el bundle JS con la app en background o cerrada, cuando NO hay árbol
// React montado; registrarlo en un efecto lo dejaría fuera de alcance justo en el caso que importa.
// Ambas llamadas se ANOTAN en un registro compartido (`timers/notification-events.ts`) que hace UN
// solo `onBackgroundEvent` para toda la app y despacha por prefijo de action id — Notifee admite un
// único handler de background, así que dos registros se pisarían entre sí (ver esa cabecera).
// Idempotentes y NO-OP total sin la lib nativa enlazada. Sin ciclos de import: los puentes sólo
// importan módulos de notificación (ninguno importa hooks ni este layout).
registerRestNotificationEvents()
registerCardioNotificationEvents()

// Gemelo iOS de lo anterior (Ola 7A · Live Activities): los botones del lockscreen/Dynamic Island son
// App Intents que corren en el proceso de la app SIN runtime JS garantizado, así que no hay a quién
// emitirles un evento — dejan el comando escrito en el App Group y el JS lo drena al volver la app al
// frente. Se registra acá, también a nivel de MÓDULO, para que el drenaje inicial ocurra aunque la app
// se haya abierto DESDE el botón. Idempotente y NO-OP total en Android y en binarios sin el módulo
// nativo enlazado.
registerLiveActivityCommandDrain()

function ThemedStatusBar() {
  const { resolvedScheme } = useTheme()
  return <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
}

function RootLayoutNav() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const router = useRouter()
  const segments = useSegments()
  const syncedUserId = useRef<string | null>(null)
  const responseListener = useRef<Notifications.EventSubscription | null>(null)

  // Process deep link URL: parse auth hash tokens for password recovery
  const processDeepLink = useCallback((url: string) => {
    const hash = url.split('#')[1]
    if (!hash) return
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type')
    if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(() => {
        if (type === 'recovery') router.replace('/(auth)/reset-password')
      })
    }
  }, [router])

  useEffect(() => {
    setupAndroidChannel()

    // Notification tap handler
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined
      if (data?.screen) router.push(data.screen as any)
    })

    // Deep link: app opened from cold start via URL
    Linking.getInitialURL().then((url) => { if (url) processDeepLink(url) })

    // Deep link: app already running, receives URL
    const linkSub = Linking.addEventListener('url', ({ url }) => processDeepLink(url))

    return () => {
      responseListener.current?.remove()
      linkSub.remove()
    }
  }, [processDeepLink, router])

  useEffect(() => {
    registerSessionCacheJanitor()
    // `syncSentryUser`: solo el uid, para cruzar un crash con su cuenta (lib/sentry-boot.ts).
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      syncSentryUser(data.session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s)
      syncSentryUser(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  // OTA en foreground (E0-G6): chequea al abrir y al volver de background.
  // No-op en __DEV__; throttled a 1 check/hora dentro de lib/ota.ts.
  useEffect(() => {
    checkForOtaUpdate()
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') checkForOtaUpdate()
    })
    return () => sub.remove()
  }, [])

  // 🔴 12-08: el aviso de update NO salía cuando el que bajaba el bundle era el chequeo AUTOMÁTICO
  // de expo-updates (ON_LOAD por defecto): para cuando corría nuestro `checkForUpdateAsync` ya no
  // quedaba nada "disponible" que anunciar, y el update se quedaba esperando un segundo arranque en
  // frío — desde afuera, "el OTA no llega". `isUpdatePending` es el estado real: hay bundle nuevo
  // descargado listo para aplicar, sin importar quién lo bajó. El guard de `promptReloadOnce` evita
  // el Alert duplicado si ambos caminos se cruzan.
  const { isUpdatePending } = useUpdates()
  useEffect(() => {
    if (isUpdatePending) promptReloadOnce()
  }, [isUpdatePending])

  useEffect(() => {
    if (session === undefined) return
    const section = segments[0]
    const subroute = (segments as string[])[1]
    const isProtected =
      section === 'coach' ||
      (section === 'alumno' && subroute !== 'codigo')
    if (!session && isProtected) {
      // Race-safe: signInWithPassword may have stored the session in supabase
      // before our onAuthStateChange listener updated React state.
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) {
          // Telemetria del PUNTO DE EXPULSION: solo llegamos aca si de verdad NO hay sesion en
          // storage (SIGNED_OUT real). Si esto aparece justo tras cargar el dashboard, la causa
          // esta aguas arriba (algun signOut) — el breadcrump deja el rastro para diagnosticarlo.
          Sentry.addBreadcrumb({
            category: 'auth',
            level: 'info',
            message: 'RootLayoutNav: expulsion a login (sesion nula en ruta protegida)',
            data: { section, subroute },
          })
          router.replace('/')
        }
      })
    }
  }, [router, session, segments])

  // Sync push token once per session
  useEffect(() => {
    if (!session?.user.id) { syncedUserId.current = null; return }
    if (syncedUserId.current === session.user.id) return
    syncedUserId.current = session.user.id
    syncPushToken(session.user.id, supabase)
  }, [session?.user.id])

  // Ola 0: bloqueo biométrico opt-in. Si hay sesión y el usuario lo activó, bloquear al
  // entrar y al volver de background. Siempre con escape a contraseña (BiometricLock).
  //
  // 🔴 26-08 — loop de Face ID reportado por una alumna: acá se armaba el bloqueo en CADA
  // transición a 'active', y el propio prompt biométrico genera esa transición al cerrarse
  // ⇒ desbloquear re-armaba el bloqueo, que reabría el prompt, para siempre. Peor: se
  // disparaba en el instante de activar el toggle en el perfil (ese `authenticate` de
  // confirmación también vuelve a 'active' con la pref ya guardada), o sea el loop empezaba
  // justo al prender la feature. Ahora el veredicto lo da `observeAppStateForRelock`, que
  // exige un background REAL e ignora el ruido del prompt (ver lib/biometric.ts).
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    if (!session?.user.id) { setLocked(false); return }
    shouldArmBiometricLock().then((on) => { if (on) setLocked(true) }).catch(() => {})
  }, [session?.user.id])
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      // `observeAppStateForRelock` es un reducer con estado: hay que pasarle TODOS los cambios,
      // no solo los 'active', porque es el que ve el background y decide si contó como salida.
      if (!observeAppStateForRelock(s)) return
      if (!session?.user.id) return
      shouldArmBiometricLock().then((on) => { if (on) setLocked(true) }).catch(() => {})
    })
    return () => sub.remove()
  }, [session?.user.id])

  const biometricUp = locked && !!session

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {biometricUp ? <BiometricLock onUnlock={() => setLocked(false)} /> : null}
      {/* QA-5 — el splash de marca ES el loader del dashboard. Vive ACA, hermano del Stack
          (mismo patrón que Toaster/BiometricLock), porque el `SplashGate` de `app/index.tsx`
          se desmontaba en el `router.replace` y descubría el skeleton intermedio. Solo se
          arma en cold start CON sesión (su único emisor es el gate cuando rutea a un
          dashboard) y se retira cuando la home resuelve su primer load — o al vencer su tope.
          Va DESPUÉS del BiometricLock y `suppressed` con él: el splash nunca puede tapar una
          pantalla que exige interacción. */}
      <DashboardSplashOverlay suppressed={biometricUp} />
    </>
  )
}

function RootLayout() {
  // Enganche del rastro de navegación (ver `navigationIntegration` arriba). El ref que
  // devuelve `useNavigationContainerRef` es el del store de expo-router: estable entre
  // renders y válido fuera del navegador, así que el efecto corre una sola vez. Para cuando
  // corre —efecto pasivo— el `<NavigationContainer>` que expo-router monta POR ENCIMA de este
  // layout ya adjuntó su ref (los layout effects del ancestro se ejecutan antes que cualquier
  // efecto pasivo del árbol), de modo que `current` está poblado y la integración alcanza a
  // suscribirse antes de la primera navegación del usuario.
  const navigationRef = useNavigationContainerRef()
  useEffect(() => {
    if (SENTRY_DSN && navigationRef?.current) navigationIntegration.registerNavigationContainer(navigationRef)
  }, [navigationRef])

  // 2R-3 tipografía white-label: el branding almacenado decide QUÉ asset se registra bajo
  // los nombres de slot display ANTES de cargar fuentes (espejo del layout /c web, que fija
  // --brand-font server-side por request: c/[coach_slug]/layout.tsx:194-195,309). El splash
  // nativo sigue visible durante esta lectura (preventAutoHideAsync arriba). El mapeo queda
  // fijo por cold start — mismo contrato que web, donde un cambio de fuente del coach
  // requiere full reload de la PWA.
  const [storedBranding, setStoredBranding] = useState<CoachBranding | null | undefined>(undefined)
  useEffect(() => {
    loadStoredBranding()
      .then((b) => setStoredBranding(b))
      .catch(() => setStoredBranding(null))
  }, [])
  if (storedBranding === undefined) return null
  return <RootLayoutWithFonts branding={storedBranding} />
}

// `Sentry.wrap` envuelve el árbol en el TouchEventBoundary (breadcrumbs de toque: qué control
// tocó el usuario justo antes del crash) y el Profiler raíz. Va sobre el export por defecto
// —no adentro— porque el boundary tiene que quedar POR ENCIMA de todo, incluido el
// GestureHandlerRootView. Sin DSN el árbol extra existe pero no reporta nada.
export default Sentry.wrap(RootLayout)

function RootLayoutWithFonts({ branding }: { branding: CoachBranding | null }) {
  const [fontsLoaded] = useFonts({
    // EVA Design System
    Archivo_400Regular,
    Archivo_500Medium,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
    // Share Entreno (bloque del card): Inter fija, NUNCA la fuente de marca. Va ANTES del spread
    // de slots porque no colisiona con ninguno ('Inter_*' no es un nombre de slot display).
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    // Slots display 600-900 ('Archivo_600SemiBold'..'Archivo_900Black'): brand font
    // resuelta (gate Pro+ + preset + catálogo cerrado) o Archivo real. Va AL FINAL
    // para que gane sobre cualquier entrada estática homónima.
    ...brandDisplayFontMap(branding),
  })
  const splashHiddenRef = useRef(false)
  const handleRootLayout = useCallback(() => {
    if (splashHiddenRef.current) return
    splashHiddenRef.current = true
    // Hide only after React has committed its first ready frame. There is no
    // timer or second JS splash between the native launch screen and the app.
    void SplashScreen.hideAsync().catch(() => {
      splashHiddenRef.current = false
    })
  }, [])

  if (!fontsLoaded) return null

  return (
    // Mitad OTA del anti-flash de la entrada dark v1 (DESIGN-SPEC §5.2): el window
    // background nativo no está declarado en app.json, así que sin este color el root
    // resuelve a blanco y se ve un flash al ocultar el splash. La mitad nativa
    // (`expo.backgroundColor` / `android.backgroundColor`) viaja en la Fase 5.
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: ENTRY_TOKENS.canvasEntry }}
      onLayout={handleRootLayout}
    >
      <ReducedMotionConfig mode={ReduceMotion.System} />
      <SafeAreaProvider>
        {/* ThemeProvider DEBE envolver a BottomSheetModalProvider (no al revés).
            @gorhom teletransporta el CONTENIDO de cada BottomSheetModal a su
            `BottomSheetHostingContainer`, que se renderiza como HERMANO —fuera de
            `{children}`— del provider. Si ThemeProvider vive dentro del modal
            provider, ese host queda FUERA del ThemeContext y todo sheet cuyo
            contenido llame `useTheme()` (ListRow, el propio surface, etc.) lanza
            "useTheme must be used inside ThemeProvider" → el ErrorBoundary raíz
            traga la pantalla entera ("Algo salió mal"). Fue el P0 del menú "Más"
            del alumno (QA ronda 4, hallazgo 9); afecta a TODO sheet (ejecutor,
            share-card…). Con ThemeProvider afuera, el host —y su `themeVars`
            View— quedan dentro del contexto y los sheets resuelven tokens/marca. */}
        <ThemeProvider>
          {/* Señal `ready` del dashboard + handoff de identidad del splash (QA-5). El store
              vive en el módulo, así que montar el provider cuesta cero renders y la señal de
              la home no re-renderiza el árbol. Va DENTRO de ThemeProvider para no alterar el
              orden que exige el comentario de arriba. */}
          <DashboardReadyProvider>
            <BottomSheetModalProvider>
              <ThemedStatusBar />
              {/* P0 focus-hop: el navegador va en un View PLANO. Antes lo envolvía un
                  MotiView que animaba opacity — vista animada persistente sobre
                  react-native-screens bajo Fabric, un anti-patrón que amplifica el
                  robo de foco. La transición de arranque termina al ocultar el splash
                  nativo después del primer layout listo, sin animar el navegador. */}
              {/* Despegue (ceremonia de arranque del workout): el provider vive en el ROOT —dentro de
                  ThemeProvider, que el overlay consume para el acento/logo del coach— y NO en el layout
                  de tabs del alumno. Su overlay se pinta en un <Modal> nativo y en Android RN CIERRA el
                  Dialog (onDetachedFromWindow → dismiss, sin callback a JS) cuando la pantalla que lo
                  monta se detacha; como la ruta del ejecutor es hermana de (tabs) en el Stack raíz, el
                  `router.push` de los ~1,3s mataba la ceremonia y el alumno aterrizaba sin el "TOCA PARA
                  COMENZAR". Desde el root el host nunca se detacha (espejo del portal-a-body + provider
                  persistente del layout /c de la web). `useSessionMorph()` sigue resolviendo igual. */}
              <SessionMorphProvider>
                <View style={{ flex: 1 }}>
                  <RootLayoutNav />
                </View>
              </SessionMorphProvider>
              {/* Transient feedback overlay — single mount point (parity with web <Toaster/>). */}
              <Toaster />
            </BottomSheetModalProvider>
          </DashboardReadyProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
