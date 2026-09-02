import { z } from 'zod'

/**
 * Contrato compartido del inbox «Solicitudes» del coach (`coach_leads`).
 *
 * Lo consumen la web (route handler móvil `GET|PATCH /api/mobile/coach/leads`) y la app RN
 * (`apps/mobile/lib/leads.ts`). El DTO usa nombres de DOMINIO, no columnas: la app no conoce la
 * tabla y un rename de columna no puede romper un binario ya publicado.
 *
 * Fuente de verdad del modelo: `supabase/migrations/20260821030821_coach_leads.sql` y
 * `docs/specs/coach-leads/SPEC.md`. Los estados son EXACTAMENTE los del CHECK de la tabla.
 */

/** CHECK `status in ('new','contacted','converted','dismissed')` de la migración. */
export const COACH_LEAD_STATUSES = ['new', 'contacted', 'converted', 'dismissed'] as const

export const CoachLeadStatusSchema = z.enum(COACH_LEAD_STATUSES)
export type CoachLeadStatus = z.infer<typeof CoachLeadStatusSchema>

/**
 * Estados «abiertos»: lo que el coach ve como bandeja pendiente. Espejo de `OPEN_LEAD_STATUSES`
 * en `apps/web/src/app/coach/clients/_data/leads.queries.ts` — si uno cambia, cambian los dos.
 */
export const OPEN_COACH_LEAD_STATUSES = ['new', 'contacted'] as const
export type OpenCoachLeadStatus = (typeof OPEN_COACH_LEAD_STATUSES)[number]

/**
 * Estados a los que el coach PUEDE mover una solicitud desde la app. `new` no está: es el estado
 * inicial que escribe `/join`, y volver a él sería reabrir una solicitud ya trabajada.
 */
export const COACH_LEAD_UPDATABLE_STATUSES = ['contacted', 'converted', 'dismissed'] as const

export const CoachLeadUpdatableStatusSchema = z.enum(COACH_LEAD_UPDATABLE_STATUSES)
export type CoachLeadUpdatableStatus = z.infer<typeof CoachLeadUpdatableStatusSchema>

/** Item de la lista. Mismo shape que el DTO del panel web (`CoachLeadListItem`). */
export const CoachLeadSchema = z.object({
    id: z.string(),
    fullName: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    message: z.string().nullable(),
    status: CoachLeadStatusSchema,
    /** ISO-8601 UTC tal como lo devuelve PostgREST. La app formatea con tabla fija. */
    createdAt: z.string(),
    /** `clients.full_name` del alumno que compartió la tarjeta; null si llegó sin `?ref`. */
    referrerName: z.string().nullable(),
    referralCardKind: z.string().nullable(),
    referralSource: z.string().nullable(),
})

export type CoachLead = z.infer<typeof CoachLeadSchema>

/**
 * `?status=` del GET. Ausente ⇒ la bandeja abierta (`new` + `contacted`), que es lo que la
 * pantalla necesita el 99 % de las veces. Un estado concreto filtra por ese solo estado.
 */
export const CoachLeadsQuerySchema = z.object({
    status: CoachLeadStatusSchema.optional(),
})

export type CoachLeadsQuery = z.infer<typeof CoachLeadsQuerySchema>

export const CoachLeadsResponseSchema = z.object({
    leads: z.array(CoachLeadSchema),
})

export type CoachLeadsResponse = z.infer<typeof CoachLeadsResponseSchema>

/** Body del PATCH. `strict` a propósito: la app no puede mandar columnas de contrabando. */
export const CoachLeadUpdateRequestSchema = z
    .object({
        status: CoachLeadUpdatableStatusSchema,
    })
    .strict()

export type CoachLeadUpdateRequest = z.infer<typeof CoachLeadUpdateRequestSchema>

export const CoachLeadUpdateResponseSchema = z.object({
    ok: z.literal(true),
    lead: CoachLeadSchema,
})

export type CoachLeadUpdateResponse = z.infer<typeof CoachLeadUpdateResponseSchema>
