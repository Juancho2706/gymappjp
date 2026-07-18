import { NextRequest, NextResponse } from 'next/server'
import { MobileProgramAssignmentNotificationRequestSchema } from '@eva/schemas'
import { resolveMobileClientMutationContext } from '@/app/api/mobile/coach/clients/_mutation-auth'
import { createProgramAssignmentNotificationRepository } from '@/infrastructure/db/program-assignment-notification.repository'
import { resendIdempotentEmailSender } from '@/infrastructure/email/resend-idempotent-email.repository'
import { sendProgramAssignmentNotifications } from '@/services/workout/program-assignment-notification.service'

/**
 * Side effect posterior a la asignación RN. La app ya persistió los programas por RLS; este bridge
 * solo revalida esas filas y emite el mismo correo que el server action web. Nunca muta el plan.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const rawWorkspace = body && typeof body === 'object' && 'workspace' in body
    ? body.workspace
    : undefined
  // Mutación/side effect: auth revocation-aware ANTES de validar el resto del payload.
  const context = await resolveMobileClientMutationContext(request, rawWorkspace)
  if ('error' in context) return context.error

  const parsed = MobileProgramAssignmentNotificationRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({
      success: false,
      error: 'Solicitud inválida.',
      code: 'VALIDATION_ERROR',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }, { status: 400 })
  }

  try {
    const result = await sendProgramAssignmentNotifications({
      userId: context.userId,
      programIds: parsed.data.programIds,
      scope: context.scope,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || null,
      repository: createProgramAssignmentNotificationRepository(context.admin),
      emailSender: resendIdempotentEmailSender,
    })
    if (result.skipped.some((item) => item.reason === 'provider_error')) {
      console.error('[mobile-program-assignment-notifications] one or more emails failed', {
        userId: context.userId,
        failedCount: result.skipped.filter((item) => item.reason === 'provider_error').length,
      })
    }
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('[mobile-program-assignment-notifications] failed', error)
    return NextResponse.json({
      success: false,
      error: 'No se pudieron procesar las notificaciones.',
      code: 'NOTIFICATION_PROCESSING_ERROR',
    }, { status: 500 })
  }
}
