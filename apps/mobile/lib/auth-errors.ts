/** Traduce errores crudos de Supabase Auth (en inglés) a copy accionable en español (es-CL). */
export function translateAuthError(raw?: string | null): string {
  const m = (raw ?? '').toLowerCase()
  if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos.'
  if (m.includes('email not confirmed')) return 'Confirma tu email antes de entrar.'
  if (m.includes('too many') || m.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos.'
  if (m.includes('network') || m.includes('failed to fetch') || m.includes('fetch')) return 'Sin conexión. Revisa tu internet.'
  if (m.includes('user not found') || m.includes('no user')) return 'No encontramos una cuenta con ese email.'
  if (m.includes('password')) return 'Contraseña inválida.'
  return raw || 'No se pudo iniciar sesión.'
}
