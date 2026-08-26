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

    // El callejón 4 del spec «flujo del coach nuevo»: el `{link}` es `/c/{código}/login`, que pide
    // correo Y contraseña. Sin el bloque de acceso, el alumno tenía que ir a buscar la clave a su
    // casilla — dos saltos de app, y 3 de 8 alumnos invitados nunca entraron.
    it('las 5 plantillas CON clave traen el bloque de acceso completo', () => {
        for (const persona of PERSONAS) {
            const template = PERSONA_COPY[persona].whatsappInvite
            expect(template).toContain('{link}')
            expect(template).toContain('{correo}')
            expect(template).toContain('{clave}')
        }
    })

    // Regla 4 de SPEC §5: sin teléfono el mensaje va a `wa.me/?text=` (selector de contactos) y una
    // credencial ahí es una fuga a un toque. La variante sin clave NO puede tener el token.
    it('las 5 plantillas SIN clave traen el link y NUNCA la credencial', () => {
        for (const persona of PERSONAS) {
            const template = PERSONA_COPY[persona].whatsappInviteSinClave
            expect(template.trim().length).toBeGreaterThan(0)
            expect(template).toContain('{nombre}')
            expect(template).toContain('{link}')
            expect(template).not.toContain('{clave}')
            expect(template).not.toContain('{correo}')
            expect(template).toContain('correo')
        }
    })

    it('las dos variantes de cada persona comparten la primera frase', () => {
        for (const persona of PERSONAS) {
            const { whatsappInvite, whatsappInviteSinClave } = PERSONA_COPY[persona]
            const [conClave] = whatsappInvite.split('\n')
            const [sinClave] = whatsappInviteSinClave.split('\n')
            expect(conClave).toBe(sinClave)
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

    it('con correo Y clave sale la variante con credencial, resuelta', () => {
        for (const persona of PERSONAS) {
            const msg = formatWhatsappInvite(persona, {
                nombre: 'Ana',
                link: 'https://eva-app.cl/c/ABC12/login',
                correo: 'ana@correo.com',
                clave: 'Ru7-mesa',
            })
            expect(msg).toContain('Tu usuario: ana@correo.com')
            expect(msg).toContain('Tu clave temporal: Ru7-mesa')
            expect(msg).not.toMatch(/\{[a-zA-Z]+\}/)
        }
    })

    it('si falta el correo o la clave, cae en la variante SIN credencial', () => {
        const base = { nombre: 'Ana', link: 'https://eva-app.cl/c/ABC12/login' }
        const variantes = [
            { ...base },
            { ...base, correo: 'ana@correo.com' },
            { ...base, clave: 'Ru7-mesa' },
            { ...base, correo: '  ', clave: 'Ru7-mesa' },
            { ...base, correo: 'ana@correo.com', clave: null },
        ]
        for (const persona of PERSONAS) {
            for (const vars of variantes) {
                const msg = formatWhatsappInvite(persona, vars)
                expect(msg).toBe(
                    PERSONA_COPY[persona].whatsappInviteSinClave
                        .split('{nombre}').join('Ana')
                        .split('{link}').join(base.link)
                )
                expect(msg).not.toContain('Ru7-mesa')
                expect(msg).not.toContain('clave temporal:')
            }
        }
    })
})
