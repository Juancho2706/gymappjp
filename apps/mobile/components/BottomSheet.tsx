import { forwardRef, useImperativeHandle, useState } from 'react'
import type { ReactNode } from 'react'
import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { Sheet } from './Sheet'

/**
 * @deprecated Boundary shim. Use the canonical `Sheet` (declarative
 * `open`/`onClose`) instead. This wrapper survives only so existing imperative
 * callers (`ref.current?.expand()` / `.close()`) keep working while screens
 * migrate. It bridges the old @gorhom imperative ref onto `Sheet`'s controlled
 * `open` state.
 *
 * Notable change vs the old implementation: the title now renders in the DS
 * display face (Archivo) via `Sheet` — the hardcoded Montserrat title is gone.
 *
 * Do NOT add new consumers of this component.
 */
interface BottomSheetProps {
  title?: string
  children: ReactNode
  snapPoints?: string[]
}

export const BottomSheet = forwardRef<BottomSheetModal, BottomSheetProps>(function BottomSheet(
  { title, children, snapPoints },
  ref
) {
  const [open, setOpen] = useState(false)

  // Expose the subset of @gorhom's BottomSheetModal surface that legacy callers
  // use (expand/close/present/dismiss/…), each mapped to the controlled state.
  useImperativeHandle(
    ref,
    () =>
      ({
        present: () => setOpen(true),
        expand: () => setOpen(true),
        snapToIndex: () => setOpen(true),
        snapToPosition: () => setOpen(true),
        collapse: () => setOpen(false),
        close: () => setOpen(false),
        dismiss: () => setOpen(false),
        forceClose: () => setOpen(false),
      }) as unknown as BottomSheetModal,
    []
  )

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title={title} snapPoints={snapPoints}>
      {children}
    </Sheet>
  )
})
