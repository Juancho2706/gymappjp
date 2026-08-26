import { Alert, Linking } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ApiError, apiFetch } from './api'
import { isStoreSafeUrl } from './store-compliance'

/**
 * «Vive tu app» y el alumno de ejemplo, desde la app (SPEC coach-onboarding-v2 §4 y §5).
 *
 * Las dos acciones que la guía de RN (`app/coach/guia.tsx`) ejecuta contra el alumno de ejemplo:
 *  - `openViveTuApp()` — el coach entra a la app de su ALUMNO, con su marca, como su alumno de
 *    ejemplo. Es el único momento en que un Free ve el white-label funcionando.
 *  - `deleteDemoStudent()` — «Borrar ejemplo», con todo su inventario.
 *
 * Ambas pasan por `api/mobile/coach/*` porque exigen `service_role` (magic link de GoTrue,
 * `clients.is_demo`): la app NUNCA tiene esa llave. La identidad la resuelve el servidor desde el
 * bearer; acá no se manda ningún `coachId`.
 *
 * Por qué se abre en el navegador y no dentro de la app: la sesión del navegador del sistema es
 * OTRA que la de la app (la nuestra es nativa, en AsyncStorage). Entrar como el alumno demo allá
 * no toca la sesión del coach acá — al revés de lo que pasa en la web, donde el magic link pisa la
 * cookie del panel. El coach vuelve a la app y sigue logueado.
 *
 * Nota de implementación: se usa `Linking.openURL` y no `WebBrowser.openBrowserAsync` porque
 * `expo-web-browser` NO está instalado, y agregarlo es una dependencia nativa nueva ⇒ binario
 * nuevo (no viaja por OTA). Con `Linking` esto sale en el próximo OTA. Si algún día entra
 * `expo-web-browser` por otra razón, este es el único archivo que cambia.
 */

export type ViveTuAppOutcome =
    | { ok: true; demoName: string }
    | { ok: false; error: string }

export type DeleteDemoOutcome = { ok: true; deleted: boolean } | { ok: false; error: string }

/**
 * Pantalla que abre el navegador. Viaja al servidor y vuelve dentro de la URL (`&from=`), porque
 * quien lo necesita es el banner de vuelta del árbol del alumno: desde la guía puede ofrecer
 * «Volver a la app» (deep link), desde el builder no —volver por `eva://` resetearía el stack con
 * un borrador en pantalla— y ahí el banner dice «vuelve con el botón atrás».
 */
export type ViveTuAppFrom = 'guia' | 'builder'

type ViveTuAppResponse = { ok: true; url: string; demoName: string }
type DeleteDemoResponse = { ok: true; deleted: boolean }

/** Mensaje al coach: el del servidor cuando es accionable, uno genérico cuando no. */
function humanize(error: unknown, fallback: string): string {
    if (error instanceof ApiError && error.message.trim() !== '' && error.status < 500) {
        return error.message
    }
    return fallback
}

/**
 * Pide el link de un solo uso y lo abre. Devuelve el nombre del demo para el copy («Así ve Matías
 * tu app»), o el motivo por el que no se pudo.
 */
export async function openViveTuApp(input: { from?: ViveTuAppFrom } = {}): Promise<ViveTuAppOutcome> {
    let response: ViveTuAppResponse
    try {
        response = await apiFetch<ViveTuAppResponse>('/api/mobile/coach/vive-tu-app', {
            method: 'POST',
            authenticated: true,
            // Lo único que manda la app: de qué pantalla salió. La identidad sigue saliendo del
            // bearer; un `from` inventado como mucho cambia el texto del banner de vuelta.
            body: { from: input.from ?? 'guia' },
        })
    } catch (error) {
        return { ok: false, error: humanize(error, 'No pudimos abrir tu app. Intenta de nuevo.') }
    }

    // Allowlist de destinos (regla dura de tiendas, `apps/mobile/AGENTS.md`): TODA URL que la app
    // abre hacia afuera pasa por acá. En producción el link es `https://www.eva-app.cl/vive-tu-app…`
    // y entra; si un entorno sirve otro origen, el botón falla cerrado en vez de abrirlo igual.
    if (!isStoreSafeUrl(response.url)) {
        return { ok: false, error: 'No pudimos abrir tu app desde aquí.' }
    }

    try {
        await Linking.openURL(response.url)
    } catch {
        return { ok: false, error: 'No pudimos abrir tu app. Revisa que tengas un navegador.' }
    }

    return { ok: true, demoName: response.demoName }
}

