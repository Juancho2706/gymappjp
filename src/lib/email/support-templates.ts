type SupportEmailContext = {
  coachName: string
  coachEmail: string
  gymName?: string | null
  type: 'help' | 'bug' | 'idea'
  priority?: string | null
  subject: string
  description: string
  attachmentUrl?: string | null
  metadata: {
    url: string
    userAgent: string
    timestamp: string
    coachId: string
  }
}

export function buildSupportEmail(ctx: SupportEmailContext) {
  const typeLabel: Record<string, string> = {
    help: 'Necesito ayuda',
    bug: 'Reportar bug',
    idea: 'Sugerir mejora',
  }

  const priorityLabel = ctx.priority ? `Prioridad: ${ctx.priority}` : ''

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5; max-width: 600px;">
      <h2 style="margin:0 0 12px;">Nuevo mensaje de soporte — EVA</h2>
      <table style="width:100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr><td style="padding:6px 0; border-bottom:1px solid #e5e7eb; font-weight:600; width:120px;">Coach</td><td style="padding:6px 0; border-bottom:1px solid #e5e7eb;">${ctx.coachName}</td></tr>
        <tr><td style="padding:6px 0; border-bottom:1px solid #e5e7eb; font-weight:600;">Email</td><td style="padding:6px 0; border-bottom:1px solid #e5e7eb;">${ctx.coachEmail}</td></tr>
        <tr><td style="padding:6px 0; border-bottom:1px solid #e5e7eb; font-weight:600;">Gimnasio</td><td style="padding:6px 0; border-bottom:1px solid #e5e7eb;">${ctx.gymName || '—'}</td></tr>
        <tr><td style="padding:6px 0; border-bottom:1px solid #e5e7eb; font-weight:600;">Tipo</td><td style="padding:6px 0; border-bottom:1px solid #e5e7eb;">${typeLabel[ctx.type] || ctx.type}</td></tr>
        ${priorityLabel ? `<tr><td style="padding:6px 0; border-bottom:1px solid #e5e7eb; font-weight:600;">Prioridad</td><td style="padding:6px 0; border-bottom:1px solid #e5e7eb;">${priorityLabel}</td></tr>` : ''}
        <tr><td style="padding:6px 0; border-bottom:1px solid #e5e7eb; font-weight:600;">URL</td><td style="padding:6px 0; border-bottom:1px solid #e5e7eb;"><a href="${ctx.metadata.url}">${ctx.metadata.url}</a></td></tr>
        <tr><td style="padding:6px 0; border-bottom:1px solid #e5e7eb; font-weight:600;">Fecha</td><td style="padding:6px 0; border-bottom:1px solid #e5e7eb;">${ctx.metadata.timestamp}</td></tr>
        <tr><td style="padding:6px 0; border-bottom:1px solid #e5e7eb; font-weight:600;">User Agent</td><td style="padding:6px 0; border-bottom:1px solid #e5e7eb; font-size:11px; color:#6b7280;">${ctx.metadata.userAgent}</td></tr>
        <tr><td style="padding:6px 0; border-bottom:1px solid #e5e7eb; font-weight:600;">Coach ID</td><td style="padding:6px 0; border-bottom:1px solid #e5e7eb; font-family:monospace; font-size:12px;">${ctx.metadata.coachId}</td></tr>
      </table>
      <h3 style="margin:0 0 8px; font-size:14px;">${ctx.subject}</h3>
      <div style="background:#f9fafb; border-radius:8px; padding:12px; white-space:pre-line;">${ctx.description}</div>
      ${ctx.attachmentUrl ? `<p style="margin-top:12px;"><a href="${ctx.attachmentUrl}" style="display:inline-block;padding:8px 12px;border-radius:6px;background:#111827;color:#fff;text-decoration:none;font-size:12px;">Ver adjunto</a></p>` : ''}
      <p style="margin-top:16px; color:#6b7280; font-size:11px;">Este mensaje fue enviado desde EVA Fitness Platform.</p>
    </div>
  `

  const text = `Nuevo mensaje de soporte — EVA

Coach: ${ctx.coachName}
Email: ${ctx.coachEmail}
Gimnasio: ${ctx.gymName || '—'}
Tipo: ${typeLabel[ctx.type] || ctx.type}
${priorityLabel ? priorityLabel + '\n' : ''}URL: ${ctx.metadata.url}
Fecha: ${ctx.metadata.timestamp}
Coach ID: ${ctx.metadata.coachId}

ASUNTO: ${ctx.subject}

DESCRIPCIÓN:
${ctx.description}

${ctx.attachmentUrl ? 'Adjunto: ' + ctx.attachmentUrl + '\n' : ''}---
Este mensaje fue enviado desde EVA Fitness Platform.
`

  return {
    subject: `[EVA Soporte] [${typeLabel[ctx.type]?.toUpperCase() || ctx.type.toUpperCase()}] ${ctx.subject} — ${ctx.coachName}`,
    html,
    text,
  }
}
