import { PostHog } from 'posthog-react-native'
import Constants from 'expo-constants'
import * as Updates from 'expo-updates'
// Vocabulario del aviso de cantidad poco plausible (tren «Cantidades honestas», W1.6). Solo
// tipos: se borran en compilación, no suman nada al bundle, y garantizan que RN y web manden
// EL MISMO enum en `nutrition_item_implausible`.
import type { ImplausibleEventReason, ImplausibleSurface, KcalBucket } from '@eva/nutrition-v2'
// Nombre y payload del bump de porciones (tren «Porciones a la chilena», W2.10). Son VALORES, no
// tipos: el nombre del evento y el constructor del payload viven en el paquete compartido para que
// web y RN no puedan mandar props distintas bajo el mismo evento.
import {
    PORTIONS_EVENT_CONVERSION_APPLIED,
    PORTIONS_EVENT_CONVERSION_PREVIEWED,
    PORTIONS_EVENT_GROUP_BUMPED,
    TARGETS_EVENT_SCOPE,
    conversionAppliedPayload,
    conversionPreviewedPayload,
    portionGroupBumpedPayload,
    targetsScopePayload,
    type ClDairyCode,
    type PortionGroupBumpedProps,
    type QeTargetsScope,
    type TargetsScopeFrom,
} from '@eva/nutrition-v2'

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

/**
 * `nutrition_portion_group_bumped` — el coach tocó en el picker un grupo que la franja YA tenía y
 * eso sumó media porción en vez de no hacer nada (D2-A, tren «Porciones a la chilena»). Responde
 * UNA pregunta de producto: si el gesto se usa más en el celular o en el escritorio.
 *
 * LEY 21.719: el payload es EXHAUSTIVO y lo arma el paquete compartido — las 5 props de DATA.md
 * §11 (`surface`, `group_code`, `portion_system`, `from`, `undone`) y ninguna más. Ni porciones,
 * ni kcal, ni gramos, ni nombre de alimento, ni ids. `group_code` sí viaja porque este evento lo
 * dispara el COACH: 'PCT' o 'LAC' es un término de dominio sobre su propia herramienta.
 *
 * A diferencia de `nutrition_item_implausible` acá NO se agrega `platform`: la superficie ya lo
 * dice, y una prop de más en un evento que web y RN comparten es una prop que solo uno de los dos
 * manda. Por eso el payload lo construye `portionGroupBumpedPayload` y no se arma a mano: web
 * (`apps/web/src/lib/posthog/events.ts`) llama al MISMO constructor con `'web'`.
 *
 * El «Deshacer» del toast emite un SEGUNDO evento con `undone: true` — así se lee cuántos bumps
 * se revirtieron sin tener que correlacionar dos eventos distintos.
 */
export function captureNutritionPortionGroupBumped(props: PortionGroupBumpedProps): void {
    captureAppEvent(PORTIONS_EVENT_GROUP_BUMPED, portionGroupBumpedPayload('rn', props))
}

/**
 * `nutrition_portion_conversion_previewed` — el coach ABRIÓ el preview de la conversión SMAE →
 * chileno (W3.5). Responde UNA pregunta de producto: cuántos coaches con plan legado llegan a
 * mirar la conversión, y cuánta fricción tiene esa pantalla (`rows_review` = filas que exigen
 * revisión, o sea redondeos que movieron el día).
 *
 * LEY 21.719: el payload es EXHAUSTIVO y son CONTEOS y BANDERAS, ninguna cifra de salud. Ni kcal,
 * ni gramos, ni porciones, ni nombres de grupo o de alimento, ni ids: el evento mide la pantalla,
 * no la pauta del alumno.
 *
 * La forma la fija DATA.md §11 evento 2 —fuente ÚNICA (fix S-07)—: `surface`, `slots`, `rows`,
 * `rows_review`, `has_dairy`, `has_collapse`, `has_custom_match`. `surface` se agrega ACÁ, igual
 * que en `captureNutritionTargetsScope`, porque `conversionPreviewedPayload` todavía no lo toma
 * por parámetro como su hermano `portionGroupBumpedPayload('rn', …)`; sin él, RN y web quedan
 * indistinguibles bajo el mismo evento. Las tres banderas y `rows` viajan explícitas por la misma
 * razón: PENDIENTE del paquete, y cuando el constructor las tome, este helper vuelve a un spread.
 *
 * Se emite UNA vez por apertura; cambiar el selector de lácteo re-corre el motor pero NO vuelve a
 * emitir (esa decisión vive en el consumidor, `PortionConversionSheet`).
 */
