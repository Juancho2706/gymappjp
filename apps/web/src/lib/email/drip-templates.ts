import { TIER_CONFIG, studentCountLabel } from '@eva/tiers'
import { buildSubscriptionUrl } from './subscription-url'
import { wrapEmailLayout, ctaButton, divider, featureRow, badge } from './base-layout'

/**
 * Serie de bienvenida del coach Free (drip v3, embudo Free→Pro W2.2).
 *
 * Por qué se rediseñó: con Pricing v3 el plan gratuito cubre UN alumno, así que el muro de cupo
 * llega el día 1, no el 14. La serie vieja (D+3 «consigue tu primer alumno» · D+7 nutrición ·
 * D+14 upgrade con una tabla de precios literal) hablaba de un producto que ya no existe y sus
 * precios se escribían a mano.
 *
 * Contrato de contenido, verificado por `drip-templates.test.ts`:
 * - UN solo `<a>` por correo. En D+1 ese link es el del alta directa (`/coach/clients?invite=1`).
 * - CERO precios salvo D+2 y D+14, y ahí el precio sale de `TIER_CONFIG.pro.monthlyPriceClp`
 *   formateado es-CL — nunca un literal.
 * - Pie de baja en texto plano (sin `<a>`) en los cuatro: es una serie que EVA inicia sola
 *   (Ley 19.496 art. 28 B), igual que el barrido de cupo.
 * - Sin afirmaciones que no podamos sostener (nada de «5× más probabilidades» ni «retienen el doble»).
 */

type DripTemplateContext = {
    coachName: string | null
    brandName: string | null
    baseUrl: string
    /**
     * Código de invitación del coach. **Sin uso desde FCN W2.5**: el D+1 dejó de repartir
     * `/join/{código}` —la puerta de SOLICITUDES— y ahora manda al alta directa. El campo se
     * conserva para no arrastrar la cadena entera (`send-drip-sequence` → `free-coach-onboarding`
     * → sus dos call sites, uno de ellos en otra ola) en este cambio; su limpieza queda declarada.
     */
    inviteCode?: string | null
}

/** Keys de la serie, en orden de envío. Fuente única del union que consume `send-drip-sequence`. */
export const DRIP_TEMPLATE_KEYS = ['day1_value', 'day2_pro', 'day7_nutrition', 'day14_last_call'] as const

export type DripTemplateKey = (typeof DRIP_TEMPLATE_KEYS)[number]

export type DripTemplate = {
    key: DripTemplateKey
    day: 1 | 2 | 7 | 14
    subject: string
    html: string
}

/**
 * Pie de baja. Texto plano a propósito: el contrato del correo es UN solo link y ése ya lo gasta
 * el CTA (o el link de invitación en el D+1).
 */
export const DRIP_UNSUBSCRIBE_FOOTER =
    'Recibes esta serie porque creaste tu cuenta de coach en EVA. Si no quieres recibirla, responde este correo o escríbenos a contacto@eva-app.cl.'

function coachDisplayName(ctx: DripTemplateContext) {
    return ctx.coachName?.trim() || 'Coach'
}

/**
 * Fallback de marca: «tu app», NO «tu marca». El coach sin `brand_name` todavía no eligió una
 * marca; lo que sí tiene desde el minuto cero es una app. «Entra directo a tu marca» no se entiende;
 * «entra directo a tu app» sí.
 */
function brandDisplayName(ctx: DripTemplateContext) {
    return ctx.brandName?.trim() || 'tu app'
}

/** Precio de Pro desde el catálogo vivo, formateado es-CL («$29.990»). Nunca un literal. */
function proMonthlyPrice(): string {
    return `$${new Intl.NumberFormat('es-CL').format(TIER_CONFIG.pro.monthlyPriceClp)}`
}

