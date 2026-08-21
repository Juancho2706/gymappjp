import { studentCountLabel } from '@eva/tiers'
import { wrapEmailLayout, ctaButton, badge } from './base-layout'

/**
 * Emails de VENTA por evento — el canal de venta que se PURGÓ de la app móvil por compliance de
 * tiendas (`docs/research/cta-pagos-externos-stores-2026-07-31.md` §6).
 *
 * Apple 3.1.1 y la política de pagos de Google prohíben botones, links o textos DENTRO de la app
 * que dirijan a un mecanismo de pago externo (anti-steering). La app queda con muros NEUTROS de
 * estado; el email —canal legítimo y sin restricción de contenido— lleva el CTA de pago. Cada
 * correo se dispara por el MISMO evento que muestra el muro neutro, para llegar en el momento
 * exacto de la fricción.
 *
 * Reglas de contenido (decisión del owner):
 * - CERO listas de precios: los planes cambian y un correo viejo con precios stale es peor que
 *   ninguno. El precio se ve en `/coach/subscription`, que es la única fuente viva.
 * - UN solo CTA por correo (a `/coach/subscription`).
 * - Tono cercano, español latam neutro CON tildes.
 * - HTML inline sobre `wrapEmailLayout` (mismo shell que el resto de los correos EVA). El shell es
 *   card blanca con texto oscuro explícito en cada nodo: se ve igual en clientes con dark mode
 *   forzado (Gmail/Outlook no re-colorean lo que ya tiene color inline).
 *
 * Sin `brand` a propósito: son correos de EVA AL COACH (no al alumno), nunca white-label.
 */

/** Formato de fecha de los correos de cobro (espejo de `webhook-pipeline.ts` §dunning). */
export function formatSalesEmailDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-CL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })
}

/** Escapa texto controlado por el coach (nombre) antes de interpolarlo en el HTML. */
function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── 1. Límite de alumnos alcanzado ───────────────────────────────────────────

export type ClientLimitReachedContext = {
    coachName: string
    /** Etiqueta del tier (`TIER_LABELS`): 'Gratis' | 'Starter' | 'Pro' | … */
    tierLabel: string
    /** Cupo de alumnos activos del plan vigente. */
    currentLimit: number
    subscriptionUrl: string
    /**
     * Tier de venta recomendado como próximo paso (pricing v2, D3: el upsell apunta a Pro — nunca a
     * starter, que salió de la venta). 'Pro' para free/starter, 'Elite' para pro; null (elite o
     * legacy sin techo de venta mayor) mantiene el copy genérico. Sin números de cupo a propósito:
     * el límite concreto depende del grandfather de cada coach y se ve en /coach/subscription.
     */
    recommendedTierLabel?: string | null
}

export function buildClientLimitReachedEmail(ctx: ClientLimitReachedContext) {
    const coachName = escHtml(ctx.coachName)
    const tierLabel = escHtml(ctx.tierLabel)
    const recommended = ctx.recommendedTierLabel ? escHtml(ctx.recommendedTierLabel) : null
    // Pricing v3: el cupo free es 1 ⇒ el plural sale del helper compartido, nunca hardcodeado.
    const subject = `Alcanzaste el límite de ${studentCountLabel(ctx.currentLimit)} de tu plan ${ctx.tierLabel}`

    const body = `
${badge('LÍMITE ALCANZADO', '#F59E0B')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ${coachName}, tu negocio está creciendo
</h1>
<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
  Tu plan <strong style="color:#111827;">${tierLabel}</strong> permite hasta
  <strong style="color:#111827;">${studentCountLabel(ctx.currentLimit)} activo${ctx.currentLimit === 1 ? '' : 's'}</strong> y ya ${ctx.currentLimit === 1 ? 'lo tienes ocupado' : 'los tienes todos ocupados'}.
  Por eso no pudimos sumar al alumno que intentaste agregar.
</p>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
  ${recommended
      ? `Con el plan <strong style="color:#111827;">${recommended}</strong> subes el cupo al instante: tus alumnos actuales, sus rutinas y su historial
  se quedan donde están, y puedes seguir sumando gente sin tener que archivar a nadie.`
      : `Con un plan más grande subes el cupo al instante: tus alumnos actuales, sus rutinas y su historial
  se quedan donde están, y puedes seguir sumando gente sin tener que archivar a nadie.`}
</p>
${ctaButton(recommended ? `Pasar a ${recommended}` : 'Ampliar mi plan', ctx.subscriptionUrl)}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
  ¿Prefieres no cambiar de plan por ahora? También puedes archivar a un alumno inactivo para liberar
  un cupo. Si tienes dudas, responde este correo y te ayudamos.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Tu plan ${ctx.tierLabel} llegó a ${studentCountLabel(ctx.currentLimit)} activo${ctx.currentLimit === 1 ? '' : 's'}.`,
        headerTitle: 'Límite de alumnos — EVA',
    })

    return { subject, html }
}

