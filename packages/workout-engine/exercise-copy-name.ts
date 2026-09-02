/**
 * Nombre libre para el CLON de un ejercicio («Duplicar»).
 *
 * Por que existe: el catalogo de ejercicios NO tiene unique en DB sobre el nombre (ver
 * `supabase/migrations/00000000000001_baseline.sql`: solo indices btree no unicos
 * `idx_exercises_coach_muscle_name` / `idx_exercises_global_muscle_name`). La unicidad la impone
 * la aplicacion, con la MISMA regla en las tres superficies de escritura: un `ilike` sobre `name`
 * scopeado al owner (coach / team / org). Es decir: comparacion CASE-INSENSITIVE y sin acentos
 * plegados. Este helper replica exactamente ese criterio en memoria para elegir un nombre que
 * el dup-check vaya a aceptar.
 *
 * Antes, duplicar copiaba el nombre TAL CUAL: duplicar un ejercicio propio chocaba siempre con
 * su original y la action devolvia «Ya existe un ejercicio con ese nombre.» — el boton
 * «Duplicar» era inservible sobre lo propio.
 *
 * Puro: sin React / Supabase / Next / RN. Lo consumen la Server Action de web
 * (`coach/exercises/_actions/exercises.actions.ts`) y RN (`apps/mobile/lib/exercises.ts`).
 */

/** Tope de `exerciseSchema` (create/update de web). El clon respeta el mismo techo para que el
 *  nombre resultante siga siendo editable en el formulario. La columna en DB es `text` (sin tope). */
export const EXERCISE_NAME_MAX_LENGTH = 100

/**
 * Sufijo «(copia)» / «(copia N)» al final del nombre. Se acepta cualquier capitalizacion porque
 * el dup-check es case-insensitive y el coach puede haber renombrado a mano.
 */
const COPY_SUFFIX_RE = /\s*\(\s*copia(?:\s+\d+)?\s*\)\s*$/i

/** Clave de comparacion: espeja el `ilike` de Postgres (case-insensitive, espacios recortados). */
function nameKey(name: string): string {
    return name.trim().toLowerCase()
}

/**
 * Quita los sufijos de copia del final del nombre, para que duplicar «Press banca (copia)» de
 * «Press banca (copia 2)» y no «Press banca (copia) (copia)». Se saca en bucle porque en prod ya
 * hay nombres con el sufijo repetido (los creo la version anterior de RN, que lo concatenaba a ciegas).
 * Si el nombre era SOLO el sufijo, devuelve el original recortado (nunca cadena vacia).
 */
export function stripExerciseCopySuffix(name: string): string {
    let out = name.trim()
    while (COPY_SUFFIX_RE.test(out)) {
        const next = out.replace(COPY_SUFFIX_RE, '').trim()
        if (!next) break
        out = next
    }
    return out
}

/** «Base (copia)» para el primer intento, «Base (copia N)» a partir del segundo. */
function buildCandidate(base: string, index: number, maxLength: number): string {
    const suffix = index === 1 ? ' (copia)' : ` (copia ${index})`
    const room = Math.max(1, maxLength - suffix.length)
    const trimmedBase = base.length > room ? base.slice(0, room).trimEnd() : base
    return `${trimmedBase}${suffix}`
}

/**
 * Primer nombre libre de la serie «{base} (copia)», «{base} (copia 2)», «{base} (copia 3)», …
 *
 * @param sourceName  Nombre del ejercicio de origen (se le quita un sufijo de copia previo).
 * @param existingNames Nombres YA ocupados en el catalogo del owner. Deben venir SIN filtrar por
 *   `deleted_at`: el dup-check de create/update tampoco excluye los soft-deleted, asi que un
 *   nombre "libre" que choque con uno borrado volveria a fallar en el insert.
 * @param options.maxLength Tope de largo del resultado (default 100, el de `exerciseSchema`).
 *
 * Termina siempre: cada indice produce un candidato distinto, asi que entre los primeros
 * `ocupados + 1` hay al menos uno libre.
 */
export function resolveExerciseCopyName(
    sourceName: string,
    existingNames: Iterable<string | null | undefined>,
    options: { maxLength?: number } = {}
): string {
    const maxLength = Math.max(8, options.maxLength ?? EXERCISE_NAME_MAX_LENGTH)
    const taken = new Set<string>()
    for (const name of existingNames) {
        if (typeof name !== 'string') continue
        const key = nameKey(name)
        if (key) taken.add(key)
    }

    const base = stripExerciseCopySuffix(sourceName)
    const limit = taken.size + 1
    let candidate = buildCandidate(base, 1, maxLength)
    for (let index = 1; index <= limit; index += 1) {
        candidate = buildCandidate(base, index, maxLength)
        if (!taken.has(nameKey(candidate))) return candidate
    }
    return candidate
}
