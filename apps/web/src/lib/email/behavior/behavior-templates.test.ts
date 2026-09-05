import { describe, expect, it } from 'vitest'
import { PERSONAS, PERSONA_COPY, type Persona } from '@eva/schemas'
import { BEHAVIOR_TEMPLATE_KEYS, type BehaviorTemplateKey } from './behavior-triggers'
import {
    BEHAVIOR_FOOTER,
    behaviorPersonaKey,
    buildBehaviorEmail,
    buildWhatsappForwardText,
    joinUrl,
    type BehaviorEmailContext,
} from './behavior-templates'

/**
 * Plantillas de W6 (F6.2). Lo que se pinnea:
 *  · las 5 keys × las 5 personas × la rama SIN PERSONA renderizan asunto, texto y html no vacíos
 *    (W8.4.4: la rama sin especialidad la usan 48 de 51 coaches, no es un caso de borde);
 *  · el vocabulario sale de `PERSONA_COPY` («paciente» para nutri/rehab, «atleta» para endurance):
 *    si alguien lo escribe a mano en un string, este test lo caza;
 *  · el link `/join/{código}` y el mensaje de WhatsApp listo para reenviar;
 *  · UN solo `<a>` por correo (contrato heredado del drip) y el pie «Enviado por EVA» siempre;
 *  · el correo de +7 d NO inventa un WhatsApp del owner cuando la env no está (D13).
 */

const BASE: BehaviorEmailContext = {
    coachName: 'Josefa Díaz',
    brandName: 'Studio Fuerza',
    persona: 'strength',
    inviteCode: 'X5UD9X44',
    baseUrl: 'https://www.eva-app.cl',
    ownerWhatsappUrl: null,
}

/** Las 6 ramas de copy: las 5 personas + sin especialidad. */
const BRANCHES: Array<{ label: string; persona: Persona | null }> = [
    ...PERSONAS.map((p) => ({ label: p as string, persona: p as Persona | null })),
    { label: 'sin_persona', persona: null },
]

function countLinks(html: string): number {
    return html.match(/<a\s/g)?.length ?? 0
}

describe('cobertura: 5 keys × 6 ramas', () => {
    for (const { label, persona } of BRANCHES) {
        for (const key of BEHAVIOR_TEMPLATE_KEYS) {
            it(`${label} · ${key} renderiza asunto, texto y html`, () => {
                const email = buildBehaviorEmail(key, { ...BASE, persona })

                expect(email.key).toBe(key)
                expect(email.subject.length).toBeGreaterThan(0)
                expect(email.text.length).toBeGreaterThan(0)
                expect(email.html).toContain('<!DOCTYPE html>')
                // Un `{token}` sin reemplazar es un correo roto que igual sale.
                expect(email.subject).not.toMatch(/[{}]/)
                expect(email.text).not.toMatch(/\{[a-z]+\}/)
                // Pie legal + firma en TODOS (Ley 19.496 art. 28 B: la serie la inicia EVA).
                // La firma la pone `wrapEmailLayout`: en html va con `<strong>`, en texto plana.
                expect(email.html).toContain('Enviado por <strong>EVA Fitness Platform</strong>')
                expect(email.html).toContain(BEHAVIOR_FOOTER)
                expect(email.text).toContain('Enviado por EVA')
                expect(email.text).toContain(BEHAVIOR_FOOTER)
                // Contrato del drip: un solo CTA por correo.
                expect(countLinks(email.html)).toBe(1)
            })
        }
    }
})

describe('vocabulario por persona (fuente única: PERSONA_COPY)', () => {
    it('nutrición y rehab dicen «paciente»; endurance dice «atleta»', () => {
        expect(buildBehaviorEmail('behavior_no_client_2h', { ...BASE, persona: 'nutrition' }).subject).toContain(
            PERSONA_COPY.nutrition.noun.singular
        )
        expect(
            buildBehaviorEmail('behavior_client_not_entered_48h', { ...BASE, persona: 'rehab' }).subject
        ).toContain(PERSONA_COPY.rehab.noun.singular)
        expect(buildBehaviorEmail('behavior_aha', { ...BASE, persona: 'endurance' }).subject).toContain(
            PERSONA_COPY.endurance.noun.singular
        )
    })

    it('la rama sin persona usa el vocabulario neutro («alumno»), no inventa especialidad', () => {
        const email = buildBehaviorEmail('behavior_no_client_2h', { ...BASE, persona: null })
        expect(behaviorPersonaKey(null)).toBe('sin_persona')
        expect(email.subject).toContain(PERSONA_COPY.other.noun.singular)
        expect(email.text).not.toContain('paciente')
        expect(email.text).not.toContain('atleta')
    })
})

