import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { applyTemplate, deleteDemoStudent, getDemoClientId, seedDemoStudent } from './demo-student.service'

/**
 * Tests del sembrador con un doble de Supabase (sin red). Lo que se verifica es lo que puede
 * romper en producción y no lo ve un typecheck: la rama sin demo, la idempotencia, el MERGE del
 * inventario en `onboarding_guide` (no un replace que borre el progreso de la guía) y el borrado
 * reversible.
 */

// ── Doble de Supabase ────────────────────────────────────────────────────────────────────────

type Filter = [op: string, column: string, value: unknown]
interface Op {
    table: string
    kind: 'select' | 'insert' | 'update' | 'delete'
    payload?: unknown
    filters: Filter[]
}

type Responder = (op: Op) => Record<string, unknown>[]

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
    constructor(
        private readonly op: Op,
        private readonly respond: Responder,
    ) {}

    select(): this {
        return this
    }
    insert(rows: Record<string, unknown> | Record<string, unknown>[]): this {
        this.op.kind = 'insert'
        this.op.payload = rows
        return this
    }
    update(values: Record<string, unknown>): this {
        this.op.kind = 'update'
        this.op.payload = values
        return this
    }
    delete(): this {
        this.op.kind = 'delete'
        return this
    }
    eq(column: string, value: unknown): this {
        this.op.filters.push(['eq', column, value])
        return this
    }
    in(column: string, value: unknown): this {
        this.op.filters.push(['in', column, value])
        return this
    }
    is(column: string, value: unknown): this {
        this.op.filters.push(['is', column, value])
        return this
    }
    or(expr: string): this {
        this.op.filters.push(['or', expr, null])
        return this
    }
    order(): this {
        return this
    }
    limit(): this {
        return this
    }
    single(): Promise<{ data: unknown; error: null }> {
        return Promise.resolve({ data: this.respond(this.op)[0] ?? null, error: null })
    }
    maybeSingle(): Promise<{ data: unknown; error: null }> {
        return Promise.resolve({ data: this.respond(this.op)[0] ?? null, error: null })
    }
    then<R1 = { data: unknown; error: null }, R2 = never>(
        onFulfilled?: ((value: { data: unknown; error: null }) => R1 | PromiseLike<R1>) | null,
        onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
    ): PromiseLike<R1 | R2> {
        return Promise.resolve({ data: this.respond(this.op), error: null as null }).then(onFulfilled, onRejected)
    }
}

interface FakeState {
    ops: Op[]
    createdUsers: string[]
    deletedUsers: string[]
    /** Filas que devuelve cada `select` por tabla (se consume en orden si hay varias respuestas). */
    selects: Record<string, Record<string, unknown>[]>
}

function makeFakeAdmin(overrides: Record<string, Record<string, unknown>[]> = {}): {
    admin: SupabaseClient<Database>
    state: FakeState
} {
    let seq = 0
    const state: FakeState = {
        ops: [],
        createdUsers: [],
        deletedUsers: [],
        selects: { ...overrides },
    }

    const respond: Responder = (op) => {
        state.ops.push(op)
        if (op.kind === 'select') return state.selects[op.table] ?? []
        if (op.kind === 'insert') {
            const rows = Array.isArray(op.payload) ? op.payload : [op.payload]
            return rows.map((row) => {
                seq += 1
                return { id: `${op.table}-${seq}`, ...(row as Record<string, unknown>) }
            })
        }
        if (op.kind === 'delete') return state.selects[`${op.table}:delete`] ?? []
        return []
    }

    const admin = {
        from: (table: string) => new FakeQuery({ table, kind: 'select', filters: [] }, respond),
        auth: {
            admin: {
                createUser: async (payload: { email: string }) => {
                    const id = `auth-user-${state.createdUsers.length + 1}`
                    state.createdUsers.push(payload.email)
                    return { data: { user: { id, email: payload.email } }, error: null }
                },
                deleteUser: async (id: string) => {
                    state.deletedUsers.push(id)
                    return { data: null, error: null }
                },
            },
        },
    } as unknown as SupabaseClient<Database>

    return { admin, state }
}

const COACH = 'coach-1'

function opsFor(state: FakeState, table: string, kind: Op['kind']): Op[] {
    return state.ops.filter((op) => op.table === table && op.kind === kind)
}

// ── seedDemoStudent ──────────────────────────────────────────────────────────────────────────

