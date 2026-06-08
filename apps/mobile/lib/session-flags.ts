/**
 * Flags efímeros de sesión (en memoria, no persisten). Ola 0.
 * Evitan loops de gates: p.ej. tras cambiar la contraseña forzada, el gate de
 * force_password_change no debe volver a redirigir aunque la limpieza del flag
 * en DB falle por RLS (la limpieza definitiva es server-side, pendiente).
 */
export const sessionFlags = {
  pwChanged: false,
}
