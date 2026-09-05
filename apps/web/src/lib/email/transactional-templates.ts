import { TIER_CONFIG, studentCountLabel } from '@eva/tiers'
import { wrapEmailLayout, ctaButton, ghostButton, divider, featureRow, badge, brandCtaColors } from './base-layout'

// ── Client Welcome ──────────────────────────────────────────────────────────

type WelcomeClientContext = {
    brandName: string
    coachName: string
    clientName: string
    loginUrl: string
    tempPassword: string
    welcomeMessage?: string | null
    /** White-label (W2): logo/color del coach para el header + CTA. Standalone con tier válido. */
    logoUrl?: string | null
    primaryColor?: string | null
    /** Pricing v3: sello «Hecho con EVA» en el footer (free/starter standalone). */
    showsEvaBadge?: boolean
    /**
     * Correo del coach (W2.6, flujo-coach-nuevo). Con él, el `reply_to` del envío apunta al coach
     * y la línea «responde este correo» deja de mentir: hoy la respuesta del alumno llega a EVA,
     * que no puede ayudarlo (SPEC §1.2 H5, callejón 14).
     */
    coachEmail?: string | null
}

/**
 * Bienvenida del alumno: **acceso arriba, clave abajo** (W2.6).
 *
 * El orden importa: el alumno abre esto en el teléfono, con la clave que ya le llegó por WhatsApp.
 * Lo primero que tiene que ver es el botón que lo mete a su app; la clave queda debajo, para el que
 * la necesite. Hasta el 26-08 el bloque de credenciales iba primero y el CTA quedaba bajo el pliegue.
 *
 * Devuelve `replyTo` junto al HTML: quien envía no tiene que acordarse de armarlo aparte
 * (`send-email.ts:27` lo soporta desde siempre y ningún call site lo pasaba).
 */
export function buildClientWelcomeEmail(ctx: WelcomeClientContext) {
    const subject = `Bienvenido/a a ${ctx.brandName} — tus datos de acceso`
    const cta = brandCtaColors(ctx.primaryColor)
    const replyTo = ctx.coachEmail?.trim() || undefined

    const welcomeLine = ctx.welcomeMessage?.trim()
        ? `<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;font-style:italic;">"${ctx.welcomeMessage.trim()}"</p>`
        : ''

    const body = `
<h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  Hola ${ctx.clientName} 👋
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
  Tu coach <strong>${ctx.coachName}</strong> te dio acceso a <strong>${ctx.brandName}</strong>. Ya puedes ingresar y empezar a entrenar.
</p>

${welcomeLine}

<div style="margin-bottom:24px;">
  ${ctaButton('Entrar a mi cuenta →', ctx.loginUrl, cta.bg, cta.text)}
</div>

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

<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Te recomendamos cambiar la contraseña la primera vez que inicies sesión. ${
      replyTo
          ? `Si tienes alguna duda, responde este correo y le llega a ${ctx.coachName}.`
          : 'Si tienes algún problema, responde este correo.'
  }
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Bienvenido/a a ${ctx.brandName}. Tu coach ${ctx.coachName} te espera.`,
        headerTitle: `Bienvenido/a a ${ctx.brandName}`,
        brand: { brandName: ctx.brandName, logoUrl: ctx.logoUrl, primaryColor: ctx.primaryColor, showsEvaBadge: ctx.showsEvaBadge },
    })

    return { subject, html, replyTo }
}

// ── Program Assigned ─────────────────────────────────────────────────────────

/**
 * R20 («Ciclo real y por lado»): con «Inicio flexible» el programa nace sin `start_date` — la pone
 * el alumno al empezar. La fila «Inicio» no puede quedar vacía ni decir «null».
 */
export const PROGRAM_START_WHENEVER_LABEL = 'Empieza cuando quieras'

type ProgramAssignedContext = {
    brandName: string
    clientName: string
    programName: string
    /** `null` = programa flexible que el alumno todavía no empezó (R20). */
    startDate: string | null
    dashboardUrl: string
    /** White-label (W2): logo/color del coach para el header + CTA. Standalone con tier válido. */
    logoUrl?: string | null
    primaryColor?: string | null
    /** Pricing v3: sello «Hecho con EVA» en el footer (free/starter standalone). */
    showsEvaBadge?: boolean
}