describe('seedDemoStudent', () => {
    it('la persona `other` no siembra demo y no crea ningún usuario', async () => {
        const { admin, state } = makeFakeAdmin()
        const result = await seedDemoStudent(admin, { coachId: COACH, persona: 'other' })
        expect(result).toEqual({ ok: false, reason: 'persona_sin_demo' })
        expect(state.createdUsers).toHaveLength(0)
        expect(state.ops).toHaveLength(0)
    })

    it('es idempotente: con un demo ya sembrado devuelve el existente sin tocar auth', async () => {
        const { admin, state } = makeFakeAdmin({ clients: [{ id: 'demo-ya-existe' }] })
        const result = await seedDemoStudent(admin, { coachId: COACH, persona: 'strength' })
        expect(result).toEqual({ ok: true, demoClientId: 'demo-ya-existe', alreadyExisted: true })
        expect(state.createdUsers).toHaveLength(0)
        expect(opsFor(state, 'clients', 'insert')).toHaveLength(0)
    })

    it('siembra identidad + contenido y anota el inventario haciendo MERGE del jsonb', async () => {
        const { admin, state } = makeFakeAdmin({
            clients: [],
            coaches: [{ onboarding_guide: { brand_tour_seen: true, dismissed: false } }],
            exercises: [
                { id: 'ex-1', name: 'Sentadilla de barra alta' },
                { id: 'ex-2', name: 'Press de banca con barra' },
            ],
            workout_section_templates: [{ id: 'area-main', slug: 'main', sort_order: 10, is_system: true }],
        })

        const result = await seedDemoStudent(admin, { coachId: COACH, persona: 'strength' })
        expect(result).toEqual({ ok: true, demoClientId: 'auth-user-1', alreadyExisted: false })

        // El alumno nace marcado como demo (única forma de quedar fuera del cupo Free).
        const clientInsert = opsFor(state, 'clients', 'insert')[0]?.payload as Record<string, unknown>
        expect(clientInsert.is_demo).toBe(true)
        expect(clientInsert.coach_id).toBe(COACH)
        expect(clientInsert.use_coach_brand_colors).toBe(true)
        expect(clientInsert.onboarding_completed).toBe(true)
        expect(clientInsert.force_password_change).toBe(false)
        expect(clientInsert.full_name).toBe('Matías')
        expect(state.createdUsers[0]).toBe(`demo-${COACH}@evatest.cl`)

        // Identidad completa: cuenta, membresía standalone e intake.
        expect(opsFor(state, 'client_accounts', 'insert')).toHaveLength(1)
        const membership = opsFor(state, 'client_memberships', 'insert')[0]?.payload as Record<string, unknown>
        expect(membership.scope).toBe('standalone')
        expect(membership.org_id).toBeNull()
        expect(membership.team_id).toBeNull()
        expect(opsFor(state, 'client_intake', 'insert')).toHaveLength(1)

        // Contenido de la rama: programa + días + bloques + logs + check-ins.
        expect(opsFor(state, 'workout_programs', 'insert')).toHaveLength(1)
        expect(opsFor(state, 'workout_plans', 'insert')).toHaveLength(3)
        expect(opsFor(state, 'workout_logs', 'insert').length).toBeGreaterThan(0)
        expect(opsFor(state, 'check_ins', 'insert')).toHaveLength(1)

        // Inventario: MERGE, no replace. El progreso previo de la guía sobrevive.
        const guideUpdate = opsFor(state, 'coaches', 'update').at(-1)?.payload as {
            onboarding_guide: Record<string, unknown>
        }
        expect(guideUpdate.onboarding_guide.brand_tour_seen).toBe(true)
        expect(guideUpdate.onboarding_guide.dismissed).toBe(false)
        const inventory = guideUpdate.onboarding_guide.demo as Record<string, unknown>
        expect(inventory.persona).toBe('strength')
        expect(inventory.clientId).toBe('auth-user-1')
        expect(inventory.templateId).toBe('full-body-3')
        expect(Object.keys(inventory.tables as Record<string, string[]>)).toEqual(
            expect.arrayContaining(['clients', 'client_memberships', 'workout_programs', 'workout_blocks']),
        )
    })

    it('la rama de nutrición publica un plan V2 y siembra composición corporal e ingesta', async () => {
        const { admin, state } = makeFakeAdmin({
            clients: [],
            coaches: [{ onboarding_guide: {} }],
            foods: [
                {
                    id: 'food-1',
                    name: 'Avena instantánea Quaker',
                    brand: 'Quaker',
                    calories: 367,
                    protein_g: 13,
                    carbs_g: 63,
                    fats_g: 7,
                    fiber_g: null,
                    serving_size: 40,
                    serving_unit: 'g',
                    category: 'carbohidrato',
                    macros_basis: 'per_100',
                },
            ],
            exchange_groups: [
                {
                    id: 'xg-c',
                    code: 'C',
                    name: 'Carbohidratos/Cereales',
                    ref_calories: 70,
                    ref_protein_g: 2,
                    ref_carbs_g: 15,
                    ref_fats_g: 0,
                    composed_of: null,
                    macros_confirmed: true,
                },
            ],
        })

        const result = await seedDemoStudent(admin, { coachId: COACH, persona: 'nutrition' })
        expect(result.ok).toBe(true)

        expect(opsFor(state, 'nutrition_plans_v2', 'insert')).toHaveLength(1)
        const version = opsFor(state, 'nutrition_plan_versions_v2', 'insert')[0]?.payload as Record<string, unknown>
        expect(version.status).toBe('published')
        expect(version.version_number).toBe(1)
        expect(version.published_by).toBe(COACH)
        // Publicar = apuntar la raíz a la versión (lo que hace el editor dentro de su transacción).
        expect(opsFor(state, 'nutrition_plans_v2', 'update')).toHaveLength(1)

        // Un BIA y un ISAK.
        expect(opsFor(state, 'body_composition_measurements', 'insert')).toHaveLength(2)
        const methods = opsFor(state, 'body_composition_measurements', 'insert').map(
            (op) => (op.payload as Record<string, unknown>).method,
        )
        expect(methods).toEqual(expect.arrayContaining(['bia', 'isak']))
        expect(opsFor(state, 'nutrition_intake_entries', 'insert').length).toBeGreaterThan(0)
    })

    it('la rama de rehabilitación siembra el screening con el resumen derivado del dominio', async () => {
        const { admin, state } = makeFakeAdmin({
            clients: [],
            coaches: [{ onboarding_guide: {} }],
            exercises: [{ id: 'ex-mov', name: 'Cat/Camel' }],
            workout_section_templates: [],
        })

        const result = await seedDemoStudent(admin, { coachId: COACH, persona: 'rehab' })
        expect(result.ok).toBe(true)

        const assessment = opsFor(state, 'movement_assessments', 'insert')[0]?.payload as Record<string, unknown>
        expect(assessment.status).toBe('final')
        // Dos patrones con dolor ⇒ banda alta; compuesto 7/21 con los crudos del blueprint.
        expect(assessment.has_pain).toBe(true)
        expect(assessment.has_asymmetry).toBe(true)
        expect(assessment.risk_band).toBe('high')
        expect(assessment.composite_score).toBe(7)
        expect(assessment.consent_confirmed_at).toEqual(expect.any(String))

        const items = opsFor(state, 'movement_assessment_items', 'insert')[0]?.payload as Record<string, unknown>[]
        expect(items).toHaveLength(7)

        // Las tres áreas propias (Movilidad / Control motor / Fortalecimiento) van al inventario.
        const inventory = (opsFor(state, 'coaches', 'update').at(-1)?.payload as {
            onboarding_guide: Record<string, unknown>
        }).onboarding_guide.demo as Record<string, unknown>
        expect((inventory.areaIds as string[]).length).toBe(3)
    })
})

