/**
 * Columnas explícitas para listados de catálogo (evita `select('*')`).
 * Debe ser un literal para que el cliente tipado de Supabase valide el `.select()`.
 */
export const EXERCISE_CATALOG_COLUMNS =
    'id, coach_id, org_id, team_id, exercise_type, name, muscle_group, equipment, difficulty, gender_focus, body_part, gif_url, image_url, video_url, instructions, secondary_muscles, deleted_at, source, created_at' as const
