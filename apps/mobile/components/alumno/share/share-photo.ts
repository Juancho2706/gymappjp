import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

/**
 * Share Entreno (F2) — las dos fuentes de foto del canvas (cámara y galería).
 *
 * Devuelven el `uri` elegido o `null` en TODOS los caminos de no-foto (permiso denegado, cancelación
 * del usuario, picker sin assets): el composer solo tiene que preguntar "¿hay foto?", sin distinguir
 * casos que para la UI son el mismo.
 *
 * SIN `allowsEditing` a propósito. El canvas ya recorta con `contentFit:'cover'` en 9:16, así que el
 * crop del picker sería un segundo recorte encima; y en Android `allowsEditing` sin `aspect` abre un
 * recortador libre que devuelve cualquier proporción (el alumno recorta cuadrado, el canvas vuelve a
 * recortar y la cabeza queda fuera). El recorte real lo hace el encuadre del card, una sola vez.
 *
 * REGLA App Review 5.1.1(iv) — «pantalla pre-permiso»: el diálogo del sistema NO puede ser lo primero
 * que ve el usuario. La pantalla explicativa con el botón «Continuar» la pone el EDITOR (F3) antes de
 * llamar a `takeSharePhoto`; estas funciones asumen que esa pantalla ya se mostró. Sin foto no hay
 * degradación de producto: el canvas cae a fondo de marca.
 *
 * La foto NUNCA sube a Supabase: se compone on-device y el PNG se limpia tras compartir (PLAN
 * §Privacidad).
 */

/**
 * Cámara. Frontal por defecto: el gesto post-entreno es la selfie del espejo — abrir en trasera
 * obligaba a voltear SIEMPRE. `cameraType` es solo el estado inicial; el usuario voltea en la UI
 * nativa de la cámara si quiere fotografiar otra cosa.
 */
export async function takeSharePhoto(): Promise<string | null> {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara para tomar la foto.')
        return null
    }
    const result = await ImagePicker.launchCameraAsync({
        quality: 1,
        cameraType: ImagePicker.CameraType.front,
        mediaTypes: ['images'],
    })
    if (result.canceled || !result.assets[0]) return null
    return result.assets[0].uri
}

/** Galería. Mismo contrato que la cámara (permiso → picker → uri | null). */
export async function pickSharePhoto(): Promise<string | null> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para seleccionar una foto.')
        return null
    }
    const result = await ImagePicker.launchImageLibraryAsync({
        quality: 1,
        mediaTypes: ['images'],
    })
    if (result.canceled || !result.assets[0]) return null
    return result.assets[0].uri
}
