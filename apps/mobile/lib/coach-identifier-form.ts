/**
 * Contrato de copy y de estado del form de identificador de coach.
 * Normativa: `docs/specs/entrada-dark-v1/DESIGN-SPEC.md` §3.3 (sheet del morph) y §3.4
 * (pantalla `/alumno/codigo`).
 *
 * Vive aparte y **sin un solo import de React Native** a proposito: es la parte del form
 * que se puede testear desde `tests/` de la raiz sin transformar RN (el gotcha de CI: un
 * test raiz que importa una dependencia solo-mobile pasa local por hoisteo y falla en CI).
 *
 * Las dos superficies —el sheet del selector y la ruta `/alumno/codigo`— montan el MISMO
 * componente, asi que este modulo es tambien el contrato de que los mensajes no se
 * bifurquen entre ellas.
 */

import { parseCoachIdentifier } from '@eva/schemas'

/**
 * Los 4 fallos que el form distingue. `format` y `clipboard` son locales; los otros dos vienen
 * del fetch. `clipboard` existe porque el boton fantasma no puede reusar `format`: cuando el
 * portapapeles esta vacio (o no trae un enlace de EVA) hablar de "5 caracteres" es mentira.
 */
export type CoachIdentifierErrorKind = 'format' | 'not-found' | 'network' | 'clipboard'

/** Helper en reposo (§3.4). El mensaje de error lo REEMPLAZA, no se apila. */
export const COACH_IDENTIFIER_HELPER = 'Letras y números, sin espacios.'

/** Copy de error por tipo. `null` = no hay error, se muestra el helper. */
export function coachIdentifierErrorCopy(kind: CoachIdentifierErrorKind | null): string | null {
  switch (kind) {
    case 'format':
      return 'Revisa el dato. El código tiene 5 caracteres; también puedes pegar el enlace completo.'
    case 'not-found':
      return 'No encontramos ese coach. Revisa el código o pídele un enlace nuevo.'
    case 'network':
      return 'No pudimos conectarnos. Comprueba tu internet e inténtalo otra vez.'
    case 'clipboard':
      return 'No encontramos un enlace de EVA en tu portapapeles. Cópialo del mensaje de tu coach e inténtalo otra vez.'
    default:
      return null
  }
}

/**
 * El CTA se habilita con algo escrito y sin resolucion en curso. El trim es parte del
 * contrato: un campo con solo espacios NO habilita el boton (el normalizador de
 * identificador lo rechazaria despues, y el usuario se comeria un shake gratis).
 */
export function canSubmitCoachIdentifier(value: string, loading: boolean): boolean {
  return Boolean(value.trim()) && !loading
}

export type ClipboardIdentifierResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'unparsable' }

/**
 * Traduce el portapapeles al identificador que se va a escribir en el campo.
 *
 * Devuelve el valor YA normalizado (codigo en MAYUSCULAS, slug en minusculas) para que el input
 * muestre `CRDZ9` y no la URL entera: el campo es mono 19 pt con tracking .13em, asi que una URL
 * larga solo deja ver su cola (el bug reportado: se leia «…are_card&k=placa»).
 *
 * Solo clasifica FORMA, no alcance: un `/join/<codigo>` puede ser de un equipo u organizacion, y
 * en ese caso el RPC de branding devolvera vacio y el form mostrara `not-found`. Ese error es
 * honesto; resolver alcances en el cliente no es asunto de este modulo.
 */
export function resolveClipboardIdentifier(clip: string): ClipboardIdentifierResult {
  const trimmed = clip.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }

  const parsed = parseCoachIdentifier(trimmed)
  if (parsed.type === 'invalid') return { ok: false, reason: 'unparsable' }

  return { ok: true, value: parsed.value }
}
