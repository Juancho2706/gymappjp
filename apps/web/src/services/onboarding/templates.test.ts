import { describe, expect, it } from 'vitest'
import { PERSONAS, type Persona } from '@eva/schemas'
import { TEMPLATE_CATALOG } from '@eva/onboarding'
import {
    DEMO_TEMPLATE_BY_PERSONA,
    resolveTemplateBlueprint,
    templateIdsForPersona,
    templateIdsWithContent,
} from './templates'

/**
 * Test CRUZADO catálogo ↔ contenido. `TEMPLATE_CATALOG` (paquete puro) es lo que el panel PINTA;
 * `templates.ts` es lo que de verdad se crea. Si alguien agrega una plantilla al catálogo y no le
 * escribe contenido, el botón muere en `template_desconocida` — y eso se ve acá, no en producción.
 */
describe('catálogo de plantillas ↔ contenido', () => {
    it('toda plantilla del catálogo tiene contenido', () => {
        const catalogIds = PERSONAS.flatMap((persona) => templateIdsForPersona(persona))
        for (const id of catalogIds) {
            expect(resolveTemplateBlueprint(id), `plantilla sin contenido: ${id}`).not.toBeNull()
        }
    })

    it('no hay contenido huérfano (sin entrada en el catálogo)', () => {
        const catalogIds = new Set(PERSONAS.flatMap((persona) => templateIdsForPersona(persona)))
        for (const id of templateIdsWithContent()) {
            expect(catalogIds.has(id), `contenido sin entrada en el catálogo: ${id}`).toBe(true)
        }
    })

    it('un id desconocido devuelve null', () => {
        expect(resolveTemplateBlueprint('no-existe')).toBeNull()
    })
})

describe('plantilla de arranque por persona', () => {
    it('cada rama con demo arranca con una plantilla de SU catálogo; `other` con ninguna', () => {
        for (const persona of PERSONAS) {
            const templateId = DEMO_TEMPLATE_BY_PERSONA[persona as Persona]
            if (persona === 'other') {
                expect(templateId).toBeNull()
                expect(TEMPLATE_CATALOG.other).toHaveLength(0)
                continue
            }
            expect(templateId, `${persona} sin plantilla de arranque`).not.toBeNull()
            expect(templateIdsForPersona(persona)).toContain(templateId as string)
        }
    })

    it('la rama de nutrición arranca con una pauta V2 y las demás con un programa', () => {
        expect(resolveTemplateBlueprint(DEMO_TEMPLATE_BY_PERSONA.nutrition as string)?.kind).toBe('nutrition')
        expect(resolveTemplateBlueprint(DEMO_TEMPLATE_BY_PERSONA.strength as string)?.kind).toBe('program')
        expect(resolveTemplateBlueprint(DEMO_TEMPLATE_BY_PERSONA.rehab as string)?.kind).toBe('program')
        expect(resolveTemplateBlueprint(DEMO_TEMPLATE_BY_PERSONA.endurance as string)?.kind).toBe('program')
    })
})

describe('integridad de los blueprints', () => {
    it('todo bloque tiene una clave única dentro de su programa y un ejercicio referenciado por nombre', () => {
        for (const id of templateIdsWithContent()) {
            const blueprint = resolveTemplateBlueprint(id)
            if (blueprint?.kind !== 'program') continue
            const keys = new Set<string>()
            for (const plan of blueprint.program.plans) {
                expect(plan.blocks.length, `${id} · ${plan.title} sin bloques`).toBeGreaterThan(0)
                for (const block of plan.blocks) {
                    expect(keys.has(block.key), `${id}: clave de bloque duplicada ${block.key}`).toBe(false)
                    keys.add(block.key)
                    expect(block.exercise.names.length, `${id}/${block.key} sin nombres`).toBeGreaterThan(0)
                }
            }
        }
    })

    it('las pautas V2 tienen un día por defecto, franjas y alimentos referenciados por nombre', () => {
        for (const id of templateIdsWithContent()) {
            const blueprint = resolveTemplateBlueprint(id)
            if (blueprint?.kind !== 'nutrition') continue
            const defaults = blueprint.plan.dayVariants.filter((variant) => variant.isDefault)
            expect(defaults, `${id} debe tener exactamente un día por defecto`).toHaveLength(1)
            for (const variant of blueprint.plan.dayVariants) {
                // Guard de día vacío del editor: una variante sin franjas se vería VACÍA en la app.
                expect(variant.slots.length, `${id}/${variant.key} sin franjas`).toBeGreaterThan(0)
                for (const slot of variant.slots) {
                    expect(slot.items.length, `${id}/${slot.code} sin alimentos`).toBeGreaterThan(0)
                    for (const item of slot.items) {
                        expect(item.food.names.length).toBeGreaterThan(0)
                        expect(item.quantity).toBeGreaterThan(0)
                    }
                    for (const target of slot.exchangeTargets ?? []) {
                        // CHECK de la tabla: porciones > 0 y en múltiplos de media porción.
                        expect(target.portions).toBeGreaterThan(0)
                        expect(target.portions * 2).toBe(Math.floor(target.portions * 2))
                    }
                }
            }
        }
    })
})
