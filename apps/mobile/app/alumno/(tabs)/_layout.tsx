import { useEffect, useRef } from 'react'
import { AppState, View } from 'react-native'
import { Tabs, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { flushLogQueue, flushNutritionQueue, getPendingLogCount, getPendingNutritionCount } from '../../../lib/offline-cache'
import { getClientProfile } from '../../../lib/client'
import { sessionFlags } from '../../../lib/session-flags'
import { useEntitlements } from '../../../lib/entitlements'
import { AlumnoMobileChrome } from '../../../components/alumno/AlumnoMobileChrome'
import { StudentAccessBlocked } from '../../../components/alumno/StudentAccessBlocked'
import { SessionMorphProvider } from '../../../components/alumno/workout/v3/session-morph'

export default function AlumnoTabsLayout() {
  const router = useRouter()
  // Gate de BLOQUEO TOTAL post-gracia (executor-v3 decision 9): cuando el acceso del alumno resuelve
  // a 'blocked' (post-gracia), se monta la pantalla de bloqueo EN LUGAR de las tabs — ni dashboard,
  // ni plan, ni historial (reemplaza el hibrido banner+solo-lectura). Fail-OPEN: el default es
  // 'active' hasta resolver (el guard duro vive en DB/RLS), asi que no hay flash de bloqueo en frio.
  // El estado 'grace' NO entra aca: conserva el banner discreto del home.
  const { studentAccess } = useEntitlements()
  const appState = useRef(AppState.currentState)
  // Guarda anti-carrera: una sola navegación al gate de suspensión (el chequeo al
  // montar y el de AppState pueden coincidir; el flag evita dos router.replace).
  const redirecting = useRef(false)

  // Ola 0: gate de acceso a nivel navegación (cubre TODAS las tabs, no solo Home).
  // Alumno pausado/archivado → /alumno/suspended. Cambio de clave forzado → /change-password.
  useEffect(() => {
    let mounted = true
    getClientProfile()
      .then((c) => {
        if (!mounted || !c) return
        if (c.blocked) {
          redirecting.current = true
          router.replace('/alumno/suspended')
        } else if (c.forcePasswordChange && !sessionFlags.pwChanged) router.replace('/change-password')
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        const [pendingNutrition, pendingWorkout] = await Promise.all([
          getPendingNutritionCount(),
          getPendingLogCount(),
        ])
        if (pendingNutrition > 0) flushNutritionQueue(supabase)
        if (pendingWorkout > 0) flushLogQueue(supabase)

        // Re-evaluar el gate al volver del background — el alumno pudo ser
        // pausado/archivado mientras la app estaba suspendida.
        if (!redirecting.current) {
          const c = await getClientProfile().catch(() => null)
          if (c?.blocked && !redirecting.current) {
            redirecting.current = true
            router.replace('/alumno/suspended')
          }
        }
      }
      appState.current = nextState
    })
    return () => sub.remove()
  }, [])

  // Capsula flotante DS (E1-01, espejo del ClientNav mobile web): Inicio ·
  // Nutrición · Aprender · Check-in + "Más" (Historial, Perfil). El tabBar es
  // absoluto/flotante (altura 0 en el flujo). El web fija la nav (position:fixed,
  // ClientNav.tsx:471-474) y el CONTENIDO scrollea POR DETRAS: el clearance vive
  // como padding-bottom del contenedor scrolleable, NO recortando el viewport.
  // Aqui espejamos eso: la escena ocupa TODA la altura y cada pantalla reserva
  // `insets.bottom + ALUMNO_TABBAR_CLEARANCE` en el contentContainer de su scroll
  // (ver ALUMNO_TABBAR_CLEARANCE). El branding activo lo resuelve la chrome via
  // tokens NativeWind.

  // Bloqueo total post-gracia: se monta ANTES que las tabs (ningun screen del alumno se monta).
  // Va despues de los hooks de arriba para no romper el orden de hooks entre renders.
  if (studentAccess.state === 'blocked') {
    return (
      <View className="flex-1 bg-surface-app">
        <StudentAccessBlocked />
      </View>
    )
  }

  return (
    <SessionMorphProvider>
    <View className="flex-1 bg-surface-app">
      <Tabs
        tabBar={(props) => <AlumnoMobileChrome {...props} />}
        screenOptions={{
          headerShown: false,
          // QA-8 (banda negra): antes la escena llevaba `paddingBottom = inset +
          // clearance`, que RECORTABA el viewport de la escena — el contenedor
          // full-bleed de cada pantalla (View bg-surface-app + <AppBackground/>
          // absoluteFill: home.tsx:344-345) terminaba SECO en la linea de recorte y
          // dejaba abajo una franja de la escena transparente que revelaba el root
          // <View bg-surface-app> PLANO (sin el glow/grilla del AppBackground), leido
          // como una banda negra solida bajo la capsula. Sin paddingBottom la escena
          // ocupa todo el alto: el AppBackground cubre el viewport completo y el
          // contenido scrollea POR DETRAS de la capsula (1:1 web). El clearance se
          // reserva en el contentContainer de cada scroll de las 6 tabs
          // (paddingBottom = insets.bottom + ALUMNO_TABBAR_CLEARANCE via
          // useSafeAreaInsets, inset-aware — NO en sceneStyle, que recortaria el
          // viewport y reviviria la banda negra), asi el ultimo item nunca queda
          // tapado por la capsula. `backgroundColor: transparent` deja al
          // <View bg-surface-app> pintar hasta el borde fisico inferior (SDK54
          // edge-to-edge), evitando el fondo gris claro del DefaultTheme.
          sceneStyle: {
            backgroundColor: 'transparent',
          },
        }}
      >
        <Tabs.Screen name="home" options={{ title: 'Inicio' }} />
        <Tabs.Screen name="nutricion" options={{ title: 'Nutrición' }} />
        <Tabs.Screen name="exercises" options={{ title: 'Aprender' }} />
        <Tabs.Screen name="check-in" options={{ title: 'Check-in' }} />
        <Tabs.Screen name="history" options={{ title: 'Historial' }} />
        <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
        {/* Workout se accede desde hero card del Home, no como tab directo */}
        <Tabs.Screen name="workout" options={{ href: null }} />
        {/* 2R-1: rutas de módulo (Perfil → Movimiento/Composición) como rutas
            OCULTAS dentro de tabs (href:null, mismo patrón que coach/team y
            coach/reactivate): así la cápsula sigue visible y "Más" queda activo
            dentro de ellas, igual que la web, donde /movimiento y /bodycomp viven
            bajo el layout con ClientNav siempre montado (c/[coach_slug]/layout.tsx:345,360)
            y moreRoutes las mantiene resaltadas (ClientNav.tsx:128-139). Los deep
            links /alumno/movement y /alumno/bodycomp no cambian: el grupo (tabs)
            no participa de la URL. */}
        <Tabs.Screen name="movement" options={{ href: null }} />
        <Tabs.Screen name="bodycomp" options={{ href: null }} />
        {/* 4A-01: superficie Nutrición V2 DENTRO de (tabs) como rutas ocultas
            (href:null). En web /nutrition-v2 y /nutrition-v2/scanner viven bajo el
            layout c/[coach_slug] con la cápsula ClientNav siempre montada y el ítem
            "Nutrición" activo (nutrition-v2/page.tsx:62-100, scanner/page.tsx:49-66);
            aquí lo mismo: la cápsula persiste y AlumnoMobileChrome pliega
            `nutrition-v2/*` al tile "Nutrición". El tab visible sigue siendo
            `nutricion`, que con el flag `nutritionV2Student` ON redirige a
            /alumno/nutrition-v2 (espejo del redirect V1→V2 de la web,
            nutrition/page.tsx:67-81); los deep links /alumno/nutrition-v2* no
            cambian porque el grupo (tabs) no participa de la URL. */}
        <Tabs.Screen name="nutrition-v2/index" options={{ href: null }} />
        <Tabs.Screen name="nutrition-v2/add-food-v2" options={{ href: null }} />
        <Tabs.Screen name="nutrition-v2/scanner" options={{ href: null }} />
      </Tabs>
    </View>
    </SessionMorphProvider>
  )
}
