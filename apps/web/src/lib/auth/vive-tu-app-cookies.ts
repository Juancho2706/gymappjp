import type { NextResponse } from 'next/server'

/**
 * Cookies del viaje «Vive tu app» (docs/specs/vive-tu-app-directo §3).
 *
 * Por qué un módulo propio y no tres literales repartidos: las escriben `/vive-tu-app`, las lee el
 * proxy y las consume/borra `POST /volver-al-panel`. Un `path` que no coincida entre el `set` y el
 * `set(..., maxAge: 0)` NO borra la cookie (borra otra distinta, la del path por defecto), y la de
 * retorno lleva una CREDENCIAL del coach: dejarla viva es el peor bug posible de esta spec.
 *
 * `eva_vta_return` = `{ t: hashed_token del coach, c: coach_id }`. Es un magic link de un solo uso
 * de GoTrue: durante ≤ 1 h vale por la sesión completa del coach. Por eso `httpOnly` + `Secure` en
 * producción + `SameSite=Lax` + `path` restringido a la ÚNICA ruta que la consume + borrado en toda
 * rama. Nunca se loguea, nunca viaja a analítica, nunca entra en una URL.
 *
 * `eva_vta_mode` y `eva_vta_from` son etiquetas de UI (qué botón pinta el banner de vuelta): viven
 * en `path: '/'` porque las lee el árbol del alumno entero, y también son `httpOnly` — nadie del
 * cliente las necesita y así no se pueden falsificar desde el navegador.
 */

/**
 * Headers que el proxy inyecta en la rama `/c` y que lee el layout del alumno. Van SIEMPRE
 * seteados (vacíos cuando no aplica): `proxy.ts` copia los headers del request con
 * `new Headers(request.headers)`, así que un header condicional lo puede FALSIFICAR el visitante
 * mandándolo él y el árbol se lo creería.
 */
export const VTA_CLIENT_IS_DEMO_HEADER = 'x-client-is-demo'
export const VTA_CLIENT_DISPLAY_NAME_HEADER = 'x-client-display-name'
export const VTA_MODE_HEADER = 'x-vta-mode'

export const VTA_RETURN_COOKIE = 'eva_vta_return'
export const VTA_MODE_COOKIE = 'eva_vta_mode'
export const VTA_FROM_COOKIE = 'eva_vta_from'

/** Única ruta que consume la cookie de retorno. El `path` del `set` y el del borrado son ESTE. */
export const VTA_RETURN_PATH = '/volver-al-panel'

/**
 * 1 h = el `otp_expiry` de GoTrue para el magic link que va adentro. Alineado a propósito: una
 * cookie que sobreviva al token deja al coach tocando un botón que ya no puede funcionar.
 */
export const VTA_MAX_AGE_SECONDS = 3600

/**
 * Cómo vuelve el coach a su panel desde el árbol del alumno.
 * - `rn`: entró desde la app (la URL traía `src=rn`) ⇒ deep link / botón atrás.
 * - `return`: entró desde el MISMO navegador donde tenía su panel ⇒ `POST /volver-al-panel`.
 * - `remote`: cualquier otro caso (QR desde otro dispositivo, cookie vencida, `generateLink` falló).
 */
export type VtaMode = 'rn' | 'return' | 'remote'

/** Pantalla de RN que abrió el navegador (define si el banner ofrece deep link o «botón atrás»). */
export type VtaFrom = 'guia' | 'builder'

/** Ausencia o basura ⇒ `remote`: el modo más conservador (ofrece salir, no promete volver). */
export function parseVtaMode(raw: string | null | undefined): VtaMode {
    return raw === 'rn' || raw === 'return' ? raw : 'remote'
}

/** Allowlist de dos valores; cualquier otra cosa ⇒ `guia` (el default del núcleo del link). */
export function parseVtaFrom(raw: string | null | undefined): VtaFrom {
    return raw === 'builder' ? 'builder' : 'guia'
}

export interface VtaReturnPayload {
    /** `hashed_token` del magic link del coach. CREDENCIAL: jamás sale del servidor. */
    t: string
    /** `coaches.id` dueño del alumno de ejemplo. */
    c: string
}

/**
 * Tolerante a JSON roto/truncado y a shapes inesperados: una cookie ilegible se trata como
 * ausente (el coach cae en modo `remote`), nunca como un error en su cara.
 */
export function parseVtaReturnCookie(raw: string | null | undefined): VtaReturnPayload | null {
    if (!raw) return null
    try {
        const parsed: unknown = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return null
        const { t, c } = parsed as Record<string, unknown>
        if (typeof t !== 'string' || typeof c !== 'string' || !t || !c) return null
        return { t, c }
    } catch {
        return null
    }
}

function baseCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        maxAge: VTA_MAX_AGE_SECONDS,
    }
}

/** Opciones de `eva_vta_return` (path restringido a `/volver-al-panel`). */
export function vtaReturnCookieOptions() {
    return { ...baseCookieOptions(), path: VTA_RETURN_PATH }
}

/** Opciones de `eva_vta_mode` / `eva_vta_from` (las lee todo el árbol del alumno). */
export function vtaLabelCookieOptions() {
    return { ...baseCookieOptions(), path: '/' }
}

/**
 * Borra las TRES cookies repitiendo el `path` con el que se escribieron. Se llama en todas las
 * ramas de `/volver-al-panel`, incluidas las que no consumen el token: el viaje terminó.
 */
export function clearVtaCookies(response: NextResponse): NextResponse {
    response.cookies.set(VTA_RETURN_COOKIE, '', { path: VTA_RETURN_PATH, maxAge: 0 })
    response.cookies.set(VTA_MODE_COOKIE, '', { path: '/', maxAge: 0 })
    response.cookies.set(VTA_FROM_COOKIE, '', { path: '/', maxAge: 0 })
    return response
}