export function buildProgramAssignedEmail(ctx: ProgramAssignedContext) {
    const subject = `Nuevo programa: ${ctx.programName}`
    const cta = brandCtaColors(ctx.primaryColor)

    const body = `
<p style="margin:0 0 4px;font-size:12px;font-weight:700;color:${cta.bg};letter-spacing:0.8px;text-transform:uppercase;">Nuevo programa asignado</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ${ctx.clientName}, ya tienes programa
</h1>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
  Tu coach en <strong>${ctx.brandName}</strong> te asignó un nuevo plan de entrenamiento. Revísalo en tu panel y empieza cuando quieras.
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
          <td style="padding:4px 0;font-size:14px;font-weight:600;color:#111827;">${ctx.startDate ?? PROGRAM_START_WHENEVER_LABEL}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<div style="margin-bottom:20px;">
  ${ctaButton('Ver mi programa →', ctx.dashboardUrl, cta.bg, cta.text)}
</div>

<p style="margin:0;font-size:12px;color:#9ca3af;">
  Abre tu panel para revisar rutinas, bloques y registrar tu primera sesión.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Tu coach te asignó "${ctx.programName}". ¡Entra a verlo!`,
        headerTitle: `Nuevo programa — ${ctx.brandName}`,
        brand: { brandName: ctx.brandName, logoUrl: ctx.logoUrl, primaryColor: ctx.primaryColor, showsEvaBadge: ctx.showsEvaBadge },
    })

    return { subject, html }
}

// ── Coach signup email confirmation (free tier) ─────────────────────────────

type CoachEmailConfirmationContext = {
    coachName: string
    confirmUrl: string
}