// ── 2. El plan vence pronto ──────────────────────────────────────────────────

export type PlanExpiringSoonContext = {
    coachName: string
    tierLabel: string
    /** Fecha ya formateada (es-CL) del fin del período pagado. */
    expiresOn: string
    /** Días que faltan (para el preview y el cuerpo). */
    daysLeft: number
    subscriptionUrl: string
}

export function buildPlanExpiringSoonEmail(ctx: PlanExpiringSoonContext) {
    const coachName = escHtml(ctx.coachName)
    const tierLabel = escHtml(ctx.tierLabel)
    const expiresOn = escHtml(ctx.expiresOn)
    const subject = `Tu plan ${ctx.tierLabel} vence el ${ctx.expiresOn}`
    const daysLabel = ctx.daysLeft === 1 ? 'queda 1 día' : `quedan ${ctx.daysLeft} días`

    const body = `
${badge('VENCE PRONTO', '#F59E0B')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ${coachName}, tu plan ${tierLabel} vence el ${expiresOn}
</h1>
<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
  Tu suscripción no se va a renovar sola, así que ${daysLabel} de acceso completo. Después de esa
  fecha tus alumnos dejan de ver sus rutinas y su nutrición desde la app.
</p>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
  Renovar toma menos de un minuto y todo sigue exactamente igual: mismos alumnos, mismos programas,
  mismo historial.
</p>
${ctaButton('Renovar mi plan', ctx.subscriptionUrl)}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
  Si ya lo renovaste, ignora este correo. ¿Alguna duda? Responde y te damos una mano.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `${daysLabel.charAt(0).toUpperCase()}${daysLabel.slice(1)} de acceso a tu plan ${ctx.tierLabel}.`,
        headerTitle: 'Tu plan vence pronto — EVA',
    })

    return { subject, html }
}

// ── 3. El plan venció ────────────────────────────────────────────────────────

export type PlanExpiredContext = {
    coachName: string
    tierLabel: string
    subscriptionUrl: string
}

export function buildPlanExpiredEmail(ctx: PlanExpiredContext) {
    const coachName = escHtml(ctx.coachName)
    const tierLabel = escHtml(ctx.tierLabel)
    const subject = 'Tu plan venció — tus alumnos y datos siguen guardados'

    const body = `
${badge('PLAN VENCIDO', '#EF4444')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ${coachName}, tu plan ${tierLabel} venció
</h1>
<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
  Tranquilo: <strong style="color:#111827;">no borramos nada</strong>. Tus alumnos, sus rutinas, su
  nutrición y todo el historial siguen guardados tal como los dejaste.
</p>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
  Mientras el plan esté vencido, tú y tus alumnos ven la app con acceso limitado. Al reactivar,
  todo vuelve a estar disponible al instante — no tienes que volver a cargar nada.
</p>
${ctaButton('Reactivar mi plan', ctx.subscriptionUrl)}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
  ¿Se te venció por un problema con el pago o quieres revisar otro plan? Responde este correo y lo
  vemos contigo.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: 'Tus alumnos y tu historial siguen guardados. Reactiva cuando quieras.',
        headerTitle: 'Tu plan venció — EVA',
    })

    return { subject, html }
}
