import { Platform } from 'react-native'
import { AppEventsLogger, Settings } from 'react-native-fbsdk-next'
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency'

/**
 * Eventos de app de Meta (SDK de Facebook) + consentimiento ATT.
 *
 * POR QUÉ existe (2026-09-15): Meta Ads NO veía la app. El Administrador de eventos tenía un solo
 * origen —«EVA Web», el píxel— así que cada instalación y cada registro de coach hecho DESDE EL
 * CELULAR era invisible: la campaña que lo trajo no se lo podía atribuir y el optimizador seguía
 * aprendiendo solo con las altas web. El alta por la web ya viaja doble (píxel + CAPI desde el
 * servidor); la móvil no mandaba nada. Este módulo cierra ese hueco y NADA MÁS.
 *
 * ── ALCANCE DELIBERADAMENTE MÍNIMO ──
 * UN evento de negocio (`CompletedRegistration` en el alta del coach) más lo automático del SDK
 * (`fb_mobile_activate_app` en cada arranque, instalación y sesiones). Sin Login con Facebook, sin
 * `logPurchase` (EVA cobra en la web por Flow/MP, jamás dentro de la app: regla de tiendas de
 * `apps/mobile/AGENTS.md`), sin `setUserID`, sin `setUserData` (advanced matching) y sin ningún
 * evento de alumno. Cualquier evento nuevo se agrega acá y se justifica.
 *
 * NO duplica nada: los endpoints que usa RN para registrar coaches
 * (`/api/mobile/auth/register-coach-free` y `complete-coach-onboarding`) no mandan CAPI a Meta, así
 * que este evento es la ÚNICA señal del alta móvil.
 *
 * ── GATE ──
 * `!__DEV__`, el mismo criterio que `lib/sentry-boot.ts`: un build de desarrollo no ensucia el
 * dataset de producción (ni infla el conteo de instalaciones con cada recarga de Metro). En Expo Go
 * el módulo nativo ni siquiera existe, y por eso además todo va en try/catch.
 *
 * ── LEY 21.719 (datos sensibles de salud) ──
 * En las props JAMÁS va un dato de salud, ni correo, ni nombre, ni uid, ni el código del coach:
 * el único parámetro que viaja es `registration_method` ('email' | 'google'), que describe el
 * BOTÓN que se tocó, no a la persona. Los alumnos no emiten ni un solo evento de Meta.
 *
 * ── FAIL-OPEN ──
 * Mismo criterio que `lib/analytics.ts`: perder un evento es aceptable, romper (o demorar) la
 * acción del usuario que lo dispara no lo es. Todo va envuelto en try/catch, nada lanza y nada se
 * espera con `await` desde la UI.
 */

/**
 * `true` solo fuera de desarrollo. Exportada para tests y diagnóstico; las tres funciones de abajo
 * ya la consultan por su cuenta.
 */
const META_SDK_ENABLED = !__DEV__

export function isMetaSdkEnabled(): boolean {
  return META_SDK_ENABLED
}

/**
 * Arranca el SDK. Se llama a nivel de módulo desde `app/_layout.tsx`, junto al resto del boot.
 *
 * El `initializeSDK()` explícito NO es redundante en iOS: el config plugin de `react-native-fbsdk-next`
 * escribe `FacebookAppID`/`FacebookClientToken` en el Info.plist pero no toca el AppDelegate, así que
 * nadie llama a `ApplicationDelegate.initializeSDK` y sin esta línea el SDK de iOS queda dormido (cero
 * `fb_mobile_activate_app`). En Android el `isAutoInitEnabled: true` del plugin ya lo arranca solo;
 * llamarlo igual es idempotente.
 */
export function bootMetaSdk(): void {
  if (!META_SDK_ENABLED) return
  try {
    Settings.initializeSDK()
  } catch {
    // swallow — ver §fail-open. Sin módulo nativo (Expo Go) esto tira y no pasa nada.
  }
}

/**
 * Pide ATT y le dice al SDK qué contestó el usuario.
 *
 * Solo iOS: en Android no existe el diálogo y `setAdvertiserTrackingEnabled` es un no-op.
 *
 * Sin flag propio a propósito: el sistema muestra la hoja UNA sola vez por instalación y las
 * llamadas siguientes devuelven el estado guardado sin volver a molestar, así que llamarla en cada
 * arranque es lo correcto —y es lo que mantiene el SDK sincronizado si el usuario cambia el permiso
 * desde Ajustes—.
 *
 * Con el permiso denegado esto NO apaga los eventos: el SDK sigue mandando
 * `fb_mobile_complete_registration` sin IDFA y Meta lo atribuye por SKAdNetwork (modelado), que es
 * exactamente el comportamiento esperado.
 */
export async function syncMetaTrackingConsent(): Promise<void> {
  if (!META_SDK_ENABLED || Platform.OS !== 'ios') return
  try {
    const { granted } = await requestTrackingPermissionsAsync()
    await Settings.setAdvertiserTrackingEnabled(granted)
  } catch {
    // swallow — ver §fail-open. Un permiso que no se pudo pedir no puede tumbar el arranque.
  }
}

/**
 * `CompletedRegistration` — se creó una cuenta de coach desde la app. Espejo del evento que la web
 * manda por píxel + CAPI en su propio alta, para que los dos caminos se lean juntos en el
 * Administrador de eventos.
 *
 * Se emite cuando el servidor YA creó la cuenta (después de que resuelve el endpoint), nunca al
 * tocar el botón: un evento de registro que se dispara antes del 200 mide intenciones, no altas.
 *
 * `method` es el ÚNICO parámetro (21.719, ver cabecera).
 *
 * Los nombres van como STRING LITERAL, no como `AppEventsLogger.AppEvents.CompletedRegistration`:
 * esas «constantes» salen de `NativeModules.FBAppEventsLogger.getConstants()` y en el build 61
 * (1.1.3, nueva arquitectura) el registro del socio del 2026-09-15 llegó a PostHog
 * (`coach_registered`, la línea de al lado) pero a Meta no llegó NADA, mientras que el
 * `fb_mobile_activate_app` automático de esa misma sesión sí. Un nombre `undefined` el SDK lo
 * descarta sin ruido (y el try/catch se traga el TypeError si las constantes no existen). Los
 * literales son los nombres públicos y estables de Meta para eventos estándar, no dependen de
 * ningún puente. Se conservan como fallback las constantes por si algún día difieren.
 *
 * `flush()` explícito: el SDK acumula y manda «solo» al pasar a segundo plano o por temporizador;
 * el alta es UN evento por instalación y vale la pena que salga ya, no cuando el coach cierre la app.
 */
const META_EVENT_COMPLETED_REGISTRATION = 'fb_mobile_complete_registration'
const META_PARAM_REGISTRATION_METHOD = 'fb_registration_method'

export function trackMetaCoachRegistered(method: 'email' | 'google'): void {
  if (!META_SDK_ENABLED) return
  try {
    const eventName =
      AppEventsLogger.AppEvents?.CompletedRegistration ?? META_EVENT_COMPLETED_REGISTRATION
    const paramName =
      AppEventsLogger.AppEventParams?.RegistrationMethod ?? META_PARAM_REGISTRATION_METHOD
    AppEventsLogger.logEvent(
      typeof eventName === 'string' ? eventName : META_EVENT_COMPLETED_REGISTRATION,
      { [typeof paramName === 'string' ? paramName : META_PARAM_REGISTRATION_METHOD]: method },
    )
    AppEventsLogger.flush()
  } catch {
    // swallow — ver §fail-open.
  }
}
