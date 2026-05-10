import { wrapEmailLayout, ctaButton, divider, featureRow, badge } from './base-layout'

type DripTemplateContext = {
    coachName: string | null
    brandName: string | null
    baseUrl: string
}

export type DripTemplate = {
    key: 'day1_welcome' | 'day3_clients' | 'day7_nutrition' | 'day14_upgrade'
    day: 1 | 3 | 7 | 14
    subject: string
    html: string
}

function coachDisplayName(ctx: DripTemplateContext) {
    return ctx.coachName?.trim() || 'Coach'
}

function brandDisplayName(ctx: DripTemplateContext) {
    return ctx.brandName?.trim() || 'tu marca'
}

export function buildDripTemplates(ctx: DripTemplateContext): DripTemplate[] {
    const coach = coachDisplayName(ctx)
    const brand = brandDisplayName(ctx)
    const dashboard = `${ctx.baseUrl}/coach/dashboard`
    const clients = `${ctx.baseUrl}/coach/clients`
    const plans = `${ctx.baseUrl}/coach/workout-programs`
    const nutrition = `${ctx.baseUrl}/coach/nutrition-plans`
    const subscription = `${ctx.baseUrl}/coach/subscription`

    // ── Day 1: Welcome ───────────────────────────────────────────────────────
    const day1Body = `
${badge('Día 1 — Bienvenida')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  Hola ${coach}, tu cuenta EVA está lista ✨
</h1>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
  Creaste <strong>${brand}</strong> en EVA. Ahora el siguiente paso es simple: agregá tu primer alumno y asignale una rutina. Eso activa todo el flujo.
</p>

${featureRow('👥', 'Agregá tu primer alumno', 'Ve a "Alumnos" y creá el perfil con su correo y contraseña temporal.')}
${featureRow('💪', 'Asignale un programa', 'Construí una rutina o usá un programa existente y asignáselo.')}
${featureRow('📩', 'El alumno recibe un email', 'Con sus datos de acceso, entra y empieza a entrenar el mismo día.')}

${divider()}

<div style="margin-bottom:12px;">
  ${ctaButton('Ir al dashboard →', dashboard)}
</div>
<p style="margin:8px 0 0;font-size:13px;color:#6b7280;">
  ¿Dudas? Respondé este correo y te ayudamos en minutos.
</p>`

    // ── Day 3: First client ──────────────────────────────────────────────────
    const day3Body = `
${badge('Día 3 — Primer alumno')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ${coach}, ¿ya tenés tu primer alumno activo?
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
  Los coaches que activan su primer alumno en los primeros 3 días tienen <strong>5× más probabilidades</strong> de convertirse en usuarios activos del plan pago. Un alumno activo cambia todo — podés ver el flujo completo en acción.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;">
  <tr>
    <td>
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#065f46;">Lo que desbloquea un alumno activo:</p>
      <ul style="margin:0;padding-left:20px;font-size:13px;color:#374151;line-height:2;">
        <li>Dashboard con métricas reales de adherencia</li>
        <li>Historial de check-ins y progreso semanal</li>
        <li>Feed de actividad en tiempo real</li>
      </ul>
    </td>
  </tr>
</table>

<div style="margin-bottom:12px;">
  ${ctaButton('Crear primer alumno →', clients)}
</div>`

    // ── Day 7: Nutrition & check-ins ─────────────────────────────────────────
    const day7Body = `
${badge('Día 7 — Nutrición y retención')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  Semana 1 completada, ${coach} 🏆
</h1>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
  Los coaches que suman <strong>planes de nutrición y check-ins semanales</strong> en la primera semana retienen el doble de alumnos al mes. Acá te contamos por qué.
</p>

${featureRow('🥗', 'Planes de nutrición', 'Asigná macros, calorías y comidas. El alumno ve todo desde su app.')}
${featureRow('📋', 'Check-in semanal', 'El alumno reporta peso, energía, sueño. Vos ves la tendencia en el dashboard.')}
${featureRow('📈', 'Progreso visual', 'Gráficos de evolución que el alumno puede compartir. Fidelización natural.')}

${divider()}

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
  <tr>
    <td>
      <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
        <strong>Nutrición disponible desde Pro ($29.990/mes).</strong> Si estás en el plan Free o Starter, pasarte tarda 2 minutos y podés cancelar cuando quieras.
      </p>
    </td>
  </tr>
</table>

<div style="margin-bottom:12px;">
  ${ctaButton('Ver planes de nutrición →', nutrition)}
</div>`

    // ── Day 14: Upgrade ───────────────────────────────────────────────────────
    const day14Body = `
${badge('Día 14 — Siguiente nivel')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  Dos semanas con EVA, ${coach} 💪
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
  Ya pasaste la curva de aprendizaje. Ahora la pregunta es: ¿tu plan actual te da espacio para crecer?
</p>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
  <tr style="background-color:#f9fafb;">
    <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
      <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#111827;">Starter — $19.990/mes</p>
      <p style="margin:0;font-size:12px;color:#6b7280;">10 alumnos · Tu logo y colores · Mensual o anual (−20%)</p>
    </td>
  </tr>
  <tr style="background-color:#f9fafb;">
    <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
      <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#111827;">Pro — $29.990/mes</p>
      <p style="margin:0;font-size:12px;color:#6b7280;">30 alumnos · Nutrición · Mensual o anual (−20%)</p>
    </td>
  </tr>
  <tr style="background-color:#f0fdf4;">
    <td style="padding:12px 16px;">
      <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#065f46;">Elite — $44.990/mes</p>
      <p style="margin:0;font-size:12px;color:#6b7280;">60 alumnos · Todo incluido · Mensual / Trimestral / Anual</p>
    </td>
  </tr>
</table>

<div style="margin-bottom:12px;">
  ${ctaButton('Ver todos los planes →', subscription)}
</div>

<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Podés cambiar de plan en cualquier momento. Sin compromisos anuales obligatorios.
</p>`

    return [
        {
            key: 'day1_welcome',
            day: 1,
            subject: `Hola ${coach} — tu cuenta EVA está lista ✨`,
            html: wrapEmailLayout(day1Body, {
                previewText: `Agregá tu primer alumno hoy y activá el flujo completo de coaching.`,
                headerTitle: 'Bienvenido a EVA',
            }),
        },
        {
            key: 'day3_clients',
            day: 3,
            subject: `${coach}, ¿ya tenés tu primer alumno activo?`,
            html: wrapEmailLayout(day3Body, {
                previewText: `Los coaches que activan su primer alumno en 3 días tienen 5× más adherencia.`,
                headerTitle: 'Primer alumno — EVA',
            }),
        },
        {
            key: 'day7_nutrition',
            day: 7,
            subject: `Semana 1 completada — sumá nutrición y retención 🥗`,
            html: wrapEmailLayout(day7Body, {
                previewText: `Coaches con nutrición + check-ins retienen el doble de alumnos al mes.`,
                headerTitle: 'Nutrición y retención — EVA',
            }),
        },
        {
            key: 'day14_upgrade',
            day: 14,
            subject: `Dos semanas con EVA — ¿tu plan te da espacio para crecer?`,
            html: wrapEmailLayout(day14Body, {
                previewText: `Revisá tu plan y expandí a más alumnos cuando lo necesites.`,
                headerTitle: 'Siguiente nivel — EVA',
            }),
        },
    ]
}
