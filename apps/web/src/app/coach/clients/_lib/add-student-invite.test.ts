import { describe, expect, it } from 'vitest'
import { PERSONAS, PERSONA_COPY, type Persona } from '@eva/schemas'
import {
    artifactNoun,
    buildInviteMessage,
    buildWhatsappUrl,
    canSendCredentialByWhatsapp,
    countRealClients,
    DEFAULT_INVITE_CHANNEL,
    firstContentCopy,
    INVITE_CHANNELS,
    inviteBlockReason,
    isCoachOwnEmail,
    isCoachOwnInbox,
    isReadyToInvite,
    isValidStudentEmail,
    NAME_PLACEHOLDER,
    selfInviteNote,
    shouldUseGuidedStepper,
    stepperTitle,
    whatsappRecipientDigits,
} from './add-student-invite'

const LINK = 'https://www.eva-app.cl/c/AB3KP/login'

describe('countRealClients — el alumno de ejemplo no cuenta (onboarding v2 F1.3)', () => {
    it('ignora las filas is_demo', () => {
        expect(countRealClients([{ is_demo: true }, { is_demo: false }, {}])).toBe(2)
    })

    it('un coach con SOLO el demo tiene cero alumnos reales', () => {
        expect(countRealClients([{ is_demo: true }])).toBe(0)
    })

    it('lista vacía, null y undefined valen cero', () => {
        expect(countRealClients([])).toBe(0)
        expect(countRealClients(null)).toBe(0)
        expect(countRealClients(undefined)).toBe(0)
    })
})

describe('decisión primer alta ⇒ stepper / siguientes ⇒ modal (F4.1)', () => {
    it('sin alumnos reales manda al stepper guiado', () => {
        expect(shouldUseGuidedStepper(0)).toBe(true)
    })

    it('con el demo sembrado y nadie más, sigue siendo el primer alta', () => {
        expect(shouldUseGuidedStepper(countRealClients([{ is_demo: true }]))).toBe(true)
    })

    it('con un alumno real ya dado de alta, el modal de siempre', () => {
        expect(shouldUseGuidedStepper(1)).toBe(false)
        expect(shouldUseGuidedStepper(25)).toBe(false)
    })
})

describe('CTA «Invitar a …» — habilitación', () => {
    it('exige nombre, correo y confirmación de edad', () => {
        expect(isReadyToInvite({ fullName: '', email: '', ageConfirmed: false })).toBe(false)
        expect(isReadyToInvite({ fullName: 'Ana Ruiz', email: '', ageConfirmed: true })).toBe(false)
        expect(isReadyToInvite({ fullName: '', email: 'ana@mail.com', ageConfirmed: true })).toBe(false)
        expect(isReadyToInvite({ fullName: 'Ana Ruiz', email: 'ana@mail.com', ageConfirmed: false })).toBe(false)
        expect(isReadyToInvite({ fullName: 'Ana Ruiz', email: 'ana@mail.com', ageConfirmed: true })).toBe(true)
    })

    it('un nombre de una sola letra no alcanza (el schema del servidor pide 2)', () => {
        expect(isReadyToInvite({ fullName: 'A', email: 'ana@mail.com', ageConfirmed: true })).toBe(false)
    })

    it('rechaza correos con forma inválida antes de gastar un submit', () => {
        expect(isValidStudentEmail('ana@mail.com')).toBe(true)
        expect(isValidStudentEmail('  ana@mail.com  ')).toBe(true)
        expect(isValidStudentEmail('ana@mail')).toBe(false)
        expect(isValidStudentEmail('ana mail.com')).toBe(false)
        expect(isValidStudentEmail('')).toBe(false)
    })
})

