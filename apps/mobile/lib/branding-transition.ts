/**
 * Hace explícito el invariante de navegación: la memoria viva cambia antes que la caché.
 * Persistir es best-effort; un fallo de almacenamiento no debe devolver el login a branding nulo.
 */
export async function commitResolvedBranding<T>(
  branding: T,
  setBranding: (value: T) => void,
  persistBranding: (value: T) => Promise<void>,
): Promise<void> {
  setBranding(branding)
  try {
    await persistBranding(branding)
  } catch {
    // La caché conserva continuidad entre arranques, pero no concede acceso ni bloquea el actual.
  }
}