export function captureNutritionPortionConversionPreviewed(props: {
    slots: number
    rows: number
    rowsReview: number
    hasDairy: boolean
    hasCollapse: boolean
    hasCustomMatch: boolean
}): void {
    captureAppEvent(PORTIONS_EVENT_CONVERSION_PREVIEWED, {
        surface: 'rn',
        ...conversionPreviewedPayload(props.slots, props.rowsReview),
        rows: props.rows,
        has_dairy: props.hasDairy,
        has_collapse: props.hasCollapse,
        has_custom_match: props.hasCustomMatch,
    })
}

/**
 * `nutrition_portion_conversion_applied` — el coach APLICÓ la conversión al BORRADOR (W3.5).
 * Publicar sigue siendo un paso aparte (T-05), así que este evento NO dice que el alumno haya
 * visto nada: dice que el coach aceptó el preview.
 *
 * LEY 21.719: conteos y una elección, ninguna cifra de salud. La forma la fija DATA.md §11 evento
 * 3: `surface`, `slots`, `rows`, `dairy_choice` (QUÉ eligió, jamás cuánto) y `custom_replaced`
 * (CUÁNTOS grupos propios reemplazó, nunca cuáles). `surface` y las llaves que el constructor
 * compartido todavía no toma se agregan acá — misma deuda declarada en el hermano `previewed`.
 */
export function captureNutritionPortionConversionApplied(props: {
    slots: number
    rows: number
    dairyChoice: ClDairyCode | 'mixed'
    customReplaced: number
}): void {
    captureAppEvent(PORTIONS_EVENT_CONVERSION_APPLIED, {
        surface: 'rn',
        ...conversionAppliedPayload(props.slots),
        rows: props.rows,
        dairy_choice: props.dairyChoice,
        custom_replaced: props.customReplaced,
    })
}

/**
 * `nutrition_targets_scope` — el coach eligió EN QUÉ ALCANCE se guarda una meta del día (W4,
 * tren «Porciones a la chilena»): `'all'` = el día base y los días que heredaban, `'day'` = solo
 * el día activo. Responde UNA pregunta de producto: si el default del switch «Solo el {día}»
 * acierta, o si el coach lo está corrigiendo todo el tiempo.
 *
 * `from` separa las dos puertas: el `'switch'` de la hoja de metas y el `'go_to_base'` del aviso
 * ámbar de la barra de publicar.
 *
 * En RN son TRES puertas y todas reportan lo mismo: mover el switch, el «Deshacer» del toast que
 * lo devuelve a su lugar (el evento sigue la POSICIÓN del switch: si no, el embudo mostraría un
 * `'all'` que el coach canceló) y el «Ir a Base» del aviso ámbar.
 *
 * LEY 21.719: el payload es EXHAUSTIVO — las TRES llaves de DATA §11 evento 4 (`surface`, `scope`,
 * `from`) y ninguna más. JAMÁS la cifra de la meta ni el nombre del día concreto: las kcal de un
 * plan son dato de salud. `scope`/`from` los arma el constructor compartido para que web y RN no
 * puedan mandar enums distintos bajo el mismo evento; `surface` se agrega acá porque
 * `targetsScopePayload` todavía no lo toma por parámetro como su hermano
 * `portionGroupBumpedPayload('rn', …)` — PENDIENTE del paquete cuando entre la web de W4, que es
 * quien va a pasar `'web'`. Hasta entonces esta es la única forma de cumplir DATA sin editar un
 * archivo fuera del encargo.
 */
export function captureNutritionTargetsScope(props: {
    scope: QeTargetsScope
    from: TargetsScopeFrom
}): void {
    captureAppEvent(TARGETS_EVENT_SCOPE, {
        surface: 'rn',
        ...targetsScopePayload(props.scope, props.from),
    })
}
