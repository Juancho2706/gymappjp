import { formatWhatsappInvite, type Persona } from '@eva/schemas'

/**
 * Texto con el que el coach manda el acceso a un alumno (WhatsApp / hoja de compartir).
 *
 * Lógica PURA: sin react-native, para que `tests/mobile` la cubra con el runner del repo.
 *
 * Por qué existe (auditoría onboarding v2, 22-08): `lib/client-actions.ts` tenía el texto
 * hardcodeado «…tu acceso a la app de EVA» — una fuga de marca en white-label (el coach Pro con
 * marca propia le escribía a su alumno hablando de EVA) y un copy que no coincidía con el de la
 * web. La plantilla canónica vive en `@eva/schemas` (`PERSONA_COPY[persona].whatsappInvite`) y
 * habla de «mi app», que es lo que vale en cualquier marca.
 *
 * Sin persona (coach anterior al onboarding v2, o caché todavía fría) se usa la plantilla de
 * `other`: neutra, sin nombre de producto.
 */
export const DEFAULT_INVITE_PERSONA: Persona = 'other'

export function clientInviteMessage(input: {
    persona: Persona | null | undefined
    clientName: string
    loginUrl: string
}): string {
    const nombre = input.clientName.trim() || 'hola'
    return formatWhatsappInvite(input.persona ?? DEFAULT_INVITE_PERSONA, {
        nombre,
        link: input.loginUrl,
    })
}
