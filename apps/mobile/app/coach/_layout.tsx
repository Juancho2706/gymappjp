import { useEffect } from 'react'
import { Stack, usePathname, useRouter, useSegments } from 'expo-router'
import { View } from 'react-native'
import { useTheme } from '../../context/ThemeContext'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { AppBackground } from '../../components/AppBackground'
import { refreshCoachAccess, useCoachAccess } from '../../lib/coach-access'

/** Unica ruta del arbol coach que un coach SIN acceso efectivo puede ver (es su salida). */
const REACTIVATE_PATH = '/coach/reactivate'

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
  const { blocked, ready } = useCoachAccess()

  const onReactivate = pathname === REACTIVATE_PATH

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

  // Bloqueado y todavia fuera del muro: no renderizar el arbol coach ni un frame (antes se veia el
  // dashboard real por un instante mientras resolvia el `replace`).
  if (blocked && !onReactivate) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Revisando tu plan…" />
      </View>
    )
  }

  return <Stack screenOptions={{ headerShown: false }} />
}
