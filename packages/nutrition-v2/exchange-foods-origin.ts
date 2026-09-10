/**
 * exchange-foods-origin — helpers PUROS del sheet «1 porción equivale a» del ALUMNO
 * (tren «Porciones a la chilena», W5.5 / SPEC §9.2 / D4-A).
 *
 * POR QUE EXISTE. El sheet pinta DOS secciones —«Genéricos · INTA · UDD» arriba y «Marcas y
 * productos» abajo— y el pie de atribución de Open Food Facts es CONDICIONAL. Esas tres
 * decisiones son las mismas en RN y en la web, y si cada superficie las escribe por su cuenta
 * driftan en silencio (la web filtrando por `brand`, RN por `isGeneric`, y el pie fijo en una
 * de las dos). Se deciden acá, una sola vez, sin React ni Supabase.
 *
 * EL ORDEN NO SE TOCA. El RPC ya ordena por `is_generic desc, portion_label_present desc,
 * name, id` DENTRO del `row_number()` y repetido en el `jsonb_agg` (DATA §8.2), o sea: la
 * lista llega ya en el orden que el alumno tiene que ver, y el genérico CON medida casera ya
 * viene antes que el genérico sin ella. Acá solo se PARTE en dos con `filter` —que es estable
 * en todos los motores— así que reordenar sería romper el trabajo del RPC.
 */

// El texto del crédito sale del copy canónico, no de un literal acá: si mañana cambia la
// atribución, cambia en UN lugar para las dos superficies (regla de `nutrition-portions-copy`).
import { PORTIONS_COPY } from './nutrition-portions-copy'

/**
 * Lo mínimo que el split necesita de una fila del read model
 * (`NutritionExchangeFoodReadSchema`). Se declara estructural para que el llamador pueda pasar
 * sus propias filas enriquecidas sin castear: el genérico `T` conserva el tipo de entrada.
 */
export type ExchangeFoodOriginLike = {
  /** `f.brand is null` según el RPC (W5). Opcional: el RPC viejo no la emite. */
  readonly isGeneric?: boolean
  /** Marca del alimento; `null` = genérico del catálogo (INTA / UDD / SMAE). */
  readonly brand?: string | null
}

/** Las dos secciones del sheet, en el orden en que se pintan. */
export type ExchangeFoodsByOrigin<T> = {
  /** Genéricos INTA / UDD: la sección de arriba, la que reemplaza al PDF de la nutricionista. */
  generic: T[]
  /** Marcas y productos (Open Food Facts en su mayoría): la sección de abajo. */
  brands: T[]
}

/**
 * ¿La fila es un genérico? Manda `isGeneric` cuando el RPC la emite; si NO viene (binario
 * nuevo contra el RPC viejo, o una fila de cache anterior a W5) se cae al mismo criterio que
 * el RPC usa para calcularla, `brand == null` —`==` a propósito: cubre `null` y `undefined`—.
 * Sin este fallback, un cache viejo mandaría TODA la lista a «Marcas y productos».
 */
function isGenericRow(row: ExchangeFoodOriginLike): boolean {
  if (typeof row.isGeneric === 'boolean') return row.isGeneric
  return row.brand == null
}

/**
 * Parte la lista de equivalencias en las dos secciones del sheet PRESERVANDO el orden de
 * entrada dentro de cada una (el que ya fijó el RPC).
 */
export function splitExchangeFoodsByOrigin<T extends ExchangeFoodOriginLike>(
  rows: readonly T[] | null | undefined,
): ExchangeFoodsByOrigin<T> {
  if (!rows || rows.length === 0) return { generic: [], brands: [] }
  const generic: T[] = []
  const brands: T[] = []
  for (const row of rows) {
    if (isGenericRow(row)) generic.push(row)
    else brands.push(row)
  }
  return { generic, brands }
}

/** Lo mínimo que el crédito de foto necesita de una fila: su licencia. */
export type ExchangeFoodLicenseLike = {
  /** `food_media.license` de la foto ganadora, o null/ausente si la fila no trae foto. */
  readonly imageLicense?: string | null
}

/**
 * Licencias que OBLIGAN a nombrar la fuente. Las fotos propias (`eva_owned`,
 * `eva_illustration`) y las autorizadas por proveedor (`supplier_authorized`) NO llevan pie:
 * declararles «CC BY-SA» sería una licencia falsa, igual que omitir el crédito de una foto de
 * Open Food Facts (S-08).
 */
const CREDITED_LICENSES: ReadonlySet<string> = new Set(['cc_by_sa', 'cc_by'])

/**
 * ¿Hay que pintar el pie «Fotos: Open Food Facts (CC BY-SA)»? Se calcula sobre las filas
 * VISIBLES —o sea, con el buscador ya aplicado— porque el pie describe lo que el alumno tiene
 * delante: si el filtro deja solo ilustraciones propias, el pie desaparece.
 */
export function photoCreditNeeded(
  rows: readonly ExchangeFoodLicenseLike[] | null | undefined,
): boolean {
  if (!rows) return false
  return rows.some((row) => isCreditedLicense(row.imageLicense))
}

/** ¿Esta licencia exige nombrar la fuente? */
function isCreditedLicense(license: string | null | undefined): boolean {
  return typeof license === 'string' && CREDITED_LICENSES.has(license)
}

/**
 * Fuente de UNA foto para el `accessibilityLabel` / `title` de su fila (singular: el pie de la
 * lista es otra cosa y va una sola vez, abajo). `null` cuando la licencia no exige crédito o
 * la fila no tiene foto — y `null` es «no agregues nada», no «fuente desconocida».
 */
export function photoSourceLabel(license: string | null | undefined): string | null {
  return isCreditedLicense(license) ? PORTIONS_COPY.student.sheetPhotoSource : null
}
