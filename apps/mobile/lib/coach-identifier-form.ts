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

/** Los 3 fallos que el form distingue. `format` es local; los otros dos vienen del fetch. */
export type CoachIdentifierErrorKind = 'format' | 'not-found' | 'network'

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