// ── deleteDemoStudent ────────────────────────────────────────────────────────────────────────

describe('deleteDemoStudent', () => {
    it('borra por inventario y por is_demo, limpia las áreas y deja el jsonb sin `demo`', async () => {
        const { admin, state } = makeFakeAdmin({
            coaches: [
                {
                    onboarding_guide: {
                        brand_tour_seen: true,
                        demo: {
                            version: 1,
                            persona: 'rehab',
                            clientId: 'demo-1',
                            authUserId: 'demo-1',
                            accountId: 'demo-1',
                            templateId: 'lumbalgia-f1',
                            tables: { clients: ['demo-1'] },
                            areaIds: ['area-1', 'area-2', 'area-3'],
                            warnings: [],
                        },
                    },
                },
            ],
            clients: [{ id: 'demo-1' }],
            'workout_section_templates:delete': [{ id: 'area-1' }, { id: 'area-2' }, { id: 'area-3' }],
        })

        const result = await deleteDemoStudent(admin, { coachId: COACH })
        expect(result).toEqual({ ok: true, deleted: true })
        expect(state.deletedUsers).toEqual(['demo-1'])

        const areaDelete = opsFor(state, 'workout_section_templates', 'delete')[0]
        expect(areaDelete?.filters).toEqual(
            expect.arrayContaining([
                ['in', 'id', ['area-1', 'area-2', 'area-3']],
                ['eq', 'coach_id', COACH],
                ['eq', 'is_system', false],
            ]),
        )

        const guideUpdate = opsFor(state, 'coaches', 'update').at(-1)?.payload as {
            onboarding_guide: Record<string, unknown>
        }
        expect(guideUpdate.onboarding_guide.demo).toBeUndefined()
        expect(guideUpdate.onboarding_guide.brand_tour_seen).toBe(true)
    })

    it('sin demo ni inventario no borra nada y responde `deleted: false`', async () => {
        const { admin, state } = makeFakeAdmin({ coaches: [{ onboarding_guide: {} }], clients: [] })
        const result = await deleteDemoStudent(admin, { coachId: COACH })
        expect(result).toEqual({ ok: true, deleted: false })
        expect(state.deletedUsers).toHaveLength(0)
    })
})

