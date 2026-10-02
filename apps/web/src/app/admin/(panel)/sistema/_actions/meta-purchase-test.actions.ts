'use server'

import { z } from 'zod'
import { assertAdmin, logAdminAction } from '@/lib/admin/admin-action-wrapper'
import { getTierPriceClp } from '@/lib/constants'
import {
    collectMetaCapiContext,
    isMetaCapiConfigured,
    newMetaEventId,
    sendMetaCapiEvent,
} from '@/lib/meta/capi'
import { PURCHASE_EVENT_SOURCE_URL } from '@/services/billing/meta-purchase.service'

/** Formato de los códigos de «Eventos de prueba» de Events Manager (p. ej. `TEST12345`). */
const TestEventCodeSchema = z
    .string()
    .trim()
    .regex(/^TEST[0-9A-Za-z]{1,32}$/)

/**
 * Plan C: prueba del píxel de compra sin esperar un pago real. Manda un `Purchase` con el código
 * de «Eventos de prueba» pegado por el admin, así Meta lo muestra ahí y NO lo cuenta como compra.
 * El código entra SOLO por esta acción manual: nunca por variable de entorno.
 */
export async function sendMetaPurchaseTestAction(
    rawCode: string
): Promise<{ success: true } | { error: string }> {
    const { user, adminClient } = await assertAdmin()

    const parsed = TestEventCodeSchema.safeParse(rawCode)
    if (!parsed.success) {
        return { error: 'El código empieza con TEST. Cópialo de Events Manager → Eventos de prueba.' }
    }
    if (!isMetaCapiConfigured()) {
        return { error: 'Falta el píxel o el token de Meta en Vercel (NEXT_PUBLIC_FB_PIXEL_ID / META_CAPI_TOKEN).' }
    }

    const context = await collectMetaCapiContext()
    const eventId = `purchase:test:${newMetaEventId()}`
    const result = await sendMetaCapiEvent({
        eventName: 'Purchase',
        eventId,
        eventSourceUrl: PURCHASE_EVENT_SOURCE_URL,
        actionSource: 'website',
        userData: { email: user.email ?? null, externalId: user.id },
        customData: {
            value: getTierPriceClp('pro', 'monthly'),
            currency: 'CLP',
            content_name: 'pro_monthly',
        },
        // Mismo contrato que el envío real: sin IP.
        context: { ...context, clientIpAddress: null },
        testEventCode: parsed.data,
    })

    await logAdminAction(
        adminClient,
        'meta.purchase_test_sent',
        'system',
        null,
        { event_id: eventId, ok: result.ok, ...(result.ok ? {} : { reason: result.reason }) },
        user.email
    )

    if (!result.ok) {
        return {
            error:
                result.reason === 'rejected'
                    ? `Meta rechazó el evento (HTTP ${result.status ?? '?'}). Revisa que el código sea del píxel correcto.`
                    : 'No se pudo llegar a Meta. Intenta de nuevo en un minuto.',
        }
    }
    return { success: true }
}