describe('el coach que se agrega a sí mismo (SPEC «Vive tu app» directo §5)', () => {
    const COACH = 'jp@correo.com'

    it('con SU propio correo el CTA no se habilita y la razón es propia', () => {
        const draft = { fullName: 'Job Palacios', email: ' JP@Correo.com ', ageConfirmed: true, coachEmail: COACH }
        expect(isCoachOwnEmail(draft.email, COACH)).toBe(true)
        expect(isReadyToInvite(draft)).toBe(false)
        expect(inviteBlockReason(draft)).toBe('own_email')
        // Sin el correo del coach cargado nada se bloquea: la comparación es una cortesía, no
        // una autorización (el servidor repite el chequeo con su propio `user.email`).
        expect(isReadyToInvite({ ...draft, coachEmail: null })).toBe(true)
        expect(inviteBlockReason({ ...draft, coachEmail: null })).toBeNull()
        expect(isCoachOwnEmail('ana@correo.com', COACH)).toBe(false)
        expect(isCoachOwnEmail('ana@correo.com', '   ')).toBe(false)
    })

    it('la razón distingue «falta algo» de «ese eres tú»', () => {
        expect(inviteBlockReason({ fullName: '', email: '', ageConfirmed: false, coachEmail: COACH })).toBe('missing')
        expect(
            inviteBlockReason({ fullName: 'Ana Ruiz', email: 'ana@correo.com', ageConfirmed: true, coachEmail: COACH })
        ).toBeNull()
        // Correo propio + nombre a medias: gana el aviso útil, no el genérico.
        expect(inviteBlockReason({ fullName: '', email: COACH, ageConfirmed: false, coachEmail: COACH })).toBe('own_email')
    })

    it('la variante del MISMO buzón (+alias, puntos de Gmail) avisa pero no bloquea', () => {
        // `check_platform_email_availability` la deja pasar (deuda declarada): bloquear el CTA
        // mentiría sobre lo que el servidor va a hacer.
        expect(isCoachOwnInbox('j.p+alumno@gmail.com', 'jp@gmail.com')).toBe(true)
        expect(isCoachOwnEmail('j.p+alumno@gmail.com', 'jp@gmail.com')).toBe(false)
        expect(
            isReadyToInvite({ fullName: 'Ana Ruiz', email: 'j.p+alumno@gmail.com', ageConfirmed: true, coachEmail: 'jp@gmail.com' })
        ).toBe(true)
        expect(isCoachOwnInbox('otra@gmail.com', 'jp@gmail.com')).toBe(false)
        expect(isCoachOwnInbox('', 'jp@gmail.com')).toBe(false)
    })

    it('la nota manda a «Vive tu app» y solo remata con el cupo cuando es verdad', () => {
        const free = selfInviteNote('paciente', { showsCupo: true })
        expect(free).toContain('Vive tu app')
        expect(free).toContain('paciente')
        expect(free).toContain('No gasta cupo.')
        const pro = selfInviteNote('alumno', { showsCupo: false })
        expect(pro).toContain('Vive tu app')
        expect(pro).not.toContain('cupo')
        // Cero venta dentro del flujo (regla 7 de la SPEC): ni plan, ni precio, ni tier.
        for (const note of [free, pro]) {
            expect(note).not.toMatch(/plan|precio|\$/i)
        }
    })
})

describe('mensaje de WhatsApp por persona (@eva/schemas)', () => {
    it.each(PERSONAS)('la rama %s usa SU plantilla, con nombre y link resueltos', (persona: Persona) => {
        // Sin credencial pasada: la variante honesta («te mandé tu clave al correo»).
        const msg = buildInviteMessage(persona, { name: 'Ana', link: LINK })
        expect(msg).toBe(
            PERSONA_COPY[persona].whatsappInviteSinClave.split('{nombre}').join('Ana').split('{link}').join(LINK)
        )
        expect(msg).not.toContain('{nombre}')
        expect(msg).not.toContain('{link}')
        expect(msg).toContain(LINK)
    })

    it.each(PERSONAS)('la rama %s con correo y clave arma la variante con credencial', (persona: Persona) => {
        const msg = buildInviteMessage(persona, {
            name: 'Ana',
            link: LINK,
            email: 'ana@correo.com',
            tempPassword: 'Ru7-mesa',
        })
        expect(msg).toBe(
            PERSONA_COPY[persona].whatsappInvite
                .split('{nombre}').join('Ana')
                .split('{link}').join(LINK)
                .split('{correo}').join('ana@correo.com')
                .split('{clave}').join('Ru7-mesa')
        )
        expect(msg).not.toMatch(/\{[a-zA-Z]+\}/)
    })

    it('las cuatro personas con demo NO comparten el mismo mensaje', () => {
        const msgs = new Set(
            (['strength', 'nutrition', 'rehab', 'endurance'] as Persona[]).map((p) =>
                buildInviteMessage(p, { name: 'Ana', link: LINK })
            )
        )
        expect(msgs.size).toBe(4)
    })

    it('sin nombre escrito la vista previa se lee como plantilla, no como mensaje roto', () => {
        expect(buildInviteMessage('strength', { name: '   ', link: LINK })).toContain(NAME_PLACEHOLDER)
    })
})

