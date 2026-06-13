/**
 * Columnas explícitas para listados de catálogo (evita `select('*')`).
 * Debe ser un literal para que el cliente tipado de Supabase valide el `.select()`.
 */
export const EXERCISE_CATALOG_COLUMNS =
    'id, coach_id, org_id, team_id, exercise_type, name, muscle_group, equipment, difficulty, gender_focus, body_part, gif_url, image_url, video_url, instructions, secondary_muscles, deleted_at, source, created_at' as const

/**
 * Columnas para LISTAS / selectores de ejercicios (p. ej. el picker drag&drop del builder).
 * Igual a EXERCISE_CATALOG_COLUMNS pero SIN los blobs que una lista nunca renderiza:
 *  - `instructions` (array de pasos, el payload más pesado del catálogo)
 *  - `image_url` (media alterna que el selector no muestra)
 * Se mantienen `gif_url`/`video_url` porque la miniatura de la lista los usa, y
 * `secondary_muscles`/`body_part` porque `filterExercises()` busca sobre ellos
 * (no cambiar la forma/comportamiento del filtro). Para vistas de detalle/edición
 * que sí necesitan instructions/image_url, usar EXERCISE_CATALOG_COLUMNS.
 * Debe ser un literal para que el cliente tipado de Supabase valide el `.select()`.
 */
export const EXERCISE_LIST_COLUMNS =
    'id, coach_id, org_id, team_id, exercise_type, name, muscle_group, equipment, difficulty, gender_focus, body_part, gif_url, video_url, secondary_muscles, deleted_at, source, created_at' as const
