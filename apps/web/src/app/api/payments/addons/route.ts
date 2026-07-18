import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/payments/addons — RETIRADO (decisión CEO 2026-07-17, definitiva).
 *
 * Los 4 módulos (cardio, movement_assessment, body_composition, nutrition_exchanges) quedan
 * INCLUIDOS en todo plan pago activo y YA NO se compran/activan por separado. Este endpoint de ALTA
 * self-service queda deshabilitado de forma PERMANENTE: responde 403 `MODULES_INCLUDED`.
 *
 * MONEY-SAFETY: no se toca el riel de subs (webhooks, preapprovals, cancelaciones) ni las filas
 * `coach_addons` existentes (cortesías `admin_grant` y `self_service` vivas se conservan y siguen
 * materializándose al jsonb vía trigger). La ENTREGA de los módulos la hace la derivación en lectura
 * de `entitlements.service` (`deriveModulesForPaidAccess`), no una compra. Solo se corta la ENTRADA
 * de compra nueva; el motor de billing de add-ons (service/webhook/repository) se conserva intacto
 * para el histórico y una eventual reversión.
 */

export async function POST(request: Request) {
    void request
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json(
        {
            error: 'Los módulos ya están incluidos en tu plan. Ya no se compran ni se activan por separado.',
            code: 'MODULES_INCLUDED',
        },
        { status: 403 }
    )
}