// ── «Así la ve tu alumno»: explicar UNA vez antes de saltar al navegador ─────────────────────

/**
 * Hallazgo 4 del QA del owner (2026-08-22): «"Ver mi app" manda a una versión web de un alumno de
 * prueba, no sé si está bien». Estaba bien —es la decisión documentada en el SPEC §5 y en TASKS
 * F5.2— pero la app no lo decía: el coach tocaba un botón dentro de la app y aterrizaba de golpe
 * en el navegador, logueado como otra persona. Eso se lee como un bug.
 *
 * Así que antes del salto se explica, y se explica UNA vez por coach: qué se abre, por qué en el
 * navegador y cómo volver. Después el botón abre directo — un aviso que se repite deja de leerse.
 *
 * Se recuerda con AsyncStorage y no en el servidor a propósito: es una preferencia de esta app en
 * este teléfono, no un hecho del onboarding. Si el coach reinstala, vuelve a ver el aviso una vez;
 * eso es correcto, porque también es la primera vez que hace el salto en ese teléfono.
 *
 * v2 (SPEC «Vive tu app» directo §3): el árbol del alumno ahora muestra un banner con **«Volver a
 * la app»** (deep link `eva://coach/guia`, o `intent://` en Android). El aviso v1 decía «vuelve con
 * el botón atrás», que era la única salida que existía; ahora hay dos y la buena es el botón. Como
 * el copy cambia de fondo —y quien ya vio el v1 nunca se enteraría del botón nuevo— se sube la
 * versión del prefijo: los coaches que ya tenían el sello vuelven a ver el aviso una vez, con la
 * salida correcta. El sello viejo (`…v1:<coach>`) queda huérfano en AsyncStorage: son bytes, no
 * vale un borrado que habría que mantener para siempre.
 */
const VIVE_TU_APP_EXPLAINED_PREFIX = 'eva.vive-tu-app.explained.v2:'

/** Clave por coach. Con prefijo versionado: si el copy cambia de fondo, se sube la v y se re-explica. */
export function viveTuAppExplainedKey(coachId: string): string {
    return `${VIVE_TU_APP_EXPLAINED_PREFIX}${coachId}`
}

/** ¿Toca explicar? Solo el sello exacto apaga el aviso: cualquier otra cosa (null, basura de una
 * versión vieja, un error de lectura que degradó a null) se trata como «todavía no lo vio». */
export function shouldExplainViveTuApp(stored: string | null | undefined): boolean {
    return stored !== 'true'
}

export type ViveTuAppExplainer = {
    title: string
    message: string
    cancelLabel: string
    confirmLabel: string
}

/**
 * Copy del aviso. Puro y exportado para poder pinnearlo: las cuatro cosas que el coach necesita
 * saber (se abre en el navegador · con SU marca · su sesión de coach no se pierde · cómo vuelve)
 * tienen que estar sí o sí, y el nombre del demo va tanto en el título como en el botón para que el
 * salto no sorprenda.
 *
 * La vuelta se nombra con el literal EXACTO del banner web («Volver a la app», SPEC §3 modo `rn`):
 * si acá dijera otra cosa, el coach buscaría un botón que no existe. El botón atrás se conserva
 * como segunda salida porque desde el builder el banner no ofrece deep link —resetearía el stack
 * con un borrador en pantalla— y ahí atrás es la única forma de volver.
 */
