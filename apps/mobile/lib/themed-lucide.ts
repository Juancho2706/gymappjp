import { cssInterop } from 'nativewind'
import type { LucideIcon } from 'lucide-react-native'

const registered = new WeakSet<object>()

/**
 * RN no tiene `currentColor`: un icono de `lucide-react-native` IGNORA `className`
 * salvo que el componente esté registrado en nativewind para que una clase `text-*`
 * aterrice en su prop `color`. Sin ese registro el icono cae al default de lucide
 * (`currentColor` → negro), que en tema oscuro se ve casi invisible.
 *
 * Mismo mapping que `components/coach/programs/themed-icon.tsx` (que además envuelve)
 * y que el loop de `app/alumno/(tabs)/perfil.tsx`, pero como REGISTRO puro: las
 * pantallas siguen usando la referencia ORIGINAL del icono, así que también quedan
 * cubiertos los lookups dinámicos (`item.icon`, `tool.icon`, `action.icon`).
 *
 * Idempotente (WeakSet) → se puede llamar a nivel de módulo en varios archivos.
 */
export function themeLucideIcons(...icons: LucideIcon[]): void {
  for (const icon of icons) {
    const key = icon as unknown as object
    if (!key || registered.has(key)) continue
    registered.add(key)
    cssInterop(icon as never, {
      className: { target: 'style', nativeStyleToProp: { color: true } },
    })
  }
}
