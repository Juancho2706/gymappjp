import { redirect } from 'next/navigation'
import { FUNCIONES_PATH } from '@/lib/domain-off'

/**
 * W3.2/W4.3 (Ola de orden): el catálogo vive en Funciones. La ruta queda como redirect porque
 * hay links vivos afuera del repo (correos, guías, marcadores del coach).
 */
export default function CoachModulesRedirectPage() {
    redirect(FUNCIONES_PATH)
}
