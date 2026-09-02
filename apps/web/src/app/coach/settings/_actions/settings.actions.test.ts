import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, createServiceRoleClientMock, revalidatePathMock, cancelCoachEmailsMock } =
    vi.hoisted(() => ({
        createClientMock: vi.fn(),
        createServiceRoleClientMock: vi.fn(),
        revalidatePathMock: vi.fn(),
        cancelCoachEmailsMock: vi.fn(),
    }))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: createServiceRoleClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/payments/provider', () => ({ getPaymentsProviderForCoach: vi.fn() }))
vi.mock('@/services/client/client-deletion.service', () => ({ deleteClientHard: vi.fn() }))
vi.mock('@/services/email/coach-email-ledger.service', () => ({ cancelCoachEmails: cancelCoachEmailsMock }))

import { deleteCoachAccountAction, updateBrandSettingsAction } from './settings.actions'
import { BRAND_CHECKBOX_KEEP } from '../_lib/brand-form-values'

const COACH_ID = '11111111-1111-4111-8111-111111111111'

/**
 * FCN W3.4 — el camino de escritura de la marca dejó de apagar «usar mi marca en mi panel».
 *
 * El bug: `updateBrandSettingsAction` persiste el formulario COMPLETO y lee los checkbox como
 * `=== 'on'`, o sea que la AUSENCIA es un `false` explícito. `BrandQuickCard` (la tarjeta de la
 * guía) no tiene ese checkbox y reenviaba el estado actual del coach, así que el que estaba en
 * `false` reescribía `false` en cada guardado y se llevaba puesto el `true` con el que nacen los
 * coaches nuevos (W3.3) y el backfill de W3.5.
 *
 * Lo que se pinnea acá son los TRES estados del campo, porque el arreglo solo vale si el checkbox
 * explícito sigue pudiendo apagar.
 */
function setup(options: { updateError?: { message: string } } = {}) {
    const updatePayloads: Array<Record<string, unknown>> = []

    const update = vi.fn((payload: Record<string, unknown>) => {
        updatePayloads.push(payload)
        return { eq: vi.fn(async () => ({ error: options.updateError ?? null })) }
    })

    const supabase = {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: COACH_ID } } })) },
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(async () => ({
                        data: {
                            welcome_modal_enabled: false,
                            welcome_modal_content: null,
                            welcome_modal_type: 'text',
                            welcome_modal_version: 0,
                            subscription_tier: 'free',
                        },
                    })),
                })),
            })),
            update,
        })),
        storage: { from: vi.fn(() => ({ getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })) })) },
    }

    createClientMock.mockResolvedValue(supabase)
    return { updatePayloads }
}

/** Campos mínimos que el schema exige; el test solo varía `use_brand_colors_coach`. */
function brandFormData(useBrandColorsCoach: 'on' | 'keep' | 'absent'): FormData {
    const fd = new FormData()
    fd.set('full_name', 'Josefa Díaz')
    fd.set('brand_name', 'Studio Fuerza')
    fd.set('primary_color', '#1462DC')
    fd.set('theme_preset_key', '')
    fd.set('login_layout_key', '')
    if (useBrandColorsCoach === 'on') fd.set('use_brand_colors_coach', 'on')
    if (useBrandColorsCoach === 'keep') fd.set('use_brand_colors_coach', BRAND_CHECKBOX_KEEP)
    return fd
}

describe('updateBrandSettingsAction — use_brand_colors_coach (W3.4)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('KEEP (guardado desde la guía) NO escribe la columna: no puede apagar nada', async () => {
        const { updatePayloads } = setup()

        await expect(updateBrandSettingsAction({}, brandFormData('keep'))).resolves.toEqual({ success: true })

        expect(updatePayloads).toHaveLength(1)
        // Ni `false` ni `true`: la clave no viaja en el UPDATE, así que el valor de la DB sobrevive.
        expect(updatePayloads[0]).not.toHaveProperty('use_brand_colors_coach')
        // El resto del formulario sí se persiste (KEEP no anula el guardado de la marca).
        expect(updatePayloads[0]).toMatchObject({ brand_name: 'Studio Fuerza', primary_color: '#1462DC' })
    })

    it('el checkbox explícito marcado escribe true', async () => {
        const { updatePayloads } = setup()

        await updateBrandSettingsAction({}, brandFormData('on'))

        expect(updatePayloads[0].use_brand_colors_coach).toBe(true)
    })

    it('el checkbox explícito DESMARCADO (ausente) sigue mandando: escribe false', async () => {
        const { updatePayloads } = setup()

        await updateBrandSettingsAction({}, brandFormData('absent'))

        expect(updatePayloads[0].use_brand_colors_coach).toBe(false)
    })
})

