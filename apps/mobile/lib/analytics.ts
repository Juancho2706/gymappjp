import { PostHog } from 'posthog-react-native'
import Constants from 'expo-constants'
import * as Updates from 'expo-updates'
// Vocabulario del aviso de cantidad poco plausible (tren «Cantidades honestas», W1.6). Solo
// tipos: se borran en compilación, no suman nada al bundle, y garantizan que RN y web manden
// EL MISMO enum en `nutrition_item_implausible`.
import type { ImplausibleEventReason, ImplausibleSurface, KcalBucket } from '@eva/nutrition-v2'

/**
 * Analytics de producto del binario (Share Entreno F7.1).
 *
 * POR QUÉ existe: hasta hoy el móvil no medía NADA de producto — todo el funnel vivía en la web
 * (`apps/web/src/lib/posthog/*`). El funnel de Compartir Entreno ocurre entero dentro de la app
 * (abrir el card → elegir estilo → poner foto → elegir destino), así que sin SDK móvil no hay forma
 * de saber dónde se cae la gente. `posthog-react-native` es JS puro con dependencias nativas
 * OPCIONALES: no suma un módulo nativo propio, pero igual viaja en binario porque el bundle cambia.
 *
 * ── ALCANCE DELIBERADAMENTE MÍNIMO ──
 * Sin autocapture (no hay `PostHogProvider` montado), sin session replay, sin captura de pantallas,
 * sin error tracking (de eso ya se ocupa Sentry) y sin `identify()`: la persona es el
 * `distinct_id` anónimo que genera el SDK. Es a propósito — v1 mide UN funnel, no abre una
 * plataforma de tracking. Cualquier evento nuevo se agrega acá y se justifica.
 *
 * EXCEPCIÓN (2026-08-21): lifecycle events ON (`Application Opened` / `Installed` / `Updated` /
 * `Backgrounded`). Son la única señal de QUÉ binario y QUÉ OTA corre cada device: el crash de
 * Android del 21-08 no se pudo atribuir a una versión porque no existían. Viajan con
 * `$app_version`/`$app_build` (expo-constants) y las super-properties `ota_*` (expo-updates).
 *
 * ── TAXONOMÍA ──
 * `snake_case`, formato `objeto_accion` (`student_share_target_selected`), espejo de la tabla de
 * `docs/specs/workout-share/PLAN.md §Analytics`.
 *
 * ── LEY 21.719 (datos sensibles de salud) ──
 * JAMÁS mandar kg, volumen, músculos, ejercicios, récords, peso corporal ni nada derivado de la
 * salud del alumno en las props. Los datos de salud son sensibles y el interés legítimo NO los
 * cubre. Las props permitidas son METADATOS de la interacción: `card_kind`, `style`, `surface`,
 * `photo_source`, `target`. Si un evento nuevo necesita una métrica del entreno, la respuesta es
 * que no va.
 *
 * ── FAIL-OPEN ──
 * Mismo criterio que `apps/web/src/lib/posthog/server-capture.ts`: sin key configurada el cliente
 * es `null` y `captureAppEvent` es un no-op silencioso. Perder un evento es aceptable; romper (o
 * demorar) la acción del usuario que lo dispara, no. Por eso todo va envuelto en try/catch y nada
 * de esto se espera con `await` desde la UI.
 */

/** Host por defecto: el mismo cloud US que usa la web (`NEXT_PUBLIC_POSTHOG_HOST`). */
const DEFAULT_HOST = 'https://us.i.posthog.com'

/**
 * Las `EXPO_PUBLIC_*` las INLINEA el bundler en build: hay que escribir el acceso completo
 * (`process.env.EXPO_PUBLIC_X`) y nunca desestructurar `process.env`, o el reemplazo no ocurre y en
 * runtime llega `undefined`. Mismo patrón que `lib/supabase.ts` y el DSN de Sentry en `_layout.tsx`.
 *
 * La project API key de PostHog es PÚBLICA por diseño (write-only de ingesta), así que vive en el
 * bundle sin problema — es la misma credencial que la web expone en el navegador.
 */
const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || DEFAULT_HOST

/**
 * Props permitidas: escalares planos. El tipo cierra la puerta a mandar objetos con el entreno
 * adentro. Sin `undefined` a propósito — el payload de PostHog es JSON y un `undefined` desaparece
 * en la serialización, así que una prop opcional se declara `| null` y se manda explícita.
 */
export type AppEventProps = Record<string, string | number | boolean | null>

