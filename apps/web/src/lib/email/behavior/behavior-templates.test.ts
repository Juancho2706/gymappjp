import { describe, expect, it } from 'vitest'
import { PERSONAS, PERSONA_COPY, type Persona } from '@eva/schemas'
import { BEHAVIOR_TEMPLATE_KEYS } from './behavior-triggers'
import {
    BEHAVIOR_CTA_GREEN,
    BEHAVIOR_FOOTER,
    BEHAVIOR_SIGNATURE_NAME,
    behaviorPersonaKey,
    buildBehaviorEmail,
    type BehaviorEmailContext,
} from './behavior-templates'

/**
 * Plantillas de W6 v2 (plan «Correos y activación», aprobadas el 01-10). Lo que se pinnea:
 *  · las 5 keys × las 5 personas × la rama SIN PERSONA renderizan asunto, vista previa, texto y html;
 *  · el vocabulario sale de `PERSONA_COPY` («paciente» para nutri/rehab, «atleta» para endurance);
 *  · NINGÚN correo manda a `/join` (desde el 21-08 ese link deja una solicitud, no un alumno): el día 1
 *    lleva al alta directa;
 *  · UN solo `<a>` por correo y el pie legal siempre;
 *  · la firma es del equipo («El equipo de EVA»), nunca de una persona;
 *  · el CTA usa el verde con contraste AA, no el verde EVA con letra blanca (2,5 a 1);
 *  · el correo de +7 d no inventa un WhatsApp cuando no hay número.
 */

