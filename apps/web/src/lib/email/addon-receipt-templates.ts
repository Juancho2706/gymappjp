import { wrapEmailLayout, ctaButton, divider, badge } from './base-layout'

/**
 * Recibos transaccionales de add-ons (plan estrategia 05 F4.5). Resend ya integrado
 * (`send-email.ts`). El envío es fire-and-forget desde el endpoint / webhook: si Resend
 * falla, se loggea pero NUNCA bloquea la mutación de cobro.
 *
 * Evidencia SERNAC (Ley 19.496): el recibo de alta lleva el desglose completo del próximo
 * cobro + el texto íntegro de las 5 reglas aceptadas; el de baja la fecha efectiva y la
 * leyenda "sin reembolso de fracciones".
 *
 * CERO mención de IVA en estas plantillas (decisión D5 del dueño — silencio total hasta
 * constituir EVAapp SpA). Español latam neutro con tildes.
 */

const CLP = (clp: number) => `$${clp.toLocaleString('es-CL')}`

/** Una regla aceptada, en la variante (mensual / trim-anual) que se mostró al coach. */
export type AcceptedRule = { number: number; title: string; text: string }

/** Línea del desglose del próximo cobro. */
export type ReceiptAddonLine = { label: string; cycleAmountClp: number }

export type AddonActivationReceiptContext = {
    coachName: string
    /** Etiqueta del módulo recién activado (p.ej. "Cardio"). */
    addonLabel: string
    /** Etiqueta del ciclo del coach (p.ej. "Mensual", "Trimestral", "Anual"). */
    cycleLabel: string
    /** Base del plan por ciclo (sin add-ons). */
    baseClp: number
    /** Add-ons facturables que componen el próximo cobro (incluye el recién activado). */
    addonLines: ReceiptAddonLine[]
    /** Total del próximo cobro = base + Σ add-ons. */
    totalClp: number
    /** Monto del one-shot prorrateado cobrado de inmediato (solo trim/anual). null en mensual. */
    oneShotClp: number | null
    /** Fecha del próximo corte (formateada, es-CL). null si aún no se conoce. */
    nextChargeDate: string | null
    /** Texto íntegro de las 5 reglas aceptadas, en la variante del ciclo. */
    acceptedRules: AcceptedRule[]
    /** Versión de los términos aceptados (trazabilidad). */
    termsVersion: string
    subscriptionUrl: string
}