export function viveTuAppExplainer(input: { demoName: string; noun: string }): ViveTuAppExplainer {
    const demoName = input.demoName.trim() === '' ? 'tu alumno de ejemplo' : input.demoName.trim()
    const noun = input.noun.trim() === '' ? 'alumno' : input.noun.trim()
    return {
        title: `Así la ve ${demoName}`,
        message:
            `Se abre en el navegador de tu teléfono con tu logo y tu color, tal como la vería tu ${noun}. ` +
            'Tu sesión de coach sigue acá en la app: cuando termines, toca «Volver a la app» o usa el botón atrás.',
        cancelLabel: 'Cancelar',
        confirmLabel: `Abrir como ${demoName}`,
    }
}

export type ViveTuAppFlowOutcome =
    | { status: 'opened'; demoName: string }
    | { status: 'cancelled' }
    | { status: 'error'; error: string }

/** Almacén del sello. Inyectable para poder probar el flujo sin AsyncStorage. */
export type ViveTuAppExplainedStore = {
    getItem: (key: string) => Promise<string | null>
    setItem: (key: string, value: string) => Promise<void>
}

const asyncStorageStore: ViveTuAppExplainedStore = {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: async (key, value) => {
        await AsyncStorage.setItem(key, value)
    },
}

/** Confirmación por defecto: un Alert nativo. Se resuelve `false` si el coach lo descarta. */
function alertConfirm(explainer: ViveTuAppExplainer): Promise<boolean> {
    return new Promise((resolve) => {
        Alert.alert(
            explainer.title,
            explainer.message,
            [
                { text: explainer.cancelLabel, style: 'cancel', onPress: () => resolve(false) },
                { text: explainer.confirmLabel, onPress: () => resolve(true) },
            ],
            // Android deja descartar el diálogo tocando afuera: sin `onDismiss` la promesa queda
            // colgada y el botón se quedaría en «Abriendo…» para siempre.
            { cancelable: true, onDismiss: () => resolve(false) },
        )
    })
}

/**
 * El camino completo del botón «Ver como {demo}»: explicar (la primera vez) y abrir.
 *
 * Lo usa la guía (`app/coach/guia.tsx`) y lo va a usar el builder cuando tenga su propia entrada:
 * el aviso y el sello viven acá para que las dos superficies cuenten lo mismo y compartan el
 * «una sola vez».
 *
 * Sin `coachId` (foto del panel todavía sin cargar) se explica igual pero no se sella: mejor
 * repetir el aviso que sellarlo contra una clave que no identifica a nadie.
 */
export async function openViveTuAppGuided(input: {
    coachId: string | null
    demoName: string
    noun: string
    /** Pantalla que abre el navegador. Sin esto se asume la guía, que es de donde viene la mayoría. */
    from?: ViveTuAppFrom
    confirm?: (explainer: ViveTuAppExplainer) => Promise<boolean>
    store?: ViveTuAppExplainedStore
}): Promise<ViveTuAppFlowOutcome> {
    const store = input.store ?? asyncStorageStore
    const confirm = input.confirm ?? alertConfirm
    const key = input.coachId == null ? null : viveTuAppExplainedKey(input.coachId)

    let stored: string | null = null
    if (key != null) {
        try {
            stored = await store.getItem(key)
        } catch {
            stored = null
        }
    }

    if (shouldExplainViveTuApp(stored)) {
        const accepted = await confirm(viveTuAppExplainer({ demoName: input.demoName, noun: input.noun }))
        if (!accepted) return { status: 'cancelled' }
        if (key != null) {
            try {
                await store.setItem(key, 'true')
            } catch {
                // Que no se pueda sellar no puede impedir el salto: peor caso, se explica de nuevo.
            }
        }
    }

    const result = await openViveTuApp({ from: input.from })
    return result.ok ? { status: 'opened', demoName: result.demoName } : { status: 'error', error: result.error }
}

/** Borra el alumno de ejemplo y todo lo que se sembró con él. Idempotente en el servidor. */
export async function deleteDemoStudent(): Promise<DeleteDemoOutcome> {
    try {
        const response = await apiFetch<DeleteDemoResponse>('/api/mobile/coach/demo-student', {
            method: 'DELETE',
            authenticated: true,
        })
        return { ok: true, deleted: response.deleted === true }
    } catch (error) {
        return { ok: false, error: humanize(error, 'No se pudo borrar el alumno de ejemplo.') }
    }
}