const BASE: BehaviorEmailContext = {
    coachName: 'Josefa Díaz',
    brandName: 'Studio Fuerza',
    brandColor: '#7C3AED',
    persona: 'strength',
    isFree: true,
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
            it(`${label} · ${key} renderiza asunto, vista previa, texto y html`, () => {
                const email = buildBehaviorEmail(key, { ...BASE, persona })

                expect(email.key).toBe(key)
                expect(email.subject.length).toBeGreaterThan(0)
                expect(email.preheader.length).toBeGreaterThan(0)
                expect(email.text.length).toBeGreaterThan(0)
                expect(email.html).toContain('<!DOCTYPE html>')
                // Un `{token}` sin reemplazar es un correo roto que igual sale.
                expect(email.subject).not.toMatch(/[{}]/)
                expect(email.text).not.toMatch(/\{[a-z]+\}/)
                // Pie legal en TODOS (Ley 19.496 art. 28 B: la serie la inicia EVA).
                expect(email.html).toContain('Enviado por <strong>EVA Fitness Platform</strong>')
                expect(email.html).toContain(BEHAVIOR_FOOTER)
                expect(email.text).toContain('Enviado por EVA')
                expect(email.text).toContain(BEHAVIOR_FOOTER)
                // Firma del equipo, en los dos formatos.
                expect(email.html).toContain(BEHAVIOR_SIGNATURE_NAME)
                expect(email.text).toContain(BEHAVIOR_SIGNATURE_NAME)
                // Un solo botón por correo.
                expect(countLinks(email.html)).toBe(1)
                // `/join` deja una solicitud desde el 21-08: ningún correo puede prometer que registra.
                expect(email.html).not.toContain('/join/')
                expect(email.text).not.toContain('/join/')
                expect(email.text).not.toContain('se registra solo')
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

    // «plan» es masculino: «Armarla desde mi guía» y «deja lista su primera plan» estaban mal.
    it('la concordancia sigue al artefacto: «plan» masculino, «rutina» femenino', () => {
        const plan = buildBehaviorEmail('behavior_no_return_24h', { ...BASE, persona: null })
        expect(plan.subject).toBe('Josefa, deja listo su primer plan')
        expect(plan.text).toContain('Ármalo desde mi guía')
        const rutina = buildBehaviorEmail('behavior_no_return_24h', { ...BASE, persona: 'strength' })
        expect(rutina.subject).toBe('Josefa, deja lista su primera rutina')
        expect(rutina.text).toContain('Ármala desde mi guía')
    })
})

describe('destinos de los botones', () => {
    it('el día 1 abre el alta directa en 3 pasos', () => {
        const email = buildBehaviorEmail('behavior_no_client_2h', BASE)
        expect(email.html).toContain('href="https://www.eva-app.cl/coach/clients?invite=1"')
        expect(email.text).toContain('https://www.eva-app.cl/coach/clients?invite=1')
    })

    it('el día 3 abre la guía', () => {
        expect(buildBehaviorEmail('behavior_no_return_24h', BASE).html).toContain(
            'href="https://www.eva-app.cl/coach/guia"'
        )
    })

    it('el de 48 h explica cómo reenviar el acceso de verdad (Resetear contraseña → WhatsApp)', () => {
        const email = buildBehaviorEmail('behavior_client_not_entered_48h', BASE)
        expect(email.html).toContain('href="https://www.eva-app.cl/coach/clients"')
        expect(email.text).toContain('«Resetear contraseña»')
    })

    it('con el alumno conocido, el de 48 h abre su ficha', () => {
        const email = buildBehaviorEmail('behavior_client_not_entered_48h', { ...BASE, pendingClientId: 'abc-123' })
        expect(email.html).toContain('href="https://www.eva-app.cl/coach/clients/abc-123"')
        expect(email.text).toContain('En su ficha, «Reenviarle el acceso»')
    })

    it('el CTA usa el verde con contraste AA', () => {
        const email = buildBehaviorEmail('behavior_no_client_2h', BASE)
        expect(email.html).toContain(`background-color:${BEHAVIOR_CTA_GREEN}`)
    })
})

describe('vista previa de la app y cupo', () => {
    it('el día 1 muestra la app del alumno con la marca del coach', () => {
        const email = buildBehaviorEmail('behavior_no_client_2h', BASE)
        expect(email.html).toContain('Studio Fuerza')
        expect(email.html).toContain('Así ve tu alumno tu app')
    })

    // Sin `brand_name` el fallback es «tu app», NUNCA «tu marca».
    it('sin marca el copy dice «tu app»', () => {
        const email = buildBehaviorEmail('behavior_client_not_entered_48h', { ...BASE, brandName: null })
        expect(email.text).toContain('tu app')
        expect(email.text).not.toContain('tu marca')
    })

    // En la app de iPhone no puede haber nada de pago: el correo dice «en eva-app.cl».
    it('el aha de un coach Gratis menciona el cupo y dónde ver opciones, sin precio', () => {
        const email = buildBehaviorEmail('behavior_aha', BASE)
        expect(email.text).toContain('Tu plan Gratis incluye 1 alumno')
        expect(email.text).toContain('en eva-app.cl')
        expect(email.text).not.toMatch(/\$\s?\d/)
        expect(buildBehaviorEmail('behavior_aha', { ...BASE, isFree: false }).text).not.toContain('Gratis')
    })
})

describe('correo de +7 d — WhatsApp de EVA (D13)', () => {
    it('sin número no inventa uno: ofrece responder el correo y vuelve a la guía', () => {
        const email = buildBehaviorEmail('behavior_help_7d', { ...BASE, ownerWhatsappUrl: null })
        expect(email.text).toContain('responde este correo')
        expect(email.text).not.toContain('Escribirnos por WhatsApp')
        expect(email.html).toContain('/coach/guia')
    })

    it('con número, el botón abre WhatsApp con el mensaje escrito y saludo neutro', () => {
        const email = buildBehaviorEmail('behavior_help_7d', {
            ...BASE,
            ownerWhatsappUrl: 'https://wa.me/56990756670',
        })
        expect(email.subject).toBe('Josefa, ¿te ayudamos a partir?')
        expect(email.html).toContain('https://wa.me/56990756670?text=')
        expect(email.text).toContain('Escribirnos por WhatsApp')
        expect(decodeURIComponent(email.text)).toContain('Hola, soy Josefa de Studio Fuerza.')
        expect(email.text).not.toContain('Juan')
    })
})

describe('seguridad del render', () => {
    it('el nombre y la marca del coach se escapan', () => {
        const email = buildBehaviorEmail('behavior_no_client_2h', {
            ...BASE,
            coachName: '<script>x</script>',
            brandName: 'Gym & "Co"',
        })
        expect(email.html).not.toContain('<script>')
        expect(email.html).toContain('Gym &amp; &quot;Co&quot;')
    })

    it('sin nombre el saludo cae a «Coach», nunca a `null`', () => {
        const email = buildBehaviorEmail('behavior_aha', { ...BASE, coachName: null })
        expect(email.subject).toContain('Coach')
        expect(email.subject).not.toContain('null')
    })
})