export function buildDripTemplates(ctx: DripTemplateContext): DripTemplate[] {
    const coach = coachDisplayName(ctx)
    const brand = brandDisplayName(ctx)
    // FCN W2.5: destino del D+1 = el alta directa de 3 pasos (`?invite=1`, `coach/clients/page.tsx`),
    // no `/join/{código}`. Va SIN UTM como iba el link de invitación: es la superficie del coach,
    // y etiquetarla `utm_source=drip` ensuciaría el embudo con tráfico que este correo no compra.
    const addStudent = `${ctx.baseUrl}/coach/clients?invite=1`
    // M-6: el CTA del D+7 lleva atribución como los de venta (el `utm_medium` es siempre `email`).
    const nutrition = `${ctx.baseUrl}/coach/nutrition-plans?utm_source=drip&utm_medium=email&utm_campaign=day7_nutrition`
    const proPrice = proMonthlyPrice()
    const proClients = studentCountLabel(TIER_CONFIG.pro.maxClients)
    const freeClients = studentCountLabel(TIER_CONFIG.free.maxClients)

    // ── D+1: valor — tu app ya está lista ────────────────────────────────────
    // FCN W2.5: el bloque dejó de repartir `/join/{código}` y dejó de prometer que el alumno «se
    // registra solo». `/join` es la puerta de SOLICITUDES; la que produce alumnos es el alta
    // directa, así que el único link del correo la apunta a ella. Las dos variantes (con y sin
    // código) colapsaron en una: el copy nuevo no necesita el código para nada.
    // Copy LITERAL de docs/specs/flujo-coach-nuevo/SPEC.md §6 — no se improvisa.
    const inviteBlock = `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;">
  <tr>
    <td>
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#065f46;">Da de alta a tu primer alumno</p>
      <p style="margin:0 0 14px;font-size:13px;color:#374151;line-height:1.6;">Le creas la cuenta desde tu panel y le llega el mensaje con su acceso listo. Toma menos de un minuto.</p>
      ${ctaButton('Dar de alta a mi primer alumno →', addStudent)}
    </td>
  </tr>
</table>`

    const day1Body = `
${badge('Día 1 — Ya está lista')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ${coach}, tu app ya está lista
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
  <strong>${brand}</strong> ya está armada en EVA, con tu nombre y tus colores. Tu alumno no
  necesita nada más que un link para entrar.
</p>

${inviteBlock}

${divider()}

<p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#111827;">
  Tres cosas que puedes hacer hoy con tu primer alumno
</p>
${featureRow('📩', 'Dale de alta desde tu panel', 'Le creas la cuenta y le mandas su acceso por WhatsApp.')}
${featureRow('💪', 'Asígnale una rutina', 'Ármala en el constructor y le queda en la app el mismo día.')}
${featureRow('🥗', 'Súmale su plan de nutrición', 'Está incluido en tu plan gratuito, no es un módulo aparte.')}

<p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
  ¿Te trabas en algo? Responde este correo y te ayudamos.
</p>`

    // ── D+2: qué pasa con el segundo alumno (el único correo con precio + CTA de plan) ──
    const day2Body = `
${badge('Día 2 — Tu cupo')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ${coach}, ¿y cuando llegue el segundo?
</h1>
<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
  Tu plan gratuito cubre <strong>${freeClients} activo</strong> a la vez, con tu marca completa.
  Cuando quieras sumar al segundo tienes dos caminos: archivar al primero —su historial queda
  intacto y puedes reactivarlo— o ampliar el cupo.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
  <tr>
    <td style="padding:16px;">
      <p style="margin:0 0 6px;font-size:14px;font-weight:800;color:#111827;">Pro — ${proPrice}/mes</p>
      <ul style="margin:0;padding-left:18px;font-size:13px;color:#374151;line-height:1.9;">
        <li>Hasta ${proClients} activos</li>
        <li>Sin el sello «Hecho con EVA» en lo que ve tu alumno</li>
        <li>Los mismos módulos, la misma nutrición y la misma marca que ya tienes</li>
      </ul>
    </td>
  </tr>
</table>

<div style="margin-bottom:12px;">
  ${ctaButton('Ver el plan Pro →', buildSubscriptionUrl({ utmSource: 'drip', utmCampaign: 'day2_pro' }))}
</div>

<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
  El cambio de plan se hace en eva-app.cl con tu mismo correo y contraseña, y lo puedes cancelar
  cuando quieras.
</p>`

    // ── D+7: nutrición (incluida en el plan gratuito) ────────────────────────
    const day7Body = `
${badge('Día 7 — Nutrición')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  Una semana con EVA, ${coach}
</h1>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
  Lo que más nos preguntan a esta altura: sí, la <strong>nutrición viene incluida en el plan
  gratuito</strong>. No es un módulo aparte ni se cobra por separado.
</p>

${featureRow('🥗', 'Plan de comidas por alumno', 'Define macros y calorías; el alumno ve el plan del día en su app.')}
${featureRow('🔁', 'Listas de equivalencias', 'Si no encuentra un alimento, lo cambia por otro sin descuadrar los macros.')}
${featureRow('📋', 'Check-in semanal', 'Peso, energía y sueño en un formulario; tú ves la tendencia en el dashboard.')}

${divider()}

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
  <tr>
    <td>
      <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
        <strong>Se abre desde la ficha de tu alumno.</strong> El primer plan te toma unos minutos y
        queda guardado como plantilla para el siguiente.
      </p>
    </td>
  </tr>
</table>

<div style="margin-bottom:12px;">
  ${ctaButton('Abrir nutrición →', nutrition)}
</div>`

    // ── D+14: última llamada (sin presión) ───────────────────────────────────
    const day14Body = `
${badge('Día 14 — Última de la serie')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  La serie llega hasta acá, ${coach}
</h1>
<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
  Este es el último correo de la bienvenida. Te dejamos por escrito lo único que puede hacerte
  falta más adelante, para que lo tengas a mano el día que lo necesites.
</p>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
  Tu plan gratuito cubre <strong>${freeClients} activo</strong>, sin fecha de vencimiento y sin
  tarjeta. Si algún día necesitas más, <strong>Pro</strong> sube el cupo a <strong>${proClients}
  activos</strong> por ${proPrice}/mes y saca el sello «Hecho con EVA» de lo que ve tu alumno.
</p>

<div style="margin-bottom:12px;">
  ${ctaButton('Ver el plan Pro →', buildSubscriptionUrl({ utmSource: 'drip', utmCampaign: 'day14_last_call' }))}
</div>

<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Si por ahora estás bien con el plan gratuito, perfecto: no tienes que hacer nada. Dejamos de
  escribirte por esta serie y seguimos acá si nos necesitas.
</p>`

    return [
        {
            key: 'day1_value',
            day: 1,
            // FCN W2.5: el asunto y la preview dejaron de bifurcarse por `inviteCode`. El correo ya
            // no reparte ningún link de invitación, así que «tu link ya está listo» (el viejo M-7)
            // sería la misma promesa incumplida que este cambio vino a matar.
            subject: `${coach}, tu app ya está lista`,
            html: wrapEmailLayout(day1Body, {
                previewText: 'Da de alta a tu primer alumno desde tu panel, en menos de un minuto.',
                headerTitle: 'Tu app ya está lista — EVA',
                footerText: DRIP_UNSUBSCRIBE_FOOTER,
            }),
        },
        {
            key: 'day2_pro',
            day: 2,
            subject: `${coach}, ¿y cuando llegue tu segundo alumno?`,
            html: wrapEmailLayout(day2Body, {
                previewText: 'Tu plan gratuito cubre un alumno activo. Así se amplía el cupo.',
                headerTitle: 'Tu cupo de alumnos — EVA',
                footerText: DRIP_UNSUBSCRIBE_FOOTER,
            }),
        },
        {
            key: 'day7_nutrition',
            day: 7,
            subject: 'La nutrición ya viene incluida en tu plan',
            html: wrapEmailLayout(day7Body, {
                previewText: 'Planes de comidas y equivalencias, incluidos en el plan gratuito.',
                headerTitle: 'Nutrición — EVA',
                footerText: DRIP_UNSUBSCRIBE_FOOTER,
            }),
        },
        {
            key: 'day14_last_call',
            day: 14,
            subject: `${coach}, última de esta serie`,
            html: wrapEmailLayout(day14Body, {
                previewText: 'Te dejamos por escrito cómo ampliar el cupo el día que lo necesites.',
                headerTitle: 'Última de la serie — EVA',
                footerText: DRIP_UNSUBSCRIBE_FOOTER,
            }),
        },
    ]
}