/**
 * B7 — el borrado de cuenta tiene que MATAR los correos que quedaron agendados en Resend.
 *
 * El bug: `deleteCoachAccountAction` borraba `auth.users` y la cascada se llevaba el
 * `coach_email_ledger`, que es de donde salen los `provider_message_id` a cancelar. Resultado: el
 * drip de venta seguía llegando a la casilla de alguien cuya cuenta ya no existe, mientras la hoja
 * de confirmación promete «Serás desuscripto de todos los emails de EVA».
 *
 * Los dos invariantes que se pinnean acá son opuestos entre sí y por eso van juntos:
 *  1. la cancelación corre ANTES del `deleteUser` (después ya no hay ledger que leer), y
 *  2. si falla NO bloquea el borrado — Ley 21.719: la baja se completa igual.
 */
function deleteSetup(options: { cancelRejects?: boolean } = {}) {
    const order: string[] = []

    const deleteUser = vi.fn(async () => {
        order.push('deleteUser')
        return { error: null }
    })

    // `.eq()` sirve a los DOS accesos del flujo: `coaches…maybeSingle()` (fila del coach) y
    // `clients…` awaiteado directo (lista de alumnos) — de ahí el thenable.
    const eqResult = {
        maybeSingle: async () => ({
            data: {
                subscription_mp_id: null,
                subscription_status: 'canceled',
                subscription_tier: 'free',
                subscription_provider: null,
                subscription_provider_external_id: null,
            },
            error: null,
        }),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve, reject),
    }

    const adminDb = {
        auth: { admin: { deleteUser } },
        from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => eqResult) })) })),
    }

    const supabase = {
        auth: { getUser: vi.fn(async () => ({ data: { user: { id: COACH_ID } } })) },
        storage: { from: vi.fn(() => ({ remove: vi.fn(async () => ({ error: null })) })) },
    }

    createClientMock.mockResolvedValue(supabase)
    createServiceRoleClientMock.mockReturnValue(adminDb)
    cancelCoachEmailsMock.mockImplementation(async () => {
        order.push('cancelCoachEmails')
        if (options.cancelRejects) throw new Error('resend 503')
        return { cancelled: 3, alreadySent: 1, failed: 0 }
    })

    return { adminDb, deleteUser, order }
}

describe('deleteCoachAccountAction — correos agendados (B7)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('cancela TODO lo agendado del coach ANTES de borrar el auth.user', async () => {
        const { adminDb, order } = deleteSetup()

        await deleteCoachAccountAction('ELIMINAR')

        expect(cancelCoachEmailsMock).toHaveBeenCalledTimes(1)
        // `'*'`, no las keys del drip: se va la cuenta entera.
        expect(cancelCoachEmailsMock).toHaveBeenCalledWith(adminDb, COACH_ID, '*')
        // El orden ES el arreglo: al revés la cascada ya borró el ledger.
        expect(order).toEqual(['cancelCoachEmails', 'deleteUser'])
    })

    it('si la cancelación falla, la cuenta se borra igual', async () => {
        const { deleteUser } = deleteSetup({ cancelRejects: true })

        await deleteCoachAccountAction('ELIMINAR')

        expect(cancelCoachEmailsMock).toHaveBeenCalledTimes(1)
        expect(deleteUser).toHaveBeenCalledTimes(1)
    })

    it('confirmación incorrecta ⇒ no se cancela nada ni se borra nada', async () => {
        const { deleteUser } = deleteSetup()

        await expect(deleteCoachAccountAction('eliminar')).resolves.toEqual({
            error: 'Confirmación incorrecta.',
        })

        expect(cancelCoachEmailsMock).not.toHaveBeenCalled()
        expect(deleteUser).not.toHaveBeenCalled()
    })
})
