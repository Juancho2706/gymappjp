import type { DashboardV2Data } from '../_data/types'

export interface NextBestAction {
    id: string
    title: string
    description: string
    ctaLabel: string
    ctaHref: string
    tone: 'info' | 'warn' | 'positive'
}

export function resolveNextBestAction(data: DashboardV2Data): NextBestAction {
    const { kpi, topRiskClients, agenda, expiringPrograms } = data

    const overdueExpiring = expiringPrograms.filter((p) => p.daysLeft <= 0)
    if (overdueExpiring.length > 0) {
        return {
            id: 'programas-vencidos',
            title: `${overdueExpiring.length} programa${overdueExpiring.length === 1 ? '' : 's'} vencido${overdueExpiring.length === 1 ? '' : 's'}`,
            description: 'Renueva para que tus alumnos no pierdan continuidad.',
            ctaLabel: 'Revisar programas',
            ctaHref: '/coach/programs',
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