export function buildCoachEmailConfirmationEmail(ctx: CoachEmailConfirmationContext) {
    const subject = 'Confirma tu correo para activar tu cuenta EVA'

    const body = `
<h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  Hola ${ctx.coachName}, confirma tu email
</h1>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
  Para activar tu cuenta gratuita de coach en EVA, haz click en el botón de abajo. El enlace vence en 24 horas.
</p>
<div style="margin-bottom:24px;">
  ${ctaButton('Confirmar mi correo →', ctx.confirmUrl)}
</div>
<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Si no creaste esta cuenta, ignora este mensaje. ¿No ves el botón? Copia este enlace en el navegador:<br />
  <a href="${ctx.confirmUrl}" style="color:#10B981;word-break:break-all;">${ctx.confirmUrl}</a>
</p>`

    const html = wrapEmailLayout(body, {
        previewText: 'Confirma tu correo para activar tu plan gratuito en EVA.',
        headerTitle: 'Confirma tu cuenta',
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
  Tu espacio de coaching para <strong>${ctx.brandName}</strong> ya está listo. Empieza con el <strong>plan gratuito</strong> — sin tarjeta, sin fecha de vencimiento.
</p>

${featureRow('👥', 'Agrega tu primer alumno', 'Crea el perfil, asígnale una rutina y activa el flujo completo de coaching.')}
${featureRow('💪', 'Construye programas de entrenamiento', 'Constructor visual con GIFs de ejercicios. Sin límite de programas.')}
${featureRow('📊', 'Check-in y progreso', 'Tus alumnos reportan su semana; tú ves la evolución en tiempo real.')}

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0;background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;">
  <tr>
    <td>
      <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
        <strong>¿Quieres crecer sin techo?</strong> Cuando llegues al límite de alumnos, <strong>Pro</strong> te sube el cupo a ${studentCountLabel(TIER_CONFIG.pro.maxClients)} y te saca el sello «Hecho con EVA» de lo que ve tu alumno.
      </p>
    </td>
  </tr>
</table>

<div style="margin-bottom:20px;">
  ${ctaButton('Ir a mi guía →', ctx.dashboardUrl)}
</div>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;">
  <tr>
    <td>
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#111827;">Cómo funciona EVA</p>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">
        Tu cuenta, tu plan y tu facturación se administran desde
        <a href="${ctx.subscriptionUrl}" target="_blank" style="color:#10B981;font-weight:600;text-decoration:none;">eva-app.cl</a>
        con tu mismo correo y contraseña. Desde la app del teléfono ves tu estado; los cambios de plan
        se hacen en la web.
      </p>
    </td>
  </tr>
</table>

<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Si tienes dudas o quieres que te demos una mano arrancando, responde este correo y con gusto te ayudamos.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Tu cuenta EVA está lista. Empieza gratis con tu primer alumno.`,
        headerTitle: 'Bienvenido a EVA',
    })

    return { subject, html }
}

// ── Existing Coach Announcement ───────────────────────────────────────────────

/**
 * W4.7 («Ciclo real y por lado»): copy canónico del acceso del alumno. Play sigue en closed testing
 * y la entrada real es el navegador (o la app de iOS), así que ninguna superficie del coach vuelve a
 * decir «baja EVA» ni a pedirle al alumno que instale algo.
 */
export const STUDENT_ACCESS_NO_INSTALL_LABEL =
    'Tu alumno entra desde el navegador con tu link o desde la app en iOS. No necesita instalar nada.'

type ExistingCoachAnnouncementContext = {
    coachName: string
    currentTier: string
    subscriptionUrl: string
}

export function buildExistingCoachAnnouncementEmail(ctx: ExistingCoachAnnouncementContext) {
    const subject = `📱 EVA pronto en las tiendas (iOS y Android) + mejoras en curso`

    const body = `
${badge('Anuncio · Junio 2026')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  Hola ${ctx.coachName}, se viene la app de EVA 🚀
</h1>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
  Te escribimos para contarte dos cosas:
</p>

${featureRow('📱', 'Tu alumno no necesita instalar nada', `${STUDENT_ACCESS_NO_INSTALL_LABEL} La app de Android está en camino.`)}
${featureRow('🛠️', 'Mejoras estructurales en curso', 'Durante estos días vas a notar algunos cambios internos mientras dejamos todo listo para el lanzamiento. Tu cuenta, tus alumnos y tus datos están seguros y todo sigue operativo.')}

${divider()}

<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
  Te pedimos disculpas por cualquier molestia durante la transición y un poco de paciencia. Si algo no funciona como esperas o tienes dudas, escríbenos — te respondemos rápido.
</p>
<div style="margin-bottom:12px;">
  ${ctaButton('Escribir a contacto@eva-app.cl →', 'mailto:contacto@eva-app.cl')}
</div>
<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Gracias por construir EVA con nosotros. 💪
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `EVA pronto en iOS y Android. Estamos mejorando todo para el lanzamiento — gracias por tu paciencia.`,
        headerTitle: 'Anuncio — EVA',
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
${featureRow('🥗', 'Planes de nutrición', 'Diseña y asigna planes alimentarios (Pro y superiores)')}

<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Estás recibiendo este correo porque tienes un período de prueba activo en EVA.
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
        Reactiva en cualquier momento y continúas exactamente donde lo dejaste. Nada se pierde.
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
    /** White-label (W2): logo/color del coach para el header + CTA. Standalone con tier válido. */
    logoUrl?: string | null
    primaryColor?: string | null
    /** Pricing v3: sello «Hecho con EVA» en el footer (free/starter standalone). */
    showsEvaBadge?: boolean
}

export function buildClientArchivedEmail(ctx: ClientArchivedContext) {
    const subject = `Tu acceso a ${ctx.coachBrandName} ha sido suspendido temporalmente`
    const cta = brandCtaColors(ctx.primaryColor)

    const contactCta = ctx.coachEmail
        ? ctaButton(`Contactar a ${ctx.coachName}`, `mailto:${ctx.coachEmail}`, cta.bg, cta.text)
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
        Si tienes dudas o quieres saber cuándo se reactiva tu acceso, contacta a tu entrenador directamente.
      </p>
    </td>
  </tr>
</table>

<div style="margin-bottom:0;">
  ${contactCta}
</div>

<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Estás recibiendo este correo porque eres alumno registrado en ${ctx.coachBrandName}.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Tu acceso a ${ctx.coachBrandName} ha sido suspendido temporalmente por tu entrenador.`,
        headerTitle: ctx.coachBrandName,
        brand: { brandName: ctx.coachBrandName, logoUrl: ctx.logoUrl, primaryColor: ctx.primaryColor, showsEvaBadge: ctx.showsEvaBadge },
    })

    return { subject, html }
}

// ── Client Unarchived (access restored) ──────────────────────────────────────

type ClientUnarchivedContext = {
    clientName: string
    coachBrandName: string
    coachName: string
    loginUrl: string
    /** White-label (W2): logo/color del coach para el header + CTA. Standalone con tier válido. */
    logoUrl?: string | null
    primaryColor?: string | null
    /** Pricing v3: sello «Hecho con EVA» en el footer (free/starter standalone). */
    showsEvaBadge?: boolean
}

export function buildClientUnarchivedEmail(ctx: ClientUnarchivedContext) {
    const subject = `Tu acceso a ${ctx.coachBrandName} fue restaurado`
    const cta = brandCtaColors(ctx.primaryColor)

    const body = `
${badge('ACCESO RESTAURADO', '#10B981')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ¡Tu acceso fue restaurado!
</h1>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
  Hola <strong>${ctx.clientName}</strong>, tu entrenador en <strong>${ctx.coachBrandName}</strong> reactivó tu acceso. Ya puedes ingresar y retomar tus entrenamientos exactamente donde los dejaste.
</p>

<div style="margin-bottom:0;">
  ${ctaButton('Entrar a mi cuenta →', ctx.loginUrl, cta.bg, cta.text)}
</div>

<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
  Estás recibiendo este correo porque tu entrenador ${ctx.coachName} restauró tu acceso en ${ctx.coachBrandName}.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: `Tu acceso a ${ctx.coachBrandName} fue restaurado. Ya puedes entrar.`,
        headerTitle: ctx.coachBrandName,
        brand: { brandName: ctx.coachBrandName, logoUrl: ctx.logoUrl, primaryColor: ctx.primaryColor, showsEvaBadge: ctx.showsEvaBadge },
    })

    return { subject, html }
}

// ── Beta Trial Ended → Free ──────────────────────────────────────────────────

export function buildBetaTrialEndedFreeEmail(ctx: { coachName: string; appUrl: string }) {
    const subject = 'Tu período de prueba EVA terminó — ahora estás en el plan gratuito'

    const body = `
${badge('PLAN GRATUITO ACTIVADO', '#6B7280')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  Tu prueba terminó, pero sigues con EVA
</h1>
<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
  Hola <strong>${ctx.coachName}</strong>, tu período de acceso Beta finalizó. Tu cuenta fue movida automáticamente al <strong>Plan Gratuito</strong>.
</p>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
  <!-- Este "3" es DELIBERADO, no drift de Pricing v2: el correo va solo a coaches Beta, todos
       anteriores al corte del 2026-08-18, y el grandfather les conserva el cupo viejo de 3
       (tierMaxClientsFor). Los coaches nuevos ven 2 en las demás superficies. -->
  Con el plan gratuito puedes gestionar hasta <strong>3 alumnos activos</strong>. Cuando estés listo para crecer, puedes activar un plan pago desde el dashboard.
</p>

<div style="margin-bottom:24px;">
  ${ctaButton('Ir a mi dashboard →', `${ctx.appUrl}/coach`)}
</div>

${divider()}

<p style="margin:16px 0 0;font-size:13px;color:#6B7280;line-height:1.6;">
  ¿Tienes preguntas? Responde este email y te ayudamos.
</p>`

    const html = wrapEmailLayout(body, {
        previewText: 'Tu período beta terminó — tu cuenta pasó al plan gratuito. Sigues teniendo acceso.',
        headerTitle: 'EVA — Plataforma para Coaches',
    })

    return { subject, html }
}
