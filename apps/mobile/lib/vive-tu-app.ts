import { Linking } from 'react-native'
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
export async function openViveTuApp(): Promise<ViveTuAppOutcome> {
    let response: ViveTuAppResponse
    try {
        response = await apiFetch<ViveTuAppResponse>('/api/mobile/coach/vive-tu-app', {
            method: 'POST',
            authenticated: true,
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
