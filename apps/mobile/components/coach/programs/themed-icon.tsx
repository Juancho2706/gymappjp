import { cssInterop } from 'nativewind'
import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react-native'

/** lucide-react-native icon shape — color driven via a text-color className. */
export type ThemedIcon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

const cache = new WeakMap<object, ThemedIcon>()

/**
 * Wrap a lucide-react-native icon so a `text-*` className drives its `color`
 * (RN has no `currentColor`). Same technique as `components/DropdownMenu.tsx`:
 * keeps icon color on DS tokens (brand + light/dark aware at runtime) instead of
 * reading the frozen `theme` shim. Cached per icon so each is configured once.
 */
export function themedIcon(Icon: LucideIcon): ThemedIcon {
  const key = Icon as unknown as object
  let wrapped = cache.get(key)
  if (!wrapped) {
    wrapped = cssInterop(Icon as never, {
      className: { target: 'style', nativeStyleToProp: { color: true } },
    }) as ThemedIcon
    cache.set(key, wrapped)
  }
  return wrapped
}
