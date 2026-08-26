import { NextRequest, NextResponse } from 'next/server'
import { MobileStudentWorkspaceValidationRequestSchema } from '@eva/schemas'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { validateMobileStudentWorkspace } from '@/services/auth/mobile-student-workspace.service'
import { recordStudentFirstLogin } from '@/services/client/student-login-signal.service'

function bearerToken(request: NextRequest): string | null {
    const authorization = request.headers.get('authorization')
    const match = authorization?.match(/^Bearer\s+(.+)$/i)
    return match?.[1]?.trim() || null
}

function errorResponse(status: number, code: string, error: string) {
    return NextResponse.json({ ok: false, code, error }, { status })
}

/**
 * Gate autoritativo post-login del alumno RN.
 *
 * La identidad viene únicamente del bearer validado por Supabase Auth. `coachId` selecciona el
 * workspace que el alumno intenta abrir, pero nunca concede acceso por sí mismo. Las lecturas con
 * service role permanecen server-side y se acotan a `user.id`, `coachId` y, para enterprise, al
 * `org_id` obtenido desde la membresía activa del alumno.
 */
export async function POST(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) return errorResponse(401, 'MISSING_TOKEN', 'Unauthorized')

    const admin = createServiceRoleClient()
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) return errorResponse(401, 'INVALID_TOKEN', 'Unauthorized')

    const parsed = MobileStudentWorkspaceValidationRequestSchema.safeParse(
        await request.json().catch(() => null),
    )
    if (!parsed.success) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Datos de acceso inválidos.')
    }

    try {
        const result = await validateMobileStudentWorkspace(
            admin,
            userData.user.id,
            parsed.data.coachId,
        )

        if (result.ok) {
            // W1.3: acá es donde el alumno RN queda adentro, así que acá se sella su primer
            // login. Se ESPERA a propósito (SPEC §5 regla 3): es un UPDATE por PK que nunca
            // lanza, y Vercel congela la invocación en el `return` de abajo — una promesa
            // flotante se perdería, que es la trampa exacta de
            // `lib/email/free-coach-onboarding.ts:24-28`. El capture de PostHog, que sí cuesta
            // red, viaja por `after()` dentro del servicio y no suma latencia a esta respuesta.
            await recordStudentFirstLogin(admin, result.clientId)

            return NextResponse.json({
                ok: true,
                forcePasswordChange: result.forcePasswordChange,
            })
        }

        if (result.reason === 'account_paused') {
            return errorResponse(
                403,
                'ACCOUNT_PAUSED',
                'Tu cuenta ha sido pausada. Contacta a tu coach para más información.',
            )
        }
        if (result.reason === 'access_denied') {
            return errorResponse(403, 'ACCESS_DENIED', 'No tienes acceso a esta plataforma.')
        }
        return errorResponse(503, 'VALIDATION_UNAVAILABLE', 'No se pudo validar el acceso.')
    } catch {
        return errorResponse(503, 'VALIDATION_UNAVAILABLE', 'No se pudo validar el acceso.')
    }
}
