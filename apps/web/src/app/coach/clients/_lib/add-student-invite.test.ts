import { describe, expect, it } from 'vitest'
import { PERSONAS, PERSONA_COPY, type Persona } from '@eva/schemas'
import {
    artifactNoun,
    buildInviteMessage,
    buildWhatsappUrl,
    countRealClients,
    DEFAULT_INVITE_CHANNEL,
    firstContentCopy,
    INVITE_CHANNELS,
    isReadyToInvite,
    isValidStudentEmail,
    NAME_PLACEHOLDER,
    shouldUseGuidedStepper,
    stepperTitle,
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

describe('mensaje de WhatsApp por persona (@eva/schemas)', () => {
    it.each(PERSONAS)('la rama %s usa SU plantilla, con nombre y link resueltos', (persona: Persona) => {
        const msg = buildInviteMessage(persona, { name: 'Ana', link: LINK })
        expect(msg).toBe(
            PERSONA_COPY[persona].whatsappInvite.split('{nombre}').join('Ana').split('{link}').join(LINK)
        )
        expect(msg).not.toContain('{nombre}')
        expect(msg).not.toContain('{link}')
        expect(msg).toContain(LINK)
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
    it('con teléfono arma wa.me/<digits> y codifica el mensaje', () => {
        const url = buildWhatsappUrl({ persona: 'strength', name: 'Ana', link: LINK, phone: '+56 9 1234 5678' })
        expect(url.startsWith('https://wa.me/56912345678?text=')).toBe(true)
        expect(decodeURIComponent(url.split('?text=')[1])).toContain(LINK)
    })

    it('sin teléfono abre el selector de contactos (wa.me/?text=)', () => {
        expect(buildWhatsappUrl({ persona: 'nutrition', name: 'Ana', link: LINK }).startsWith('https://wa.me/?text=')).toBe(true)
        expect(buildWhatsappUrl({ persona: 'nutrition', name: 'Ana', link: LINK, phone: '' }).startsWith('https://wa.me/?text=')).toBe(true)
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