export function buildAddonActivationReceiptEmail(ctx: AddonActivationReceiptContext) {
    const subject = `Activaste ${ctx.addonLabel} en EVA — recibo`

    const addonRows = ctx.addonLines
        .map(
            (line) => `
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#374151;">${line.label}</td>
          <td style="padding:6px 0;font-size:13px;color:#111827;text-align:right;font-weight:600;">${CLP(line.cycleAmountClp)}</td>
        </tr>`
        )
        .join('')

    const oneShotBlock = ctx.oneShotClp
        ? `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;">
  <tr>
    <td>
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#065f46;letter-spacing:0.5px;text-transform:uppercase;">Cobro inmediato (prorrateo)</p>
      <p style="margin:0 0 6px;font-size:18px;font-weight:800;color:#065f46;">${CLP(ctx.oneShotClp)}</p>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">
        Pago único por la fracción que resta de tu ciclo actual. Desde tu próxima renovación, el módulo se suma a tu cobro habitual.
      </p>
    </td>
  </tr>
</table>`
        : ''

    const nextChargeLine = ctx.nextChargeDate
        ? `<p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Próximo cobro: <strong style="color:#111827;">${ctx.nextChargeDate}</strong></p>`
        : ''

    const rulesItems = ctx.acceptedRules
        .map(
            (r) => `
        <li style="margin:0 0 10px;font-size:13px;color:#374151;line-height:1.6;">
          <strong style="color:#111827;">${r.number}. ${r.title}.</strong> ${r.text}
        </li>`
        )
        .join('')

    const body = `
${badge('ADD-ON ACTIVADO', '#10B981')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ${ctx.coachName}, activaste ${ctx.addonLabel}
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
  Gracias por sumar <strong>${ctx.addonLabel}</strong> a tu cuenta EVA. Acá tenés el detalle de tu nuevo cobro.
</p>

${oneShotBlock}

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
  <tr>
    <td>
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#6b7280;letter-spacing:0.8px;text-transform:uppercase;">Tu próximo cobro (${ctx.cycleLabel})</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#374151;">Plan base</td>
          <td style="padding:6px 0;font-size:13px;color:#111827;text-align:right;font-weight:600;">${CLP(ctx.baseClp)}</td>
        </tr>
        ${addonRows}
        <tr>
          <td colspan="2" style="padding:4px 0;"><div style="border-top:1px solid #e5e7eb;"></div></td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:800;">Total</td>
          <td style="padding:6px 0;font-size:14px;color:#111827;text-align:right;font-weight:800;">${CLP(ctx.totalClp)}</td>
        </tr>
      </table>
      ${nextChargeLine}
    </td>
  </tr>
</table>

<div style="margin-bottom:24px;">
  ${ctaButton('Ver mi suscripción →', ctx.subscriptionUrl)}
</div>

${divider()}

<p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#6b7280;letter-spacing:0.8px;text-transform:uppercase;">Condiciones que aceptaste (versión ${ctx.termsVersion})</p>
<ul style="margin:0;padding-left:18px;">
  ${rulesItems}
</ul>

<p style="margin:20px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Podés cancelar el módulo cuando quieras desde tu panel de suscripción. Si tenés dudas, respondé este correo.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Recibo: activaste ${ctx.addonLabel}. Tu próximo cobro es ${CLP(ctx.totalClp)}.`,
        headerTitle: 'Recibo de add-on — EVA',
    })

    return { subject, html }
}

export type AddonCancellationReceiptContext = {
    coachName: string
    addonLabel: string
    /**
     * Fecha efectiva del término (formateada, es-CL). `null` cuando aún no se conoce
     * (compromiso mínimo mensual: la baja se programa recién tras el primer cobro).
     */
    effectiveDate: string | null
    subscriptionUrl: string
}

export function buildAddonCancellationReceiptEmail(ctx: AddonCancellationReceiptContext) {
    const subject = `Cancelaste ${ctx.addonLabel} en EVA`

    const effectiveLine = ctx.effectiveDate
        ? `Tu acceso a <strong>${ctx.addonLabel}</strong> sigue activo hasta el <strong>${ctx.effectiveDate}</strong>, fin del período que ya pagaste. Después de esa fecha el módulo se desactiva.`
        : `Solicitaste cancelar <strong>${ctx.addonLabel}</strong>. Como aún no se cumple tu compromiso mínimo de un ciclo, tu próximo cobro incluirá el módulo y recién después se programa su término. Te avisaremos la fecha efectiva.`

    const body = `
${badge('ADD-ON CANCELADO', '#6b7280')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ${ctx.coachName}, registramos tu cancelación
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
  ${effectiveLine}
</p>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;">
  <tr>
    <td>
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
        No hay reembolsos por fracciones no usadas: conservas el acceso hasta el final del período ya pagado.
      </p>
    </td>
  </tr>
</table>

<div style="margin-bottom:0;">
  ${ctaButton('Ver mi suscripción →', ctx.subscriptionUrl)}
</div>

<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Si cancelaste por error, podés volver a activar el módulo desde tu panel. Si tenés dudas, respondé este correo.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Cancelaste ${ctx.addonLabel}${ctx.effectiveDate ? `. Acceso hasta el ${ctx.effectiveDate}.` : '.'}`,
        headerTitle: 'Cancelación de add-on — EVA',
    })

    return { subject, html }
}
