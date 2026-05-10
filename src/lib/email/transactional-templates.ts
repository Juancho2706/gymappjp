import { wrapEmailLayout, ctaButton, divider, featureRow, badge } from './base-layout'

// ── Client Welcome ──────────────────────────────────────────────────────────

type WelcomeClientContext = {
    brandName: string
    coachName: string
    clientName: string
    loginUrl: string
    tempPassword: string
    welcomeMessage?: string | null
}

export function buildClientWelcomeEmail(ctx: WelcomeClientContext) {
    const subject = `Bienvenido/a a ${ctx.brandName} — tus datos de acceso`

    const welcomeLine = ctx.welcomeMessage?.trim()
        ? `<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;font-style:italic;">"${ctx.welcomeMessage.trim()}"</p>`
        : ''

    const body = `
<h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  Hola ${ctx.clientName} 👋
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
  Tu coach <strong>${ctx.coachName}</strong> te dio acceso a <strong>${ctx.brandName}</strong>. Ya podés ingresar y empezar a entrenar.
</p>

${welcomeLine}

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
  <tr>
    <td>
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#6b7280;letter-spacing:0.8px;text-transform:uppercase;">Tus datos de acceso</p>
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#6b7280;width:110px;">Usuario</td>
          <td style="padding:4px 0;font-size:13px;font-weight:600;color:#111827;">Este correo electrónico</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#6b7280;">Contraseña</td>
          <td style="padding:4px 0;font-size:15px;font-weight:800;color:#111827;font-family:monospace;letter-spacing:1px;">${ctx.tempPassword}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<div style="margin-bottom:24px;">
  ${ctaButton('Entrar a mi cuenta →', ctx.loginUrl)}
</div>

<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Te recomendamos cambiar la contraseña la primera vez que inicies sesión. Si tenés algún problema, respondé este correo.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Bienvenido/a a ${ctx.brandName}. Tu coach ${ctx.coachName} te espera.`,
        headerTitle: `Bienvenido/a a ${ctx.brandName}`,
    })

    return { subject, html }
}

// ── Program Assigned ─────────────────────────────────────────────────────────

type ProgramAssignedContext = {
    brandName: string
    clientName: string
    programName: string
    startDate: string
    dashboardUrl: string
}

export function buildProgramAssignedEmail(ctx: ProgramAssignedContext) {
    const subject = `Nuevo programa: ${ctx.programName}`

    const body = `
<p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#10B981;letter-spacing:0.8px;text-transform:uppercase;">Nuevo programa asignado</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ${ctx.clientName}, ya tenés programa
</h1>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
  Tu coach en <strong>${ctx.brandName}</strong> te asignó un nuevo plan de entrenamiento. Revisálo en tu panel y empezá cuando quieras.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;">
  <tr>
    <td>
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#6b7280;width:80px;">Programa</td>
          <td style="padding:4px 0;font-size:14px;font-weight:700;color:#111827;">${ctx.programName}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#6b7280;">Inicio</td>
          <td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;">${ctx.startDate}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<div style="margin-bottom:20px;">
  ${ctaButton('Ver mi programa →', ctx.dashboardUrl)}
</div>

<p style="margin:0;font-size:12px;color:#9ca3af;">
  Abrí tu panel para revisar rutinas, bloques y registrar tu primera sesión.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Tu coach te asignó "${ctx.programName}". ¡Entrá a verlo!`,
        headerTitle: `Nuevo programa — ${ctx.brandName}`,
    })

    return { subject, html }
}

// ── Free Coach Welcome ────────────────────────────────────────────────────────

type FreeCoachWelcomeContext = {
    coachName: string
    brandName: string
    dashboardUrl: string
    clientsUrl: string
    subscriptionUrl: string
}

export function buildFreeCoachWelcomeEmail(ctx: FreeCoachWelcomeContext) {
    const subject = `Bienvenido a EVA — tu cuenta ya está activa`

    const body = `
<p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#10B981;letter-spacing:0.8px;text-transform:uppercase;">Plan gratuito activado</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  Hola ${ctx.coachName}, bienvenido/a a EVA 🎉
</h1>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
  Tu espacio de coaching para <strong>${ctx.brandName}</strong> ya está listo. Empezá con hasta <strong>3 alumnos</strong> sin costo — sin tarjeta, sin fecha de vencimiento.
</p>

${featureRow('👥', 'Agregá tu primer alumno', 'Creá el perfil, asignale una rutina y activá el flujo completo de coaching.')}
${featureRow('💪', 'Construí programas de entrenamiento', 'Constructor visual con GIFs de ejercicios. Sin límite de programas.')}
${featureRow('📊', 'Check-in y progreso', 'Tus alumnos reportan su semana; vos ves la evolución en tiempo real.')}

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0;background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
  <tr>
    <td>
      <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
        <strong>¿Querés crecer más allá de 3 alumnos?</strong> Cuando llegues al límite, upgradear a Starter tarda menos de 2 minutos y activa branding propio y hasta 10 alumnos.
      </p>
    </td>
  </tr>
</table>

<div style="margin-bottom:12px;">
  ${ctaButton('Ir a mi dashboard →', ctx.dashboardUrl)}
</div>

<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Si tenés dudas o querés que te demos una mano arrancando, respondé este correo y con gusto te ayudamos.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Tu cuenta EVA está lista. Empezá con hasta 3 alumnos gratis.`,
        headerTitle: 'Bienvenido a EVA',
    })

    return { subject, html }
}