// ── applyTemplate ────────────────────────────────────────────────────────────────────────────

describe('applyTemplate', () => {
    it('rechaza ids fuera del catálogo', async () => {
        const { admin } = makeFakeAdmin()
        const result = await applyTemplate(admin, {
            coachId: COACH,
            clientId: 'client-1',
            templateId: 'no-existe',
        })
        expect(result).toEqual({ ok: false, reason: 'template_desconocida' })
    })

    it('no asigna nada sin clientId', async () => {
        const { admin, state } = makeFakeAdmin()
        const result = await applyTemplate(admin, { coachId: COACH, clientId: '  ', templateId: 'full-body-3' })
        expect(result).toEqual({ ok: false, reason: 'error', detail: 'clientId_requerido' })
        expect(state.ops).toHaveLength(0)
    })

    it('no asigna a un alumno de otro coach (la autorización es del servidor)', async () => {
        const { admin, state } = makeFakeAdmin({ clients: [] })
        const result = await applyTemplate(admin, {
            coachId: COACH,
            clientId: 'client-ajeno',
            templateId: 'full-body-3',
        })
        expect(result).toEqual({ ok: false, reason: 'error', detail: 'alumno_fuera_del_coach' })
        expect(opsFor(state, 'workout_programs', 'insert')).toHaveLength(0)
    })

    it('crea el programa de la plantilla para el alumno del coach', async () => {
        const { admin, state } = makeFakeAdmin({
            clients: [{ id: 'client-1' }],
            exercises: [{ id: 'ex-1', name: 'Sentadilla de barra alta' }],
            workout_section_templates: [{ id: 'area-main', slug: 'main', sort_order: 10, is_system: true }],
        })
        const result = await applyTemplate(admin, {
            coachId: COACH,
            clientId: 'client-1',
            templateId: 'ppl',
        })
        expect(result).toEqual({ ok: true, programId: 'workout_programs-1' })
        const program = opsFor(state, 'workout_programs', 'insert')[0]?.payload as Record<string, unknown>
        expect(program.client_id).toBe('client-1')
        expect(program.name).toBe('Push / Pull / Legs')
        expect(program.is_active).toBe(true)
    })

    it('la plantilla de nutrición publica una pauta V2 en vez de un programa', async () => {
        const { admin, state } = makeFakeAdmin({
            clients: [{ id: 'client-1' }],
            foods: [],
            exchange_groups: [],
        })
        const result = await applyTemplate(admin, {
            coachId: COACH,
            clientId: 'client-1',
            templateId: 'hybrid-2200',
        })
        expect(result).toEqual({ ok: true, planId: 'nutrition_plans_v2-1' })
        expect(opsFor(state, 'workout_programs', 'insert')).toHaveLength(0)
    })
})

// ── getDemoClientId ──────────────────────────────────────────────────────────────────────────

describe('getDemoClientId', () => {
    it('filtra por coach, is_demo y no archivado', async () => {
        const { admin, state } = makeFakeAdmin({ clients: [{ id: 'demo-9' }] })
        expect(await getDemoClientId(admin, COACH)).toBe('demo-9')
        expect(state.ops[0]?.filters).toEqual([
            ['eq', 'coach_id', COACH],
            ['eq', 'is_demo', true],
            ['eq', 'is_archived', false],
        ])
    })
})
