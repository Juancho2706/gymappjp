import { describe, expect, it, afterEach } from 'vitest'
import { randomDraftRowId, withSyntheticDraftIds } from './editor-state'
import { NutritionPlanDraftSchema } from './contracts'

/**
 * Guard del bloqueo del 2026-08-18: en Hermes NO existe `globalThis.crypto`, y el fallback viejo
 * de `withSyntheticDraftIds` emitia `synthetic-<base36>`. Los tres `id` del contrato exigen
 * `z.string().uuid()`, asi que en la app cada plantilla abierta para editar moria al guardar con
 * «La plantilla tiene datos invalidos» — sin decir que campo, y con «Reintentar» reintentando el
 * mismo fallo.
 *
 * CI jamas lo cazo porque en Node `crypto.randomUUID` SI existe: por eso este test APAGA
 * `globalThis.crypto` a mano. Sin ese stub, el test pasa aunque el bug vuelva.
 */

const RFC_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto')

function withoutCrypto<T>(fn: () => T): T {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true })
    try {
        return fn()
    } finally {
        if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto)
        else delete (globalThis as { crypto?: unknown }).crypto
    }
}

afterEach(() => {
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto)
})

const draft = {
    clientId: '00000000-0000-0000-0000-000000000000',
    name: 'Plancito 2',
    strategy: 'structured' as const,
    permissions: {},
    dayVariants: [
        {
            key: 'mon',
            label: 'Lunes',
            dayOfWeek: 1,
            targets: {},
            mealSlots: [
                {
                    code: 'slot-1',
                    name: 'POLLO',
                    startTime: '18:54',
                    orderIndex: 0,
                    items: [
                        {
                            orderIndex: 0,
                            foodId: '11111111-1111-4111-8111-111111111111',
                            quantity: 100,
                            unit: 'ml',
                        },
                    ],
                },
            ],
        },
    ],
}

describe('withSyntheticDraftIds sin crypto (Hermes)', () => {
    it('genera UUID RFC-4122 aunque no exista globalThis.crypto', () => {
        const id = withoutCrypto(() => randomDraftRowId())
        expect(id).toMatch(RFC_UUID)
    })

    it('el draft con ids sinteticos pasa el contrato que valida la app antes de guardar', () => {
        const withIds = withoutCrypto(() => withSyntheticDraftIds(draft as never))
        const parsed = NutritionPlanDraftSchema.safeParse(withIds)
        const issues = parsed.success ? [] : parsed.error.issues.map((i) => i.path.join('.'))
        expect(issues).toEqual([])
    })

    it('marca cada fila del draft: dia, franja e item', () => {
        const withIds = withoutCrypto(() => withSyntheticDraftIds(draft as never))
        const variant = withIds.dayVariants[0]!
        const slot = variant.mealSlots[0]!
        expect(variant.id).toMatch(RFC_UUID)
        expect(slot.id).toMatch(RFC_UUID)
        expect(slot.items[0]!.id).toMatch(RFC_UUID)
    })

    it('respeta el idGen inyectado (determinismo del harness SSR)', () => {
        let n = 0
        const withIds = withSyntheticDraftIds(draft as never, () => `fixed-${++n}`)
        expect(withIds.dayVariants[0]!.id).toBe('fixed-1')
    })
})