describe('link /join y mensaje de WhatsApp', () => {
    it('el mensaje reenviable lleva el `/join/{código}` del coach y su marca', () => {
        expect(joinUrl(BASE)).toBe('https://www.eva-app.cl/join/X5UD9X44')
        const message = buildWhatsappForwardText(BASE)
        expect(message).toContain('https://www.eva-app.cl/join/X5UD9X44')
        expect(message).toContain('Studio Fuerza')
    })

    it('los dos correos de invitación incluyen el link /join en el html y en el texto', () => {
        for (const key of ['behavior_no_client_2h', 'behavior_client_not_entered_48h'] as BehaviorTemplateKey[]) {
            const email = buildBehaviorEmail(key, BASE)
            expect(email.html).toContain('/join/X5UD9X44')
            expect(email.text).toContain('/join/X5UD9X44')
        }
    })

    // El link no puede ser un `<a>`: es texto para COPIAR y pegar en WhatsApp, y el único botón del
    // correo ya lo gasta el CTA del coach.
    it('el /join viaja como texto, no como botón', () => {
        const email = buildBehaviorEmail('behavior_client_not_entered_48h', BASE)
        expect(email.html).not.toContain('href="https://www.eva-app.cl/join/X5UD9X44"')
        expect(countLinks(email.html)).toBe(1)
    })

    it('sin `invite_code` el correo sale igual, sin bloque de WhatsApp y sin link roto', () => {
        const ctx = { ...BASE, inviteCode: null }
        expect(joinUrl(ctx)).toBeNull()
        expect(buildWhatsappForwardText(ctx)).toBeNull()
        const email = buildBehaviorEmail('behavior_no_client_2h', ctx)
        expect(email.html).not.toContain('/join/')
        expect(email.html.length).toBeGreaterThan(0)
    })

    // Sin `brand_name` el fallback es «tu app», NUNCA «tu marca»: el coach del día 1 todavía no
    // eligió una marca, pero app ya tiene (mismo criterio que `drip-templates.ts`).
    it('sin marca el copy dice «tu app»', () => {
        const email = buildBehaviorEmail('behavior_no_client_2h', { ...BASE, brandName: null })
        expect(email.text).toContain('tu app')
        expect(email.text).not.toContain('tu marca')
    })
})

describe('correo de +7 d — WhatsApp del owner (D13)', () => {
    it('sin OWNER_WHATSAPP_URL no inventa un número: ofrece responder el correo', () => {
        const email = buildBehaviorEmail('behavior_help_7d', { ...BASE, ownerWhatsappUrl: null })
        expect(email.text).toContain('Responde este correo')
        expect(email.text).not.toContain('WhatsApp')
        expect(email.html).toContain('/coach/guia')
    })

    it('con la env el CTA es el WhatsApp del owner', () => {
        const email = buildBehaviorEmail('behavior_help_7d', {
            ...BASE,
            ownerWhatsappUrl: 'https://wa.me/56900000000',
        })
        expect(email.html).toContain('https://wa.me/56900000000')
        expect(email.text).toContain('Escríbeme por WhatsApp')
    })
})

describe('seguridad del render', () => {
    it('el nombre y la marca del coach se escapan (van al HTML sin sanitizar de otra fuente)', () => {
        const email = buildBehaviorEmail('behavior_no_client_2h', {
            ...BASE,
            coachName: '<script>x</script>',
            brandName: 'Gym & "Co"',
        })
        expect(email.html).not.toContain('<script>')
        expect(email.html).toContain('&amp;')
    })

    it('sin nombre el saludo cae a «Coach», nunca a `null`', () => {
        const email = buildBehaviorEmail('behavior_aha', { ...BASE, coachName: null })
        expect(email.subject).toContain('Coach')
        expect(email.subject).not.toContain('null')
    })
})