describe('buildWhatsappUrl', () => {
    const CREDENTIALS = { email: 'ana@correo.com', tempPassword: 'Ru7-mesa' }

    it('con teléfono arma wa.me/<digits> y codifica el mensaje', () => {
        const url = buildWhatsappUrl({ persona: 'strength', name: 'Ana', link: LINK, phone: '+56 9 1234 5678' })
        expect(url.startsWith('https://wa.me/56912345678?text=')).toBe(true)
        expect(decodeURIComponent(url.split('?text=')[1])).toContain(LINK)
    })

    it('sin teléfono abre el selector de contactos (wa.me/?text=)', () => {
        expect(buildWhatsappUrl({ persona: 'nutrition', name: 'Ana', link: LINK }).startsWith('https://wa.me/?text=')).toBe(true)
        expect(buildWhatsappUrl({ persona: 'nutrition', name: 'Ana', link: LINK, phone: '' }).startsWith('https://wa.me/?text=')).toBe(true)
    })

    // Callejón 4: el `{link}` es `/c/{código}/login`, que pide correo Y contraseña. Sin la clave en
    // el mismo chat, el alumno tenía que ir a buscarla a su casilla — el salto de app que mató a
    // 3 de 8 invitados.
    it('con teléfono lleva usuario y clave', () => {
        const url = buildWhatsappUrl({
            persona: 'strength',
            name: 'Ana',
            link: LINK,
            phone: '+56 9 1234 5678',
            ...CREDENTIALS,
        })
        expect(url.startsWith('https://wa.me/56912345678?text=')).toBe(true)
        const text = decodeURIComponent(url.split('?text=')[1])
        expect(text).toContain(LINK)
        expect(text).toContain('Tu usuario: ana@correo.com')
        expect(text).toContain('Tu clave temporal: Ru7-mesa')
    })

    // Regla 4 de SPEC §5: `wa.me/?text=` abre el selector de contactos y un toque equivocado
    // entrega acceso a datos de salud de un tercero (Ley 21.719). Ni el filtro ni el copy son
    // opcionales: sin teléfono la credencial NO se arma, aunque el call site la haya pasado.
    it('sin teléfono no lleva credencial y menciona el correo', () => {
        for (const phone of [undefined, null, '', '   ', 'sin numero']) {
            const url = buildWhatsappUrl({ persona: 'strength', name: 'Ana', link: LINK, phone, ...CREDENTIALS })
            expect(url.startsWith('https://wa.me/?text=')).toBe(true)
            const text = decodeURIComponent(url.split('?text=')[1])
            expect(text).toContain(LINK)
            expect(text).not.toContain('Ru7-mesa')
            expect(text).not.toContain('ana@correo.com')
            expect(text).not.toContain('clave temporal')
            expect(text).toContain('te mandé tu clave al correo')
        }
    })

    it('el predicado de la regla 4 es el mismo que aplica la URL', () => {
        expect(canSendCredentialByWhatsapp('+56 9 1234 5678')).toBe(true)
        expect(canSendCredentialByWhatsapp('')).toBe(false)
        expect(canSendCredentialByWhatsapp(null)).toBe(false)
        expect(canSendCredentialByWhatsapp(undefined)).toBe(false)
        expect(canSendCredentialByWhatsapp('  +  ')).toBe(false)
        expect(whatsappRecipientDigits('+56 9 1234 5678')).toBe('56912345678')
    })

    // Umbral espejo del RN (MIN_PHONE_DIGITS = 10): un número a medias no es un destinatario —
    // `wa.me/<basura>` abriría un chat inválido CON la clave en la URL. Degrada al selector SIN
    // credencial, igual que la app.
    it('un teléfono de menos de 10 dígitos degrada al selector sin credencial', () => {
        for (const phone of ['123', '+56 9 123', '569123456']) {
            expect(canSendCredentialByWhatsapp(phone)).toBe(false)
            const url = buildWhatsappUrl({ persona: 'strength', name: 'Ana', link: LINK, phone, ...CREDENTIALS })
            expect(url.startsWith('https://wa.me/?text=')).toBe(true)
            const text = decodeURIComponent(url.split('?text=')[1])
            expect(text).not.toContain('Ru7-mesa')
            expect(text).toContain('te mandé tu clave al correo')
        }
        expect(canSendCredentialByWhatsapp('5691234567')).toBe(true)
    })
})

describe('tercera columna «Lo que va a ver»', () => {
    it('con contenido ya armado muestra su nombre y lo atribuye al demo', () => {
        const copy = firstContentCopy('strength', { programName: 'Full body 3 días', demoName: 'Matías' })
        expect(copy.title).toBe('Full body 3 días')
        expect(copy.body).toContain('Matías')
    })

    it('sin contenido no promete nada: dice cuándo aparece', () => {
        const copy = firstContentCopy('strength', { programName: null, demoName: null })
        expect(copy.title).toBeNull()
        expect(copy.body).toContain('Su rutina')
        expect(copy.body).toContain('asignes')
    })

    it('el artefacto habla el idioma de la persona', () => {
        expect(artifactNoun('nutrition')).toBe('su pauta')
        expect(artifactNoun('rehab')).toBe('sus ejercicios')
        expect(artifactNoun('endurance')).toBe('su semana de entrenamiento')
        expect(artifactNoun('strength')).toBe('su rutina')
        expect(artifactNoun('other')).toBe('su plan')
    })
})

describe('vocabulario del título', () => {
    it('usa el sustantivo de la persona', () => {
        expect(stepperTitle('strength')).toBe('Suma tu primer alumno en 3 pasos')
        expect(stepperTitle('nutrition')).toBe('Suma tu primer paciente en 3 pasos')
        expect(stepperTitle('endurance')).toBe('Suma tu primer atleta en 3 pasos')
    })
})

describe('canales', () => {
    it('son exactamente los tres de la columna «Cómo le llega», con WhatsApp primero', () => {
        expect(INVITE_CHANNELS).toEqual(['whatsapp', 'email', 'code'])
        expect(INVITE_CHANNELS).toContain(DEFAULT_INVITE_CHANNEL)
    })
})
