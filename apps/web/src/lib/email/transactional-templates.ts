import { wrapEmailLayout, ctaButton, ghostButton, divider, featureRow, badge } from './base-layout'

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

// ── Trial Expiry Warning ──────────────────────────────────────────────────────

type TrialExpiryWarningContext = {
    coachName: string
    brandName: string
    daysLeft: number
    activeClientCount: number
    recommendedTierLabel: string
    recommendedTierSlug: string
    recommendedMaxClients: number
    recommendedPriceClp: number
    reactivateUrl: string
}

export function buildTrialExpiryWarningEmail(ctx: TrialExpiryWarningContext) {
    const plural = ctx.daysLeft === 1 ? 'día' : 'días'
    const subject = `Tu período de prueba vence en ${ctx.daysLeft} ${plural} — EVA`

    const body = `
${badge('PERÍODO DE PRUEBA', '#F59E0B')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  Te quedan ${ctx.daysLeft} ${plural} de prueba
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
  Hola <strong>${ctx.coachName}</strong>, llevas un buen tiempo construyendo <strong>${ctx.brandName}</strong>. Cuando termine el período de prueba perderás acceso al dashboard y tus alumnos no podrán ingresar — pero activando tu plan todo sigue exactamente donde lo dejaste.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;">
  <tr>
    <td>
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#92400e;letter-spacing:0.8px;text-transform:uppercase;">Tu plan recomendado</p>
      <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#111827;">Plan ${ctx.recommendedTierLabel}</p>
      <p style="margin:0 0 8px;font-size:13px;color:#374151;">Hasta ${ctx.recommendedMaxClients} alumnos · $${ctx.recommendedPriceClp.toLocaleString('es-CL')}/mes</p>
      <p style="margin:0;font-size:13px;color:#92400e;">
        Con tus <strong>${ctx.activeClientCount} ${ctx.activeClientCount === 1 ? 'alumno' : 'alumnos'} activos</strong>, este es el plan mínimo que los cubre a todos.
      </p>
    </td>
  </tr>
</table>

<div style="margin-bottom:12px;">
  ${ctaButton(`Activar Plan ${ctx.recommendedTierLabel} →`, ctx.reactivateUrl)}
</div>
<div style="margin-bottom:24px;">
  ${ghostButton('Ver todos los planes', ctx.reactivateUrl)}
</div>

${divider()}

${featureRow('💪', 'Seguimiento de entrenamientos', 'Historial completo de sesiones de tus alumnos')}
${featureRow('📊', 'Panel de alumnos', 'Cada alumno con su progreso, fotos y check-ins')}
${featureRow('🥗', 'Planes de nutrición', 'Diseñá y asigná planes alimentarios (Pro y superiores)')}

<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Estás recibiendo este correo porque tenés un período de prueba activo en EVA.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Te quedan ${ctx.daysLeft} ${plural} de prueba — con ${ctx.activeClientCount} alumnos, ${ctx.recommendedTierLabel} es tu plan.`,
        headerTitle: 'Período de prueba — EVA',
    })

    return { subject, html }
}

// ── Trial Expired ─────────────────────────────────────────────────────────────

type TrialExpiredContext = {
    coachName: string
    brandName: string
    activeClientCount: number
    recommendedTierLabel: string
    recommendedTierSlug: string
    recommendedMaxClients: number
    recommendedPriceClp: number
    reactivateUrl: string
}

export function buildTrialExpiredEmail(ctx: TrialExpiredContext) {
    const subject = `Tu período de prueba en EVA ha terminado`

    const body = `
${badge('PERÍODO FINALIZADO', '#6b7280')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  Tu período de prueba ha terminado
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
  Hola <strong>${ctx.coachName}</strong>, todos tus datos y los de tus <strong>${ctx.activeClientCount} ${ctx.activeClientCount === 1 ? 'alumno' : 'alumnos'}</strong> están seguros y esperándote en <strong>${ctx.brandName}</strong>.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;">
  <tr>
    <td>
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#065f46;">Tus datos están seguros</p>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">
        Reactiva en cualquier momento y continuás exactamente donde lo dejaste. Nada se pierde.
      </p>
    </td>
  </tr>
</table>

<div style="margin-bottom:12px;">
  ${ctaButton('Reactivar mi cuenta →', ctx.reactivateUrl)}
</div>

${divider()}

<p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#111827;">¿Qué plan necesito?</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
  <tr>
    <td>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#6b7280;width:100px;">Plan</td>
          <td style="padding:4px 0;font-size:13px;font-weight:700;color:#111827;">Plan ${ctx.recommendedTierLabel}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#6b7280;">Capacidad</td>
          <td style="padding:4px 0;font-size:13px;font-weight:600;color:#111827;">Hasta ${ctx.recommendedMaxClients} alumnos</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#6b7280;">Precio</td>
          <td style="padding:4px 0;font-size:13px;font-weight:600;color:#111827;">$${ctx.recommendedPriceClp.toLocaleString('es-CL')}/mes</td>
        </tr>
      </table>
      <p style="margin:10px 0 0;font-size:12px;color:#6b7280;">Con tus ${ctx.activeClientCount} ${ctx.activeClientCount === 1 ? 'alumno' : 'alumnos'}, este es el plan mínimo recomendado.</p>
    </td>
  </tr>
</table>

<div style="margin-bottom:0;">
  ${ghostButton('Ver todos los planes', ctx.reactivateUrl)}
</div>

<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Estás recibiendo este correo porque tu período de prueba en EVA finalizó.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Tu período de prueba terminó. Tus datos están seguros — reactiva cuando quieras.`,
        headerTitle: 'Tu cuenta — EVA',
    })

    return { subject, html }
}

