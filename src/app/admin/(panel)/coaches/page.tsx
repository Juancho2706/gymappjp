import { Suspense } from 'react'
import { getAllCoachesPaginated } from '../dashboard/_data/admin.queries'
import { CoachTable } from './_components/CoachTable'
import { CoachFilterBar } from './_components/CoachFilterBar'
import { PageInfoButton } from '../_components/PageInfoButton'

export const metadata = { title: 'Coaches' }

const COACHES_INFO = [
    {
        heading: '¿Qué muestra esta sección?',
        body: 'Lista completa de todos los coaches registrados en la plataforma con métricas de salud, estado de suscripción, uso de alumnos y actividad reciente. Desde aquí podés gestionar cualquier coach individualmente o en masa.',
    },
    {
        heading: 'Columnas de la tabla',
        body: 'Coach — nombre de marca y slug del coach. Click para abrir el panel de gestión.\nHealth Score — puntuación 0-100: estado de suscripción (40pts) + % uso alumnos (30pts) + días hasta vencimiento (20pts) + actividad reciente (10pts). Verde >70, ámbar 40-70, rojo <40.\nProvider — origen del acceso: beta = prueba sin pago, mercadopago = suscripción activa pagando.\nTier — plan del coach (starter, pro, elite, scale) con su límite de alumnos.\nStatus — active = pagando, trialing = en prueba, expired = debe reactivar, past_due = cobro fallido, paused = suspendido por admin.\nUtil. — porcentaje de alumnos activos vs el máximo permitido por el plan.\nVence — días hasta que vence el período actual. Rojo <7 días, ámbar <14 días.\nAlumnos — activos / total en formato numérico.\nActividad — última vez que un alumno del coach registró una sesión de entrenamiento.',
    },
    {
        heading: 'Panel de gestión individual (click en coach)',
        body: 'Se abre un panel lateral con 4 pestañas:\nInfo — datos generales, IDs de pago, últimos alumnos.\nEditar — modificar nombre, tier, status, fechas de vencimiento, notas internas.\nActividad — historial de cambios realizados por admins + últimas sesiones de alumnos.\nAcciones — extender período, suspender, forzar expiración, reactivar, cambiar tier, impersonar, eliminar.',
    },
    {
        heading: 'Acciones masivas',
        body: 'Seleccioná uno o más coaches con los checkboxes. Aparece una barra flotante abajo con opciones:\nForzar expiración — todos los seleccionados pasan a status=expired y ven /reactivate en su próxima visita.\nReactivar — todos pasan a status=active con 30 días adicionales.\nTodas las acciones quedan registradas en Auditoría.',
    },
    {
        heading: 'Alerta de riesgo (banner ámbar)',
        body: 'Aparece automáticamente cuando hay coaches con: período venciendo en menos de 7 días, cobro fallido (past_due), o trial ya vencido. Click en cada coach del banner para abrirlo directamente.',
    },
    {
        heading: 'Fuente de datos',
        body: 'RPC get_admin_coaches_paginated con JOIN a workout_logs para la última actividad. Sin cache para mostrar siempre el estado actual. Soporta búsqueda, filtros por status/tier/provider y ordenamiento.',
    },
]

interface Props {
    searchParams: Promise<{
        q?: string
        status?: string
        tier?: string
        provider?: string
        beta?: string
        sort?: string
        dir?: string
        page?: string
    }>
}

export default async function AdminCoachesPage({ searchParams }: Props) {
    const sp = await searchParams
    const page = Math.max(1, parseInt(sp.page ?? '1', 10))

    const { coaches, total } = await getAllCoachesPaginated({
        search:   sp.q,
        status:   sp.status,
        tier:     sp.tier,
        beta:     sp.beta === 'true' ? true : sp.provider === 'beta' ? true : undefined,
        sort:     sp.sort,
        dir:      sp.dir,
        page,
        pageSize: 50,
    })

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[--admin-text-1]">Coaches</h1>
                    <p className="text-xs text-[--admin-text-3]">
                        {total} coach{total !== 1 ? 's' : ''} registrado{total !== 1 ? 's' : ''} en la plataforma.
                    </p>
                </div>
                <PageInfoButton title="Coaches — Guía completa" sections={COACHES_INFO} />
            </div>

            <Suspense>
                <CoachFilterBar />
            </Suspense>

            <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-[--admin-bg-surface]" />}>
                <CoachTable coaches={coaches} total={total} />
            </Suspense>
        </div>
    )
}
