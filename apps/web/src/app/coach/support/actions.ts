'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildSupportEmail } from '@/lib/email/support-templates'
import { rateLimitSupport } from '@/lib/rate-limit'

const supportSchema = z.object({
  type: z.enum(['help', 'bug', 'idea']),
  subject: z.string().min(3, 'El asunto es requerido').max(200),
  description: z.string().min(10, 'Describe tu consulta con al menos 10 caracteres').max(5000),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  attachmentUrl: z.string().optional(),
  metadataUrl: z.string().max(1000).optional(),
  metadataUserAgent: z.string().max(1000).optional(),
})

export type SupportMessageState =
  | { success: true }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

export async function sendSupportMessage(
  _prev: SupportMessageState | null,
  formData: FormData
): Promise<SupportMessageState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'No autenticado.' }
  }

  // Rate limiting
  const rl = await rateLimitSupport(user.id)
  if (!rl.ok) {
    return { success: false, error: 'Has enviado muchos mensajes. Intenta más tarde.' }
  }

  const raw = {
    type: formData.get('type') as string,
    subject: formData.get('subject') as string,
    description: formData.get('description') as string,
    priority: (formData.get('priority') as string) || undefined,
    attachmentUrl: (formData.get('attachmentUrl') as string) || undefined,
    metadataUrl: (formData.get('metadataUrl') as string) || undefined,
    metadataUserAgent: (formData.get('metadataUserAgent') as string) || undefined,
  }

  const parsed = supportSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: 'Revisa los campos del formulario.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const { type, subject, description, priority, attachmentUrl, metadataUrl, metadataUserAgent } = parsed.data

  // Fetch coach info
  const { data: coach } = await supabase
    .from('coaches')
    .select('id, full_name, brand_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!coach) {
    return { success: false, error: 'No se encontró tu perfil de coach.' }
  }

  const emailResult = buildSupportEmail({
    coachName: coach.full_name || 'Coach',
    coachEmail: user.email || 'sin-email',
    gymName: coach.brand_name,
    type,
    priority: priority ?? null,
    subject,
    description,
    attachmentUrl: attachmentUrl ?? null,
    metadata: {
      url: metadataUrl || 'No disponible',
      userAgent: metadataUserAgent || 'No disponible',
      timestamp: new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' }),
      coachId: coach.id,
    },
  })

  const sendResult = await sendTransactionalEmail({
    to: process.env.SUPPORT_EMAIL_TO || 'contacto@eva-app.cl',
    replyTo: user.email || undefined,
    subject: emailResult.subject,
    html: emailResult.html,
    text: emailResult.text,
  })

  if (!sendResult.ok) {
    console.error('[support-email] failed:', sendResult.error)
    return { success: false, error: 'No se pudo enviar el mensaje. Intenta más tarde.' }
  }

  return { success: true }
}
