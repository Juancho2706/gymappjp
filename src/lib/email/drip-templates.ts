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

    return [
        {
            key: 'day1_welcome',
            day: 1,
            subject: 'Bienvenido a EVA - activa tu cuenta hoy',
            html: `
                <h2>Hola ${coach}, bienvenido a EVA</h2>
                <p>Tu espacio de coaching para <strong>${brand}</strong> ya esta listo.</p>
                <p>Primer objetivo: entrar al panel y crear tu primer alumno.</p>
                <p><a href="${dashboard}">Ir al dashboard</a></p>
            `,
        },
        {
            key: 'day3_clients',
            day: 3,
            subject: 'Dia 3: crea y activa a tu primer alumno',
            html: `
                <h2>Vamos por tu primer alumno activo</h2>
                <p>Crear el primer alumno desbloquea todo el flujo de adherencia.</p>
                <p><a href="${clients}">Registrar alumno</a></p>
                <p>Tip: asigna una rutina el mismo dia para aumentar activacion.</p>
            `,
        },
        {
            key: 'day7_nutrition',
            day: 7,
            subject: 'Dia 7: suma nutricion y seguimiento',
            html: `
                <h2>Escala resultados con nutricion + check-ins</h2>
                <p>Con planes de nutricion y check-ins semanales mejoras retencion temprano.</p>
                <p><a href="${nutrition}">Configurar nutricion</a></p>
                <p><a href="${plans}">Revisar planes de entrenamiento</a></p>
            `,
        },
        {
            key: 'day14_upgrade',
            day: 14,
            subject: 'Dia 14: optimiza tu plan para crecer',
            html: `
                <h2>Dos semanas de avance: siguiente nivel</h2>
                <p>Revisa tu limite de alumnos y escala tu plan cuando lo necesites.</p>
                <p><a href="${subscription}">Gestionar suscripcion</a></p>
            `,
        },
    ]
}
