/**
 * Copy con el que el coach le pasa a un alumno la CLAVE TEMPORAL recién generada
 * («Resetear contraseña» → diálogo «Clave temporal lista»).
 *
 * Lógica PURA (sin react-native, sin expo) para que `tests/mobile` la cubra con el runner de la
 * raíz aunque viva en `apps/mobile`.
 *
 * Por qué existe: hasta el 22-08 el diálogo del detalle de alumno pintaba la clave como LABEL de un
 * `Button` secundario cuyo `onPress` copiaba en silencio — nadie entendía que era un botón y no
 * había ningún feedback. Al rediseñarlo con «Copiar» / «Enviar por WhatsApp» hacía falta un texto
 * canónico, y el texto es lo único que un test puede pinnear.
 *
 * White-label: el mensaje habla de «la app», nunca de EVA. El coach Pro con marca propia le escribe
 * a su alumna desde SU marca; nombrar el producto acá es una fuga (misma regla que
 * `client-invite-copy.ts`).
 */

/** Igual que el invite: sin nombre, «Hola hola» es feo pero no deja un «Hola ,» colgando. */
const FALLBACK_NAME = 'hola'

/** Primer nombre del alumno, que es lo que el diálogo muestra en pantalla («Compartila con Ana»). */
export function tempPasswordFirstName(clientName: string): string {
  const trimmed = clientName.trim().replace(/\s+/g, ' ')
  if (!trimmed) return FALLBACK_NAME
  return trimmed.split(' ')[0]
}

/** Texto único del mensaje (WhatsApp y hoja de compartir comparten copy: un solo contrato). */
export function tempPasswordMessage(input: { clientName: string; password: string }): string {
  const nombre = tempPasswordFirstName(input.clientName)
  return `Hola ${nombre}, tu clave temporal para entrar a la app es ${input.password.trim()}. Cámbiala al ingresar.`
}

/**
 * Mínimo de dígitos para considerar que el alumno TIENE teléfono usable en `wa.me`.
 * Mismo umbral que el resto del detalle de alumno (`ProfileFloatingActions`, barra flotante).
 */
const MIN_PHONE_DIGITS = 10

/** `null` = no hay teléfono usable ⇒ el diálogo cae a la hoja de compartir del sistema. */
export function tempPasswordWhatsappUrl(input: {
  phone: string | null | undefined
  clientName: string
  password: string
}): string | null {
  const digits = (input.phone ?? '').replace(/\D/g, '')
  if (digits.length < MIN_PHONE_DIGITS) return null
  const text = tempPasswordMessage({ clientName: input.clientName, password: input.password })
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}
