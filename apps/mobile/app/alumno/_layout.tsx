import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import { Stack, usePathname, useRouter } from 'expo-router'
import { getClientProfile } from '../../lib/client'
import { getPoolConsentStatus } from '../../lib/pool-consent'
import { sessionFlags } from '../../lib/session-flags'
import { useEntitlements } from '../../lib/entitlements'
import { StudentAccessBlocked } from '../../components/alumno/StudentAccessBlocked'

/**
 * Rutas del arbol alumno que siguen siendo alcanzables con el acceso bloqueado:
 *  - /alumno/suspended: destino del gate de alumno pausado/archivado (bloquearla seria un loop),
 *  - /alumno/codigo: superficie PRE-login (buscar coach por codigo), no hay sesion que gatear.
 *
 * `/alumno/consent` NO entra: el consentimiento de pool solo tiene sentido con servicio activo. Si
 * el coach dejo de pagar y paso la gracia, manda el bloqueo — no se le pide consentir a alguien que
 * no va a poder usar la app.
 */
const ALWAYS_ALLOWED = new Set(['/alumno/suspended', '/alumno/codigo'])

/**
 * Layout raiz del arbol ALUMNO — existe por la misma razon que `app/coach/_layout.tsx`.
 *
 * El bloqueo total post-gracia (decision CEO #9) y el gate de alumno pausado/archivado vivian solo
 * en `(tabs)/_layout.tsx`, que NO cubre las rutas alumno fuera del grupo de tabs:
 * `workout/[planId]` (el ejecutor), `exercise/[id]`, `add-food` y `onboarding`. Alcanzables por
 * deep link y —sobre todo— por el tap en una notificacion push, que el layout raiz enruta con
 * `router.push(data.screen)` sin pasar por las tabs. Un alumno cuyo coach dejo de pagar hace meses
 * podia entrar a entrenar desde el recordatorio.
 *
 * `studentAccess` sale de `useEntitlements()` (ya cacheado app-wide: no agrega red) y es FAIL-OPEN
 * — 'active' hasta resolver. La barrera real de datos sigue siendo la RLS/RPC; esto es la capa
 * honesta de UI.
 */
export default function AlumnoLayout() {
  const router = useRouter()
  const pathname = usePathname()
  const { studentAccess } = useEntitlements()
  // Guarda anti-carrera: una sola navegacion al gate de suspension (espejo de la de `(tabs)`).
  const redirecting = useRef(false)

  const allowed = ALWAYS_ALLOWED.has(pathname)

  // Alumno PAUSADO/ARCHIVADO por su coach, cambio de clave forzado y consentimiento de pool
  // (Ley 21.719) — distintos del gate por suscripcion. Mismo ORDEN que el proxy web
  // (blocked → password → consent, proxy.ts:657-685) y mismo fail-open: solo redirige con contexto
  // presente y no consentido.
  //
  // Este chequeo de MONTAJE vivia en `(tabs)/_layout.tsx`; subio entero aca para que cubra tambien
  // el ejecutor y las pantallas sueltas — no se duplico, alla quedo solo la re-evaluacion al volver
  // de background (que es especifica de la sesion de tabs).
  useEffect(() => {
    if (allowed) return
    let mounted = true
    getClientProfile()
      .then(async (c) => {
        if (!mounted || !c || redirecting.current) return
        if (c.blocked) {
          redirecting.current = true
          router.replace('/alumno/suspended')
          return
        }
        if (c.forcePasswordChange && !sessionFlags.pwChanged) {
          router.replace('/change-password')
          return
        }
        const consent = await getPoolConsentStatus()
        if (!mounted || redirecting.current) return
        if (consent?.pool && !consent.granted) {
          redirecting.current = true
          router.replace({
            pathname: '/alumno/consent',
            params: { team: consent.teamSlug, name: consent.teamName },
          })
        }
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [allowed, router])

  // Bloqueo total post-gracia: se monta ANTES de cualquier screen del alumno.
  if (studentAccess.state === 'blocked' && !allowed) {
    return (
      <View className="flex-1 bg-surface-app">
        <StudentAccessBlocked />
      </View>
    )
  }

  return <Stack screenOptions={{ headerShown: false }} />
}
