/**
 * Correo de aviso de Pricing v3 (2026-08-21) a los coaches del plan Free.
 *
 * Contexto: desde Pricing v3 el white-label deja de ser Pro+ y pasa a estar en TODOS los
 * planes (decisión owner 2026-08-21); Pro se distingue por cupo (25) y por NO llevar el
 * sello «Hecho con EVA». A cambio, el cupo del Free baja de 2 a 1 alumno activo — los
 * alumnos ya existentes se conservan (backfill por uso, nadie pierde acceso).
 *
 * Reglas de contenido (pinneadas en el test de al lado):
 *   1. CERO precios, montos y descuentos: un correo con precios stale es peor que ninguno.
 *   2. Un solo CTA primario, siempre a /coach/settings/brand.
 *   3. Español neutro, breve (≤ 180 palabras de cuerpo) y sin promesas comerciales.
 *
 * Se envía UNA sola vez por coach desde el panel admin (`sendPricingV3NoticeAction`), que
 * deduplica contra `admin_audit_logs` (`action = 'coach.pricing_v3_notice'`).
 */
import { wrapEmailLayout, ctaButton, ghostButton, divider, featureRow } from './base-layout'

export type FreePlanV3NoticeContext = {
    /** Nombre de pila del coach (o 'Coach' como fallback del caller). */
    coachName: string
    /** URL absoluta a /coach/settings/brand. */
    brandUrl: string
    /** URL absoluta a /pricing. */
    pricingUrl: string
    /** URL absoluta a la app (dashboard); se usa en la versión de texto plano. */
    appUrl: string
}

export function buildFreePlanV3NoticeEmail(ctx: FreePlanV3NoticeContext): {
    subject: string
    html: string
    text: string
} {
    const subject = 'Tu plan Free ahora incluye tu marca'

    const body = `
<h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  Hola ${ctx.coachName} 👋
</h1>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
  Desde hoy tu plan Free incluye la marca personalizada completa: tu logo, tus colores y tu app
  con tu identidad — tus alumnos entran a <strong>TU</strong> app.
</p>

${featureRow('🎨', 'Logo y colores', 'Sube tu logo y elige tu color de marca: la app del alumno se pinta entera con tu identidad.')}
${featureRow('📱', 'Tu app con tu nombre', 'Web (PWA) y app nativa muestran tu marca, no la de EVA.')}
${featureRow('🏷️', 'Sello «Hecho con EVA»', 'En el plan Free la app del alumno lleva un sello discreto con el nombre de EVA.')}

${divider()}

<p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#111827;letter-spacing:0.2px;">
  Qué cambia
</p>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
  El plan Free pasa a incluir <strong>1 alumno activo</strong>. Los alumnos que ya tienes se
  conservan: nadie pierde acceso. Si necesitas más cupo, Pro incluye hasta 25 alumnos y tu app
  sin el sello de EVA.
</p>

<div style="margin-bottom:12px;">
  ${ctaButton('Configurar mi marca →', ctx.brandUrl)}
</div>
<div style="margin-bottom:20px;">
  ${ghostButton('Ver planes', ctx.pricingUrl)}
</div>

<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
  ¿Dudas? Responde este correo.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: 'Tu logo, tus colores y tu app con tu identidad — ahora también en el plan Free.',
        headerTitle: 'Tu marca en EVA',
    })

    const text = [
        `Hola ${ctx.coachName},`,
        '',
        'Desde hoy tu plan Free incluye la marca personalizada completa: tu logo, tus colores y tu app con tu identidad — tus alumnos entran a TU app.',
        '',
        '- Logo y colores: sube tu logo y elige tu color de marca; la app del alumno se pinta entera con tu identidad.',
        '- Tu app con tu nombre: web (PWA) y app nativa muestran tu marca, no la de EVA.',
        '- Sello «Hecho con EVA»: en el plan Free la app del alumno lleva un sello discreto con el nombre de EVA.',
        '',
        'QUÉ CAMBIA',
        'El plan Free pasa a incluir 1 alumno activo. Los alumnos que ya tienes se conservan: nadie pierde acceso. Si necesitas más cupo, Pro incluye hasta 25 alumnos y tu app sin el sello de EVA.',
        '',
        `Configurar mi marca: ${ctx.brandUrl}`,
        `Ver planes: ${ctx.pricingUrl}`,
        `Entrar a EVA: ${ctx.appUrl}`,
        '',
        '¿Dudas? Responde este correo.',
    ].join('\n')

    return { subject, html, text }
}
