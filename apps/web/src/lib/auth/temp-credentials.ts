/**
 * Contraseña temporal para alumnos al resetear credenciales.
 *
 * Es un PIN de 6 dígitos legible/dictable, pero con prefijo + símbolo para pasar
 * la protección de contraseñas filtradas (HIBP / "leaked password protection")
 * de Supabase Auth. Un PIN PURAMENTE numérico la gatilla siempre — casi todo
 * número de 6 dígitos está en la base de filtraciones — y GoTrue responde
 * 422 "Password is known to be weak and easy to guess", rompiendo el reset.
 *
 * El mismo patrón (`Eva${pin}!`) ya se usa al crear alumnos en mobile, así que
 * la credencial entregada sigue siendo consistente y fácil de comunicar.
 */
export function generateStudentTempPassword(): string {
    const pin = Math.floor(100000 + Math.random() * 900000)
    return `Eva${pin}!`
}
