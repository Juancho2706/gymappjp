import { useCallback, useEffect, useRef, useState } from 'react'
import { Dimensions, Keyboard, Platform, TextInput } from 'react-native'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'

/** Aire entre el borde inferior del input enfocado y el tope del teclado. */
const KEYBOARD_GAP = 12

/**
 * Teclado sobre sheets con formulario (ExerciseFormSheet / BlockEditorSheet).
 *
 * POR QUÉ EXISTE (video del socio 23-08, Android): `android_keyboardInputMode="adjustResize"`
 * del BottomSheetModal es un NO-OP con el edge-to-edge de Expo 54 — la ventana no se encoge y
 * el teclado tapa los campos del fondo (Instrucciones/Notas). `automaticallyAdjustKeyboardInsets`
 * solo existe en iOS. Este hook es el patrón que ya vive en `QuickEditMode` («Notas para tu
 * alumno», QA owner 17-08) y `StepperExecution`: medir el teclado y devolverle ese alto al
 * scroll como padding, y scrollear el overlap del input ENFOCADO cuando el teclado ya tiene
 * métricas (`keyboardDidShow`) — scrollear en el `onFocus` es ~16 ms antes de que el teclado
 * exista y no hay nada que esquivar.
 *
 * Genérico a propósito: `TextInput.State.currentlyFocusedInput()` evita un ref por campo, así
 * cubre TODOS los inputs del sheet sin tocar los componentes compartidos Input/Textarea.
 * `onScroll` corre en el hilo JS (no worklet) — mismo criterio que QuickEditMode tras el crash
 * del 16-08.
 */
export function useSheetKeyboardInset(scrollRef: React.RefObject<{ scrollTo: (opts: { y: number; animated?: boolean }) => void } | null>) {
  const [inset, setInset] = useState(0)
  const offsetYRef = useRef(0)

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetYRef.current = e.nativeEvent.contentOffset.y
  }, [])

  useEffect(() => {
    const ensureFocusedVisible = () => {
      // Doble rAF: el padding del inset recién seteado debe estar aplicado antes de medir,
      // si no el scrollTo apunta a un contenido que todavía no tiene a dónde subir.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const node = TextInput.State.currentlyFocusedInput()
        const scroller = scrollRef.current
        if (!node || !scroller) return
        const keyboardTop = Keyboard.metrics()?.screenY ?? Dimensions.get('window').height
        node.measureInWindow((_x: number, y: number, _w: number, h: number) => {
          const overlap = y + h + KEYBOARD_GAP - keyboardTop
          if (overlap > 1) scroller.scrollTo({ y: Math.max(0, offsetYRef.current + overlap), animated: true })
        })
      }))
    }
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => setInset(event.endCoordinates?.height ?? 0),
    )
    // El scroll correctivo SIEMPRE con métricas reales (`didShow` en ambas plataformas).
    const scrollFix = Keyboard.addListener('keyboardDidShow', ensureFocusedVisible)
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setInset(0),
    )
    return () => {
      show.remove()
      scrollFix.remove()
      hide.remove()
    }
  }, [scrollRef])

  return { keyboardInset: inset, onScroll }
}
