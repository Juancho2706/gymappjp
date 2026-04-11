type WelcomeClientContext = {
    brandName: string
    coachName: string
    clientName: string
    loginUrl: string
    tempPassword: string
    welcomeMessage?: string | null
}

type ProgramAssignedContext = {
    brandName: string
    clientName: string
    programName: string
    startDate: string
    dashboardUrl: string
}

export function buildClientWelcomeEmail(ctx: WelcomeClientContext) {
    const subject = `Bienvenido a ${ctx.brandName}`
    const welcomeLine = ctx.welcomeMessage?.trim()
        ? `<p style="margin:0 0 12px;">${ctx.welcomeMessage.trim()}</p>`
        : ''

    const html = `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
            <h2 style="margin:0 0 12px;">Hola ${ctx.clientName}, bienvenido/a a ${ctx.brandName}</h2>
            <p style="margin:0 0 12px;">Tu coach ${ctx.coachName} te dio acceso a tu panel.</p>
            ${welcomeLine}
            <p style="margin:0 0 8px;"><strong>Usuario:</strong> este correo</p>
            <p style="margin:0 0 12px;"><strong>Contrasena temporal:</strong> ${ctx.tempPassword}</p>
            <p style="margin:0 0 16px;">
                <a href="${ctx.loginUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;">
                    Entrar a mi cuenta
                </a>
            </p>
            <p style="margin:0;color:#6b7280;font-size:12px;">Te recomendamos cambiar la contrasena en tu primer ingreso.</p>
        </div>
    `

    return { subject, html }
}

export function buildProgramAssignedEmail(ctx: ProgramAssignedContext) {
    const subject = `Nuevo programa asignado: ${ctx.programName}`
    const html = `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
            <h2 style="margin:0 0 12px;">${ctx.clientName}, ya tienes nuevo programa en ${ctx.brandName}</h2>
            <p style="margin:0 0 8px;"><strong>Programa:</strong> ${ctx.programName}</p>
            <p style="margin:0 0 12px;"><strong>Inicio:</strong> ${ctx.startDate}</p>
            <p style="margin:0 0 16px;">
                <a href="${ctx.dashboardUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600;">
                    Ver mi dashboard
                </a>
            </p>
            <p style="margin:0;color:#6b7280;font-size:12px;">Abre tu panel para revisar rutina, bloques y registrar tu primera sesion.</p>
        </div>
    `

    return { subject, html }
}
