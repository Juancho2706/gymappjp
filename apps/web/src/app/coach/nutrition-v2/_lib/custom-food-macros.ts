/**
 * Puerta de UX del alta de alimentos: kcal / P / C / G obligatorios.
 *
 * Regla del owner 2026-08-05, escrita como invariante 6 de la SPEC de T2.3: el formulario de
 * creacion NO puede dejar guardar un alimento individual sin kcal/P/C/G. Hoy los cuatro inputs
 * son `required`, asi que el caso "campo en blanco" ya estaba cubierto por el navegador; lo que
 * quedaba abierto es lo que `required` no ve: valores fuera de rango y, sobre todo, el alimento
 * con los cuatro numeros en 0, que se guarda igual y entra al plan sin aportar nada.
 *
 * Modulo PURO a proposito (sin React, sin FormData, sin Supabase):
 *  - el chequeo corre en el unico sheet de alta que queda, el del hub V2 (T2.3 F5 retiro
 *    `/coach/foods` y mudo el sheet al hub);
 *  - el contrato server de crear (`saveCustomFood`, V1) NO se toca en esta tanda, asi que esta
 *    validacion es UX, no autorizacion: el techo real sigue siendo `CustomFoodSchema` en el
 *    servidor. Por eso los limites de abajo son EXACTAMENTE los suyos (kcal <= 9000, macros
 *    <= 500, nada negativo): adelantar el mismo veredicto sin round-trip, nunca uno distinto.
 */

export const CUSTOM_FOOD_MACRO_FIELDS = ['calories', 'protein', 'carbs', 'fats'] as const

/** Nombre del campo en el formulario (`<input name=...>`), no un id de UI. */
export type CustomFoodMacroField = (typeof CUSTOM_FOOD_MACRO_FIELDS)[number]

/** Lo que llega del formulario: texto crudo, todavia sin parsear. */
export type CustomFoodMacroDraft = Record<CustomFoodMacroField, string>

export type CustomFoodMacroIssue = {
  /** Campo al que conviene mandar el foco. Nunca null: el caso "todo en 0" apunta a kcal. */
  field: CustomFoodMacroField
  message: string
}

/** Limites del servidor (`CustomFoodSchema` en `packages/schemas/nutrition.ts`). */
export const CUSTOM_FOOD_MACRO_MAX: Record<CustomFoodMacroField, number> = {
  calories: 9000,
  protein: 500,
  carbs: 500,
  fats: 500,
}

const COPY: Record<
  CustomFoodMacroField,
  { missing: string; invalid: string; negative: string; tooBig: string }
> = {
  calories: {
    missing: 'Ingresa las calorías por 100 g.',
    invalid: 'Las calorías deben ser un número.',
    negative: 'Las calorías no pueden ser negativas.',
    tooBig: 'Máximo 9000 kcal por 100 g.',
  },
  protein: {
    missing: 'Ingresa la proteína por 100 g (pon 0 si no tiene).',
    invalid: 'La proteína debe ser un número.',
    negative: 'La proteína no puede ser negativa.',
    tooBig: 'Máximo 500 g de proteína por 100 g.',
  },
  carbs: {
    missing: 'Ingresa los carbohidratos por 100 g (pon 0 si no tiene).',
    invalid: 'Los carbohidratos deben ser un número.',
    negative: 'Los carbohidratos no pueden ser negativos.',
    tooBig: 'Máximo 500 g de carbohidratos por 100 g.',
  },
  fats: {
    missing: 'Ingresa las grasas por 100 g (pon 0 si no tiene).',
    invalid: 'Las grasas deben ser un número.',
    negative: 'Las grasas no pueden ser negativas.',
    tooBig: 'Máximo 500 g de grasa por 100 g.',
  },
}

export const CUSTOM_FOOD_ALL_ZERO_MESSAGE =
  'Un alimento no puede quedar sin macros: ingresa al menos las calorías o uno de los macros.'

type ParsedMacro = { state: 'empty' } | { state: 'invalid' } | { state: 'value'; value: number }

/**
 * `<input type="number">` entrega siempre punto decimal o cadena vacia, pero un pegado, un
 * autofill o un consumidor no-DOM pueden traer coma: se normaliza antes de `Number`.
 */
export function parseCustomFoodMacro(raw: string): ParsedMacro {
  const trimmed = raw.trim().replace(',', '.')
  if (trimmed === '') return { state: 'empty' }
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return { state: 'invalid' }
  return { state: 'value', value }
}

/**
 * Devuelve el PRIMER problema del cuarteto kcal/P/C/G, o `null` si se puede guardar.
 *
 * El orden importa: primero cada campo por separado (falta / no es numero / negativo / pasado
 * de rango) siguiendo el orden en que se ven en el formulario, y recien al final el chequeo
 * cruzado "los cuatro en 0" — un mensaje global no sirve de nada mientras haya un campo
 * concreto que arreglar.
 */
export function validateCustomFoodMacros(draft: CustomFoodMacroDraft): CustomFoodMacroIssue | null {
  const values: number[] = []

  for (const field of CUSTOM_FOOD_MACRO_FIELDS) {
    const parsed = parseCustomFoodMacro(draft[field] ?? '')
    if (parsed.state === 'empty') return { field, message: COPY[field].missing }
    if (parsed.state === 'invalid') return { field, message: COPY[field].invalid }
    if (parsed.value < 0) return { field, message: COPY[field].negative }
    if (parsed.value > CUSTOM_FOOD_MACRO_MAX[field]) return { field, message: COPY[field].tooBig }
    values.push(parsed.value)
  }

  if (values.every((value) => value === 0)) {
    return { field: 'calories', message: CUSTOM_FOOD_ALL_ZERO_MESSAGE }
  }

  return null
}

/**
 * Lee el cuarteto del `FormData` del alta. Los nombres son los `<input name=...>` del sheet y
 * los que `saveCustomFood` vuelve a leer server-side: tenerlos en un solo lugar evita que un
 * rename deje la validacion mirando campos que ya no existen (siempre vacios ⇒ siempre error).
 */
export function readCustomFoodMacroDraft(formData: FormData): CustomFoodMacroDraft {
  const read = (field: CustomFoodMacroField): string => {
    const value = formData.get(field)
    return typeof value === 'string' ? value : ''
  }
  return {
    calories: read('calories'),
    protein: read('protein'),
    carbs: read('carbs'),
    fats: read('fats'),
  }
}
