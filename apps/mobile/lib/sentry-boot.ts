/**
 * Arranque de Sentry ANTES que cualquier módulo de la app.
 *
 * POR QUÉ (2026-08-21, crash de arranque en Android sin un solo rastro): `Sentry.init` vivía en
 * `app/_layout.tsx` DESPUÉS de ~59 imports. Babel emite los `require()` en orden de fuente, así que
 * un throw a tiempo de módulo en cualquiera de esos imports nunca llegaba a Sentry: el diálogo
 * «EVA se cerró…» de Android se veía en el device y del otro lado no había evento. Este archivo se
 * importa SEGUNDO en `app/_layout.tsx` (detrás de `react-native-gesture-handler`, que exige ser el
 * primero) para que el handler global exista antes de evaluar el resto del grafo.
 *
 * Contrato: el `init` es IDÉNTICO al que estaba en `_layout.tsx` (mismas opciones, mismo gate por
 * DSN: sin `EXPO_PUBLIC_SENTRY_DSN` es no-op TOTAL — cero llamadas de red, cero riesgo de crash;
 * el DSN se inyecta vía EAS build / workflow OTA). Lo nuevo es el CONTEXTO del bundle que corre
 * (tags `ota.*`): cada evento dice qué update de expo-updates estaba activo, si era el bundle
 * embebido y si expo-updates tuvo que recurrir al arranque de emergencia. Sin eso un crash
 * post-OTA no se puede separar de un crash del binario — exactamente el hueco del 21-08.
 *
 * REGLA: nada de acá puede lanzar. Todo lo que no es el `init` va en try/catch — un error en el
 * instrumentador de arranque sería precisamente el crash que queremos VER, no provocar.
 */
import * as Sentry from '@sentry/react-native'
import * as Updates from 'expo-updates'
import type { Session } from '@supabase/supabase-js'

export const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN

// Instrumentación de navegación de Expo Router. Se CONSTRUYE siempre —es solo un objeto con
// closures, sin efectos hasta que un client la instala— y se registra únicamente si hay DSN,
// para no romper el no-op total de arriba. Con `tracesSampleRate: 0` no se envía ni una
// transacción: lo que interesa acá es su OTRO efecto, el breadcrumb `navigation`
// ("Navigation to <ruta>") que deja en el scope en cada cambio de pantalla. Sin él un crash
// llega sin decir DÓNDE estaba el usuario, que es justo lo que costó caro en EVA-MOBILE-7.
export const navigationIntegration = Sentry.reactNavigationIntegration()

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    debug: false,
    enabled: !__DEV__,
    // Se queda en 0 A PROPOSITO: no queremos transacciones de performance, solo el efecto
    // colateral de `navigationIntegration` (ver arriba). Si alguna vez hiciera falta tracing,
    // el tope es 0.1 — con 0.2+ el free tier de Sentry se agota en dias y empieza a DESCARTAR
    // errores, que es lo unico que de verdad miramos.
    tracesSampleRate: 0,
    integrations: [navigationIntegration],
    // 100 (default) no alcanza: en una sesion real de la app la mitad del presupuesto se la
    // comen los GET 200 de miniaturas de Supabase Storage, y para cuando llega el crash los
    // breadcrumbs que explican QUE hizo el usuario ya se cayeron por la ventana. 300 + el
    // filtro de abajo dejan varios minutos de rastro util. El limite real no es este numero
    // sino el tamano maximo del payload del evento, muy lejos todavia.
    maxBreadcrumbs: 300,
    // Los thumbnails de Storage son ruido puro: siempre 200, siempre iguales, nunca explican
    // nada. Se descartan por URL. OJO al contrato: el SDK ENCADENA este callback con el suyo
    // —primero corre el nuestro y despues el interno que filtra dev server y DSN— asi que
    // devolver `null` aca corta bien y devolver el breadcrumb intacto no pisa ese filtro.
    // Mismo shape que usa el SDK internamente: `type === 'http'` + `data.url`.
    beforeBreadcrumb: (breadcrumb) => {
      const url = breadcrumb.data?.url
      if (breadcrumb.type === 'http' && typeof url === 'string' && url.includes('/storage/v1/')) {
        return null
      }
      return breadcrumb
    },
    // Sesiones (Release Health): sin esto no hay crash-free rate y no se puede responder
    // "el OTA de ayer, ¿mejoro o empeoro?". No esta en los DEFAULT_OPTIONS del SDK JS, asi que
    // sin declararlo la clave ni siquiera cruza al SDK nativo y queda a merced del default de
    // cada plataforma; explicito lo fija en los dos.
    enableAutoSessionTracking: true,
  })

  // Contexto del bundle: qué OTA corre (o `embedded`), runtime, canal y si expo-updates tuvo que
  // arrancar de emergencia. Son tags (filtrables en Sentry), no extras. Si el arranque anterior
  // falló por el update, además se deja un evento `warning` con la razón — es el único lugar
  // donde expo-updates cuenta que descartó un bundle.
  try {
    Sentry.setTags({
      'ota.update_id': Updates.updateId ?? 'embedded',
      'ota.runtime': Updates.runtimeVersion ?? 'unknown',
      'ota.channel': Updates.channel ?? 'none',
      'ota.embedded_launch': String(Updates.isEmbeddedLaunch),
      'ota.emergency_launch': String(Updates.isEmergencyLaunch),
    })
    if (Updates.isEmergencyLaunch) {
      Sentry.captureMessage('expo-updates: arranque de emergencia (el update anterior falló al lanzar)', {
        // fingerprint fijo: sin él Sentry agrupa por el nombre de la función del stack (EVA-MOBILE-9/C).
        fingerprint: ['expo-updates', 'emergency-launch'],
        level: 'warning',
        extra: { reason: Updates.emergencyLaunchReason ?? null, updateId: Updates.updateId ?? null },
      })
    }
  } catch {
    // Contexto opcional: jamás puede tumbar el arranque.
  }
}

/**
 * Identidad mínima del usuario en Sentry (solo el uid) para cruzar un crash con su cuenta en la
 * DB. Sin email ni nombre: privacidad y Ley 21.719 (los alumnos son datos de salud) — con el uid
 * alcanza. `null` al cerrar sesión. Nunca lanza.
 */
export function syncSentryUser(session: Session | null | undefined): void {
  if (!SENTRY_DSN) return
  try {
    Sentry.setUser(session?.user?.id ? { id: session.user.id } : null)
  } catch {
    // Nunca lanzar desde el listener de auth.
  }
}
