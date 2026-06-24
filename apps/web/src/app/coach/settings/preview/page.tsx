import { redirect } from 'next/navigation'

/**
 * La vista previa de marca se consolidó en el editor (`/coach/settings/brand`):
 * preview en vivo (columna sticky) + botón "Expandir vista" a pantalla completa,
 * que refleja lo que el coach está editando (no el estado guardado en DB).
 *
 * Esta ruta queda como redirect por compatibilidad (link de onboarding, bookmarks,
 * guard de workspace que la gatea para team). Ya no renderiza un preview propio.
 */
export default function PreviewPage() {
    redirect('/coach/settings/brand')
}
