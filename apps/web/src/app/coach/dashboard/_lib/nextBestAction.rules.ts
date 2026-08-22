import type { Persona } from '@eva/schemas'
import type { DashboardV2Data } from '../_data/types'

export interface NextBestAction {
    id: string
    title: string
    description: string
    ctaLabel: string
    ctaHref: string
    tone: 'info' | 'warn' | 'positive'
}

/**
 * «Tu próximo paso» del dashboard.
 *
 * Dos correcciones de onboarding v2 (SPEC §7):
 *  1. El panel VACÍO ya no cae en «Todo bajo control»: el coach nuevo no tiene nada bajo control,
 *     tiene un producto vacío. Se le nombra el siguiente paso de SU mundo (nutrición → pauta,
 *     rehabilitación → screening, resistencia → zonas, fuerza/otro → rutina).
 *  2. `/coach/programs` NO EXISTE (404). El destino real es `/coach/workout-programs`.
 */
export const WORKOUT_PROGRAMS_HREF = '/coach/workout-programs'

interface PersonaFirstStep {
    id: string
    title: string
    description: string
    ctaLabel: string
    ctaHref: string
}

/**
 * Primer paso por persona cuando el panel todavía está vacío. Las rutas por alumno
 * (`/coach/nutrition-v2/{id}/editor`, `/coach/movement/{id}`, `/coach/cardio/{id}`) necesitan un
 * alumno, así que acá se apunta al hub o al directorio, que sí existen sin datos.
 */
const PERSONA_FIRST_STEP: Record<Persona, PersonaFirstStep> = {
    strength: {
        id: 'primera-rutina',
        title: 'Arma tu primera rutina',
        description: 'Empieza desde una plantilla y ajusta lo que quieras.',
        ctaLabel: 'Ir al builder',
        ctaHref: WORKOUT_PROGRAMS_HREF,
    },
    nutrition: {
        id: 'primera-pauta',
        title: 'Arma tu primera pauta',
        description: 'Porciones e intercambios listos para ajustar y publicar.',
        ctaLabel: 'Ir a Nutrición',
        ctaHref: '/coach/nutrition-v2',
    },
    rehab: {
        id: 'primer-screening',
        title: 'Haz tu primer screening de movimiento',
        description: 'Siete patrones con semáforo; de ahí sale la pauta para la casa.',
        ctaLabel: 'Ver alumnos',
        ctaHref: '/coach/clients',
    },
    endurance: {
        id: 'primeras-zonas',
        title: 'Calcula las zonas de tu primer atleta',
        description: 'Con su FC de reposo y su marca de 5K salen las zonas y los ritmos.',
        ctaLabel: 'Ver alumnos',
        ctaHref: '/coach/clients',
    },
    other: {
        id: 'primer-plan',
        title: 'Arma tu primer plan',
        description: 'Empieza por donde te sirva: una rutina o una pauta de alimentación.',
        ctaLabel: 'Ir al builder',
        ctaHref: WORKOUT_PROGRAMS_HREF,
    },
}

/** Primer paso del coach sin alumnos, por persona. Puro: la UI no decide nada. */
export function personaFirstStep(persona: Persona | null): NextBestAction {
    const step = PERSONA_FIRST_STEP[persona ?? 'other']
    return { ...step, tone: 'info' }
}

export function resolveNextBestAction(
    data: DashboardV2Data,
    ctx?: { persona?: Persona | null }
): NextBestAction {
    const { kpi, topRiskClients, agenda, expiringPrograms } = data

    // Panel vacío = coach nuevo. Antes caía en «Todo bajo control», el mismo error que el dashboard
    // móvil que felicitaba («Todo al día, buen trabajo») a quien no había hecho nada todavía.
    if (kpi.totalClients === 0) {
        if (data.activePlans === 0) return personaFirstStep(ctx?.persona ?? null)
        return {
            id: 'primer-alumno',
            title: 'Invita a tu primer alumno',
            description: 'Le llega el link, entra con su correo y ve TU app.',
            ctaLabel: 'Sumar alumno',
            ctaHref: '/coach/clients?invite=1',
            tone: 'info',
        }
    }

    const overdueExpiring = expiringPrograms.filter((p) => p.daysLeft <= 0)
    if (overdueExpiring.length > 0) {
        return {
            id: 'programas-vencidos',
            title: `${overdueExpiring.length} programa${overdueExpiring.length === 1 ? '' : 's'} vencido${overdueExpiring.length === 1 ? '' : 's'}`,
            description: 'Renueva para que tus alumnos no pierdan continuidad.',
            ctaLabel: 'Revisar programas',
            // `/coach/programs` era un 404: la ruta real del panel es `/coach/workout-programs`.
            ctaHref: WORKOUT_PROGRAMS_HREF,
            tone: 'warn',
        }
    }

    if (topRiskClients.length >= 3) {
        return {
            id: 'focus-list',
            title: `${topRiskClients.length} alumnos en riesgo`,
            description: 'Prioriza a quienes estan sin check-in o sin ejercicio esta semana.',
            ctaLabel: 'Ver focus list',
            ctaHref: '#focus-list',
            tone: 'warn',
        }
    }

    if (kpi.avgAdherence < 60) {
        return {
            id: 'adherencia-baja',
            title: 'Adherencia promedio < 60%',
            description: 'Revisa patrones de abandono y ajusta cargas o frecuencia.',
            ctaLabel: 'Ver detalle',
            ctaHref: '#adherencia',
            tone: 'warn',
        }
    }

    if (kpi.mrrDeltaPct <= -10) {
        return {
            id: 'mrr-cayendo',
            title: `MRR ${kpi.mrrDeltaPct}% vs mes anterior`,
            description: 'Activa un programa de referidos o revisa renovaciones.',
            ctaLabel: 'Ir a facturacion',
            ctaHref: '/coach/subscription',
            tone: 'warn',
        }
    }

    if (agenda.length > 0) {
        return {
            id: 'agenda-hoy',
            title: `${agenda.length} pendientes hoy`,
            description: 'Cierra los check-ins y recordatorios pendientes.',
            ctaLabel: 'Ver agenda',
            ctaHref: '#agenda',
            tone: 'info',
        }
    }

    return {
        id: 'todo-ok',
        title: 'Todo bajo control',
        description: 'Buen momento para planificar la semana o revisar progresos.',
        ctaLabel: 'Ver alumnos',
        ctaHref: '/coach/clients',
        tone: 'positive',
    }
}
