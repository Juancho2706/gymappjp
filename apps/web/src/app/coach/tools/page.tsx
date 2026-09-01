import { redirect } from 'next/navigation'
import { FUNCIONES_PATH } from '@/lib/domain-off'

/**
 * W3.2/W4.3 (Ola de orden): el launcher vive en Funciones — cada área prendida tiene ahí su botón
 * «Abrir». La ruta queda como redirect porque hay links vivos afuera del repo.
 */
export default function CoachToolsRedirectPage() {
    redirect(FUNCIONES_PATH)
}
