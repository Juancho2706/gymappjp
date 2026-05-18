/**
 * Columnas explícitas para listados de catálogo (evita `select('*')`).
 * Debe ser un literal para que el cliente tipado de Supabase valide el `.select()`.
 */
export const EXERCISE_CATALOG_COLUMNS =
    'id, coach_id, name, muscle_group, equipment, difficulty, gender_focus, body_part, gif_url, video_url, instructions, secondary_muscles, created_at' as const
