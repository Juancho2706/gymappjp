import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { activateFreePlanForCoach } from '@/services/billing/activate-free.service'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'

export async function POST() {
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
        }

        const workspace = await resolvePreferredWorkspace(supabase, user.id)
        if (!canViewBilling(workspace)) {
            return NextResponse.json({ error: 'Billing disponible solo para coach independiente.' }, { status: 403 })
        }

        // Toda la logica de dinero (estados bloqueados, recuento de cupo, cancelacion en el gateway,
        // flip a Free + eventos/auditoria) vive en el service, compartido con el bridge mobile
        // `/api/mobile/coach/activate-free`. Aca solo queda la autenticacion por cookie.
        const admin = createServiceRoleClient()
        const result = await activateFreePlanForCoach(admin, user.id, 'web')

        if (!result.ok) {
            // `ok`/`status` se descartan: el contrato de respuesta que consume ReactivateClient
            // sigue siendo exactamente { error, activeCount?, freeLimit? }.
            const { ok: _ok, status, ...payload } = result
            return NextResponse.json(payload, { status })
        }

        return NextResponse.json({ ok: true })
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error inesperado' },
            { status: 500 }
        )
    }
}
