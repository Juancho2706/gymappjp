import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/payments/addons/cancel — RETIRADO (decisión CEO 2026-07-17, definitiva).
 *
 * Los módulos quedan INCLUIDOS en el plan pago y YA NO se activan ni se desactivan por separado.
 * Esta BAJA self-service queda deshabilitada de forma PERMANENTE: responde 403 `MODULES_INCLUDED`.
 *
 * MONEY-SAFETY: no se toca el riel de subs ni las filas `coach_addons` vivas (cortesías/self_service
 * se conservan y siguen sumando vía trigger). El motor de baja de add-ons (service/repository) se
 * conserva intacto para el histórico y una eventual reversión; solo se corta la ENTRADA de baja.
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
            error: 'Los módulos están incluidos en tu plan. Ya no se activan ni se desactivan por separado.',
            code: 'MODULES_INCLUDED',
        },
        { status: 403 }
    )
}
