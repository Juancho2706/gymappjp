import { NextRequest, NextResponse } from 'next/server'
import { createViveTuAppLink, type ViveTuAppFrom } from '@/services/onboarding/vive-tu-app.service'
import { resolveMobileClientMutationContext } from '@/app/api/mobile/coach/clients/_mutation-auth'
import { rateLimitViveTuAppMobile } from '@/lib/rate-limit'

/**
 * «Vive tu app» desde la app (SPEC coach-onboarding-v2 §5; TASKS W5 F5.2).
 *
 * Devuelve el link de un solo uso con el que el coach entra a la app de su ALUMNO, con su marca,
 * como su alumno de ejemplo. Mismo núcleo que la web (`services/onboarding/vive-tu-app.service`):
 * si el link cambia, cambia en un solo archivo.
 *
 * POST y no GET a propósito: emite un magic link y escribe un evento del funnel — muta estado y no
 * puede cachearse ni prefetchearse.
 *
 * Autorización: el MISMO helper que el resto de `api/mobile/coach/*`. El `coachId` sale del bearer
 * verificado, nunca del body. Solo `standalone`: el demo pertenece al panel propio del coach.
 *
 * Qué NO es esto: no es una superficie de pago ni lleva a una. El destino es `/vive-tu-app`, la
 * app del alumno bajo la marca del coach — dentro de la allowlist de `lib/store-compliance`
 * (`isStoreSafeUrl`), que la app vuelve a comprobar antes de abrir nada. La query `src=rn&from=…`
 * que agrega el núcleo NO cambia eso: la allowlist mira el path.
 */

/**
 * `from` del body: la pantalla de la app que abrió el link. Es una allowlist de dos valores y
 * cualquier otra cosa (body vacío, JSON roto, un `from` inventado) cae en `guia`. Fail-closed
 * barato: el peor caso de equivocarse es que el banner de vuelta ofrezca el deep link a la guía
 * cuando el coach venía del builder, nunca un error en la cara del coach.
 */
function resolveFrom(raw: unknown): ViveTuAppFrom {
    return (raw as { from?: unknown } | null)?.from === 'builder' ? 'builder' : 'guia'
}

export async function POST(request: NextRequest) {
    const ctx = await resolveMobileClientMutationContext(request, undefined)
    if ('error' in ctx) return ctx.error

    // Techo por coach (V1.29): cada POST emite un magic link real de GoTrue y este endpoint no
    // tenía NINGUNO. Desde la app «atrás + volver a tocar» es el gesto barato de todos, igual que en
    // la web. 429 con el shape JSON del endpoint (`error` + `code`), no el genérico del proxy: la
    // app parsea este contrato.
    const rl = await rateLimitViveTuAppMobile(ctx.userId)
    if (!rl.ok) {
        return NextResponse.json(
            { error: 'Abriste tu app varias veces seguidas. Espera un momento y vuelve a intentarlo.', code: 'RATE_LIMIT' },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
        )
    }

    if (ctx.scope.type !== 'standalone') {
        return NextResponse.json(
            { error: 'Accion administrada por tu equipo.', code: 'WORKSPACE_ACTION_NOT_ALLOWED' },
            { status: 403 },
        )
    }

    // Body OPCIONAL: las versiones de la app anteriores a esta wave postean sin cuerpo y tienen que
    // seguir funcionando (un OTA no llega a todos los teléfonos el mismo día).
    const from = resolveFrom(await request.json().catch(() => null))

    // Sin cookie de sesión en este boundary: la ficha del coach se lee con el admin ya acotado al
    // `coachId` del bearer (mismo patrón que el resto de `api/mobile/coach/*`).
    const result = await createViveTuAppLink(ctx.admin, ctx.admin, {
        coachId: ctx.userId,
        surface: 'rn',
        // Siempre `mobile`: acá el llamador es la app, y no hay app de escritorio. No se infiere
        // del `user-agent` (el de `apiFetch` es el del runtime nativo, no el de un navegador).
        device: 'mobile',
        from,
    })

    if (!result.ok) {
        const status = result.reason === 'error' ? 500 : 409
        return NextResponse.json(
            {
                error:
                    result.reason === 'sin_demo'
                        ? 'Todavía no tienes alumno de ejemplo.'
                        : result.reason === 'sin_marca'
                          ? 'Tu marca todavía no tiene un enlace público.'
                          : (result.detail ?? 'No pudimos abrir tu app.'),
                code:
                    result.reason === 'sin_demo'
                        ? 'DEMO_NOT_FOUND'
                        : result.reason === 'sin_marca'
                          ? 'COACH_IDENTIFIER_MISSING'
                          : 'VIVE_TU_APP_FAILED',
            },
            { status },
        )
    }

    return NextResponse.json({ ok: true, url: result.url, demoName: result.demoName })
}