// ── Client Archived ───────────────────────────────────────────────────────────

type ClientArchivedContext = {
    clientName: string
    coachBrandName: string
    coachName: string
    coachEmail?: string | null
    coachPublicUrl: string
}

export function buildClientArchivedEmail(ctx: ClientArchivedContext) {
    const subject = `Tu acceso a ${ctx.coachBrandName} ha sido suspendido temporalmente`

    const contactCta = ctx.coachEmail
        ? ctaButton(`Contactar a ${ctx.coachName}`, `mailto:${ctx.coachEmail}`)
        : ghostButton(`Ver perfil de ${ctx.coachName}`, ctx.coachPublicUrl)

    const body = `
${badge('AVISO IMPORTANTE', '#F59E0B')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  Tu acceso está temporalmente suspendido
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
  Hola <strong>${ctx.clientName}</strong>, tu entrenador en <strong>${ctx.coachBrandName}</strong> actualizó su plan y temporalmente suspendió tu acceso. Tus datos de entrenamiento están completamente seguros.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;">
  <tr>
    <td>
      <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
        Si tenés dudas o querés saber cuándo se reactiva tu acceso, contactá a tu entrenador directamente.
      </p>
    </td>
  </tr>
</table>

<div style="margin-bottom:0;">
  ${contactCta}
</div>

<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Estás recibiendo este correo porque sos alumno registrado en ${ctx.coachBrandName}.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Tu acceso a ${ctx.coachBrandName} ha sido suspendido temporalmente por tu entrenador.`,
        headerTitle: ctx.coachBrandName,
    })

    return { subject, html }
}

// ── Client Unarchived (access restored) ──────────────────────────────────────

type ClientUnarchivedContext = {
    clientName: string
    coachBrandName: string
    coachName: string
    loginUrl: string
}

export function buildClientUnarchivedEmail(ctx: ClientUnarchivedContext) {
    const subject = `Tu acceso a ${ctx.coachBrandName} fue restaurado`

    const body = `
${badge('ACCESO RESTAURADO', '#10B981')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ¡Tu acceso fue restaurado!
</h1>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
  Hola <strong>${ctx.clientName}</strong>, tu entrenador en <strong>${ctx.coachBrandName}</strong> reactivó tu acceso. Ya podés ingresar y retomar tus entrenamientos exactamente donde los dejaste.
</p>

<div style="margin-bottom:0;">
  ${ctaButton('Entrar a mi cuenta →', ctx.loginUrl)}
</div>

<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Estás recibiendo este correo porque tu entrenador ${ctx.coachName} restauró tu acceso en ${ctx.coachBrandName}.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Tu acceso a ${ctx.coachBrandName} fue restaurado. Ya podés entrar.`,
        headerTitle: ctx.coachBrandName,
    })

    return { subject, html }
}

// ── Beta Trial Ended → Free ──────────────────────────────────────────────────

export function buildBetaTrialEndedFreeEmail(ctx: { coachName: string; appUrl: string }) {
    const subject = 'Tu período de prueba EVA terminó — ahora estás en el plan gratuito'

    const body = `
${badge('PLAN GRATUITO ACTIVADO', '#6B7280')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  Tu prueba terminó, pero seguís con EVA
</h1>
<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
  Hola <strong>${ctx.coachName}</strong>, tu período de acceso Beta finalizó. Tu cuenta fue movida automáticamente al <strong>Plan Gratuito</strong>.
</p>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
  Con el plan gratuito podés gestionar hasta <strong>3 alumnos activos</strong>. Cuando estés listo para crecer, podés activar un plan pago desde el dashboard.
</p>

<div style="margin-bottom:24px;">
  ${ctaButton('Ir a mi dashboard →', `${ctx.appUrl}/coach`)}
</div>

${divider()}

<p style="margin:16px 0 0;font-size:13px;color:#6B7280;line-height:1.6;">
  ¿Tenés preguntas? Respondé este email y te ayudamos.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: 'Tu período beta terminó — tu cuenta pasó al plan gratuito. Seguís teniendo acceso.',
        headerTitle: 'EVA — Plataforma para Coaches',
    })

    return { subject, html }
}
