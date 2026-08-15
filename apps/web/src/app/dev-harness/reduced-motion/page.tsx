import { notFound } from 'next/navigation'
import { ClientGreeting } from '../../c/[coach_slug]/dashboard/_components/header/ClientGreeting'

/**
 * HARNESS LOCAL (solo dev) — repro de EVA-NEXTJS-18: hydration mismatch de los componentes que
 * bifurcan su arbol con `useReducedMotion` de framer. Cargar con emulacion
 * `prefers-reduced-motion: reduce` y mirar la consola: antes del fix React tira el error de
 * hydration; con el hook seguro, consola limpia.
 */
export default function ReducedMotionHarnessPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return (
    <div className="p-10">
      <ClientGreeting greeting="Buenas noches, Harness" dateLabel="Viernes, 14 de agosto" />
      <p data-harness-ready>listo</p>
    </div>
  )
}