function createClient(): PostHog | null {
    if (!API_KEY) return null
    try {
        return new PostHog(API_KEY, {
            host: HOST,
            // El SDK persiste su `distinct_id` con expo-file-system (ya instalado). Sin esto caería
            // a memoria y cada arranque sería una persona nueva.
            persistence: 'file',
            // Sin perfil de persona hasta que alguien llame a `identify()` — que nadie llama. Los
            // eventos quedan como anónimos y no inflamos el conteo de MTU con perfiles vacíos.
            personProfiles: 'identified_only',
            // Lifecycle events ON (21-08-2026, ver §alcance): `Application Opened` en cada arranque con
            // la versión REAL del binario. Sin `expo-application` (no instalado: sería un módulo
            // nativo más) el SDK no sabe la versión ni el build, así que se los damos desde
            // expo-constants (`Installed`/`Updated` los necesitan para dispararse).
            captureAppLifecycleEvents: true,
            customAppProperties: (props) => ({
                ...props,
                $app_version: Constants.expoConfig?.version ?? props.$app_version ?? null,
                $app_build: Constants.nativeBuildVersion ?? props.$app_build ?? null,
            }),
            // El RESTO de lo automático sigue APAGADO. Los defaults del SDK son `true` en varios de
            // estos, así que no alcanza con "no usarlos": hay que desactivarlos explícitamente.
            enableSessionReplay: false,
            capturePushNotificationSubscriptions: false,
            capturePushNotificationOpened: false,
            // Sentry ya instala los handlers globales de excepción/rejection. Dejar que PostHog
            // instale los suyos encima duplicaría el reporte y pelearía por la misma cadena.
            errorTracking: { autocapture: false },
            // Sin flags ni encuestas: una request menos en cada arranque y ninguna decisión de
            // producto depende hoy de PostHog.
            preloadFeatureFlags: false,
        })
    } catch {
        // Un fallo del constructor (storage no disponible, por ejemplo) no puede tumbar el arranque.
        return null
    }
}

const client = createClient()

// Super-properties (viajan en TODOS los eventos, lifecycle incluidos): qué OTA de expo-updates corre
// (`embedded` = bundle del binario) y en qué runtime. Es lo que separa «crashea el binario» de
// «crashea el OTA» mirando PostHog. `register` persiste en file y puede devolver promesa: nunca
// puede lanzar ni bloquear el arranque.
try {
    void Promise.resolve(
        client?.register({
            ota_update_id: Updates.updateId ?? 'embedded',
            ota_runtime: Updates.runtimeVersion ?? null,
            ota_channel: Updates.channel ?? null,
        })
    ).catch(() => {})
} catch {
    // Nunca tumbar el arranque por analítica.
}

/** `true` solo si hay key configurada Y el cliente se pudo construir. Útil para tests/diagnóstico. */
export function isAnalyticsEnabled(): boolean {
    return client !== null
}

/**
 * Emite un evento. NUNCA lanza y NUNCA bloquea: `capture` encola en memoria y el SDK hace el flush
 * por su cuenta, así que se llama sin `await` desde los handlers de la UI.
 *
 * Recordatorio (21.719): en `props` van METADATOS de la interacción, jamás datos de salud.
 */
export function captureAppEvent(event: string, props?: AppEventProps): void {
    if (!client) return
    try {
        client.capture(event, props)
    } catch {
        // swallow — ver §fail-open.
    }
}

/**
 * `nutrition_item_implausible` — se MOSTRÓ el aviso de cantidad poco plausible (tren «Cantidades
 * honestas», W1.6). Espejo exacto del helper web (`apps/web/src/lib/posthog/events.ts`), con
 * `platform: 'rn'`: el mismo nombre de evento y las mismas props, o el insight no se puede leer
 * junto. Una vez por ítem y sesión; la decide el consumidor, no este helper.
 *
 * LEY 21.719: viajan METADATOS de la interacción (superficie, unidad, motivo, TRAMO de kcal).
 * Nunca kcal exactas, nombre del alimento ni ningún id — las kcal de un plan son dato de salud.
 *
 * `unit` es `null` en el aviso del DÍA (`reason: 'day'`): ahí no hay una unidad sospechosa.
 */
export function captureNutritionItemImplausible(props: {
    surface: ImplausibleSurface
    unit: string | null
    reason: ImplausibleEventReason
    kcalBucket: KcalBucket
}): void {
    captureAppEvent('nutrition_item_implausible', {
        platform: 'rn',
        surface: props.surface,
        unit: props.unit,
        reason: props.reason,
        kcal_bucket: props.kcalBucket,
    })
}
