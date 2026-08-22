import { describe, expect, it } from 'vitest'
import {
    PERSONAS,
    PERSONA_COPY,
    PERSONA_TILE_ORDER,
    PersonaSchema,
    formatWhatsappInvite,
    personaNoun,
    type Persona,
} from './persona'

describe('@eva/schemas/persona — catálogo', () => {
    it('son exactamente las 5 personas del CHECK de coaches.persona', () => {
        expect([...PERSONAS]).toEqual(['strength', 'nutrition', 'rehab', 'endurance', 'other'])
    })

    it('PersonaSchema acepta las 5 y rechaza cualquier otra', () => {
        for (const persona of PERSONAS) {
            expect(PersonaSchema.parse(persona)).toBe(persona)
        }
        expect(PersonaSchema.safeParse('kine').success).toBe(false)
        expect(PersonaSchema.safeParse('').success).toBe(false)
        expect(PersonaSchema.safeParse(null).success).toBe(false)
    })

    it('cada persona tiene copy de tarjeta no vacío (título + bajada)', () => {
        for (const persona of PERSONAS) {
            const copy = PERSONA_COPY[persona]
            expect(copy.tileTitle.trim().length).toBeGreaterThan(0)
            expect(copy.tileSubtitle.trim().length).toBeGreaterThan(0)
        }
    })

    it('los títulos de tarjeta son únicos (no hay dos ramas que se lean igual)', () => {
        const titles = PERSONAS.map((p) => PERSONA_COPY[p].tileTitle)
        expect(new Set(titles).size).toBe(PERSONAS.length)
    })

    it('el orden de tarjetas deja el escape (other) último', () => {
        expect(PERSONA_TILE_ORDER[PERSONA_TILE_ORDER.length - 1]).toBe('other')
        expect(PERSONA_TILE_ORDER).toHaveLength(5)
    })

    it('vocabulario: alumno / paciente / atleta según SPEC §1', () => {
        const expected: Record<Persona, string> = {
            strength: 'alumno',
            nutrition: 'paciente',
            rehab: 'paciente',
            endurance: 'atleta',
            other: 'alumno',
        }
        for (const persona of PERSONAS) {
            expect(personaNoun(persona)).toBe(expected[persona])
            expect(personaNoun(persona, true)).toBe(`${expected[persona]}s`)
        }
    })

    it('demo: las 4 ramas con contenido traen nombre + bajada; `other` no siembra demo', () => {
        for (const persona of PERSONAS) {
            const { demoName, demoTagline } = PERSONA_COPY[persona]
            if (persona === 'other') {
                expect(demoName).toBeNull()
                expect(demoTagline).toBeNull()
                continue
            }
            expect(demoName).toBeTruthy()
            expect(demoTagline).toBeTruthy()
        }
    })

    it('segunda pregunta: alimentación para 1/3/4, entrenamiento para nutrición, ninguna para other', () => {
        expect(PERSONA_COPY.strength.secondQuestion).toBe('¿También les armas la alimentación?')
        expect(PERSONA_COPY.rehab.secondQuestion).toBe('¿También les armas la alimentación?')
        expect(PERSONA_COPY.endurance.secondQuestion).toBe('¿También les armas la alimentación?')
        expect(PERSONA_COPY.nutrition.secondQuestion).toBe('¿También les armas el entrenamiento?')
        expect(PERSONA_COPY.other.secondQuestion).toBeNull()
    })
})

describe('@eva/schemas/persona — mensaje de WhatsApp', () => {
    it('cada plantilla trae los dos tokens y no viene vacía', () => {
        for (const persona of PERSONAS) {
            const template = PERSONA_COPY[persona].whatsappInvite
            expect(template.trim().length).toBeGreaterThan(0)
            expect(template).toContain('{nombre}')
            expect(template).toContain('{link}')
        }
    })

    it('formatWhatsappInvite reemplaza los tokens y no deja placeholders sueltos', () => {
        for (const persona of PERSONAS) {
            const msg = formatWhatsappInvite(persona, {
                nombre: 'Ana',
                link: 'https://eva-app.cl/join/ABC12',
            })
            expect(msg).toContain('Ana')
            expect(msg).toContain('https://eva-app.cl/join/ABC12')
            expect(msg).not.toMatch(/\{[a-zA-Z]+\}/)
        }
    })
})