// ── Upgrade Required (client limit hit) ──────────────────────────────────────

type UpgradeRequiredContext = {
    coachName: string
    brandName: string
    currentLimit: number
    subscriptionUrl: string
}

export function buildUpgradeRequiredEmail(ctx: UpgradeRequiredContext) {
    const subject = `Alcanzaste el límite de ${ctx.currentLimit} alumnos — expandí tu plan`

    const body = `
<p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#f59e0b;letter-spacing:0.8px;text-transform:uppercase;">Límite de alumnos alcanzado</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ${ctx.coachName}, tu negocio está creciendo 🚀
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
  Alcanzaste el límite de <strong>${ctx.currentLimit} alumnos</strong> de tu plan actual. Para seguir agregando clientes, pasá al siguiente nivel.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
  <tr>
    <td style="padding:12px 16px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px 10px 0 0;border-bottom:none;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#111827;">Starter — $19.990/mes</p>
      <p style="margin:0;font-size:13px;color:#6b7280;">Hasta 10 alumnos · Branding propio · Mensual o anual</p>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 16px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 10px 10px;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#111827;">Pro — $29.990/mes</p>
      <p style="margin:0;font-size:13px;color:#6b7280;">Hasta 30 alumnos · Nutrición completa · Mensual o anual</p>
    </td>
  </tr>
</table>

<div style="margin-bottom:20px;">
  ${ctaButton('Ver planes y mejorar →', ctx.subscriptionUrl)}
</div>

<p style="margin:0;font-size:12px;color:#9ca3af;">
  El cambio es inmediato. Podés pausar o cancelar cuando quieras.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Llegaste al límite de ${ctx.currentLimit} alumnos en EVA. Expandí tu plan en 2 minutos.`,
        headerTitle: 'Expandí tu plan — EVA',
    })

    return { subject, html }
}

// ── Existing Coach Announcement ───────────────────────────────────────────────

type ExistingCoachAnnouncementContext = {
    coachName: string
    currentTier: string
    subscriptionUrl: string
}

export function buildExistingCoachAnnouncementEmail(ctx: ExistingCoachAnnouncementContext) {
    const subject = `Novedades en EVA — billing anual, nuevo plan Growth y plan Free`

    const isStarterOrPro = ctx.currentTier === 'starter' || ctx.currentTier === 'pro'
    const isElite = ctx.currentTier === 'elite'

    const annualCallout = isStarterOrPro ? `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;">
  <tr>
    <td>
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#065f46;">💡 Novedad para tu plan</p>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">
        Ahora podés cambiar a <strong>billing anual y ahorrar un 20%</strong>. Tu plan ${ctx.currentTier === 'starter' ? 'Starter pasaría de $19.990/mes a $15.992/mes' : 'Pro pasaría de $29.990/mes a $23.992/mes'} — cobrado una vez al año. Si preferís seguir mensual, no cambia nada.
      </p>
    </td>
  </tr>
</table>` : ''

    const growthCallout = isElite ? `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;background-color:#ecfdf5;border:1px solid #6ee7b7;border-radius:10px;padding:16px;">
  <tr>
    <td>
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#065f46;">🆕 Nuevo plan Growth para vos</p>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">
        Si estás cerca del límite de 60 alumnos, ahora hay un plan <strong>Growth ($84.990/mes, 120 alumnos)</strong> entre Elite y Scale. El salto que faltaba.
      </p>
    </td>
  </tr>
</table>` : ''

    const body = `
${badge('Novedades · Mayo 2026')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  Hola ${ctx.coachName}, hay novedades en EVA
</h1>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
  Escuchamos feedback y lanzamos 3 cosas que estaban pendientes.
</p>

${annualCallout}
${growthCallout}

${featureRow('🆓', 'Plan Free permanente', 'Ahora los coaches pueden empezar gratis con 3 alumnos, sin tarjeta. Ideal para recomendar a colegas que quieran probar EVA.')}
${featureRow('📈', 'Nuevo tier Growth — $84.990/mes', '120 alumnos. El plan que faltaba entre Elite (60) y Scale (500).')}
${featureRow('📅', 'Billing anual en Starter y Pro', 'Ahorraá un 20% comprometiéndote anualmente. Sin costos extra de cancelación.')}

${divider()}

<div style="margin-bottom:12px;">
  ${ctaButton('Ver mis opciones de plan →', ctx.subscriptionUrl)}
</div>
<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Si no querés cambiar nada, no tenés que hacer nada. Tu plan actual sigue igual.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Billing anual (−20%), plan Growth y plan Free permanente ya están disponibles en EVA.`,
        headerTitle: 'Novedades — EVA',
    })

    return { subject, html }
}
